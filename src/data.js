/**
 * Client data layer (contract v1.1).
 *
 * Everything is loaded at runtime from the published JSON so the brand,
 * country list, model list and FX rates are configuration — not code:
 *   data/markets.json  brands + countries + retailers
 *   data/models.json   models actually observed on sale per market
 *   data/latest.json   normalized price records + fx + failedSources
 *   data/fx.json       dated USD rates (USD per 1 local unit)
 *   data/specs.json    modelId -> researched product specs (optional)
 *   data/history.json  aggregated real weekly history (optional)
 *
 * All seven files are optional at runtime: a failed fetch is recorded in
 * `dataInfo.errors` and never fatal, so the app keeps working while an
 * artifact is missing.
 *
 * NOTE: helpers are exported for unit tests and must not touch `window` or
 * `import.meta.env` at module scope (the Playwright test imports this file in
 * plain Node).
 */
const BASE = (() => {
  try {
    return import.meta.env?.BASE_URL ?? "/";
  } catch {
    return "/";
  }
})();

/**
 * Documented automatic collection cadence, in minutes (WEEKLY-CONTRACT §1/C1).
 *
 * SINGLE SOURCE OF TRUTH for the client promise: the banner prints it, the
 * next-refresh estimate is derived from it, and the staleness threshold is
 * derived from it. It MUST match the cron in `.github/workflows/collect.yml`
 * (`17 3 * * 1`, i.e. every Monday 03:17 UTC).
 */
export const COLLECT_CADENCE_MINUTES = 10080; // 7 days

/** Fixed weekly schedule; one source of truth for the cron and the banner. */
export const COLLECT_SCHEDULE = {
  weekday: 1, // ISO weekday, Monday
  hourUtc: 3,
  minuteUtc: 17,
  label: "每周一 03:17 UTC",
};

/** Warn once the feed is older than the weekly cadence plus 1 day of grace. */
export const STALE_AFTER_MINUTES = 10080 + 1440;
/** FX older than a week is treated as degraded, never silently reused as current. */
export const FX_STALE_AFTER_DAYS = 7;

/** Human span for the documented cadence, e.g. "1 周" / "3 天" / "2 小时" / "45 分钟". */
function cadenceSpan() {
  const minutes = COLLECT_CADENCE_MINUTES;
  if (minutes % 10080 === 0) return `${minutes / 10080} 周`;
  if (minutes % 1440 === 0) return `${minutes / 1440} 天`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}

/** Short human cadence, e.g. "每周一" (weekly contract §1). */
export function cadenceShort() {
  return "每周一";
}

/** Banner copy for the documented cadence: "每周一 03:17 UTC 自动采集". */
export function cadenceLabel() {
  return `${COLLECT_SCHEDULE.label} 自动采集`;
}

/** Local-time rendering used by the freshness banner (zh-CN, 24h). */
export function localTime(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export const labels = {
  live: "正常",
  normal: "正常",
  promo: "促销",
  missing: "缺价 · 沿用",
  invalid: "来源失效 · 沿用",
  new: "首次采集",
  source: "来源变化",
  unavailable: "未在售",
};
export const anomaly = (s) => s === "missing" || s === "invalid" || s === "unavailable";
export const ALL = "all";

export function variantLabel(value) {
  if (value === ALL) return "全部容量";
  return value === "N/A" ? "容量未标注" : value;
}

export const channels = [
  { id: "official", name: "官方商城", color: "#16756a" },
  { id: "retail", name: "零售渠道", color: "#b16629" },
];

export function channelName(value) {
  if (value === ALL) return "全部渠道";
  return channels.find((channel) => channel.id === value)?.name ?? value;
}

export function channelShort(value) {
  if (value === "official") return "官方";
  if (value === "retail") return "零售";
  return channelName(value);
}

export let brands = [{ id: "samsung", name: "Samsung", series: ["Galaxy A", "Galaxy S"] }];
export let countries = [];
export let models = [];
export let retailers = [];
export let records = [];
export let weeks = defaultWeeks();
/** modelId -> researched spec object (WC §4). Empty until data/specs.json loads. */
export let specs = {};

/**
 * Real weekly points aggregated from `data/history.json` (WC §2): already
 * normalized to ISO Monday weeks and stripped of carried rows. Merged with
 * `records` by `history()` / `cell()`; `weeklyTrend()` uses only these.
 */
let historyPoints = [];

/** modelId -> Set(countryId) that actually list it. */
export const availability = {};

export const dataInfo = {
  contract: "1.1",
  mode: "empty",
  collectedAt: null,
  week: null,
  sourceCount: 0,
  verifiedProductCount: 0,
  failedSources: [],
  fx: { base: "USD", asOf: null, source: null, stale: true, rates: {} },
  loaded: false,
  errors: [],
};

/** ISO week start (Monday, UTC). */
export function weekStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Normalize any stored `week` value (older snapshots stamp the *collection
 * date*, e.g. "2026-09-20") to its ISO Monday week start. Returns `null` when
 * nothing usable is available — callers must drop such rows, never guess.
 */
export function normalizeWeek(value, fallback = null) {
  const candidate = /^\d{4}-\d{2}-\d{2}/.test(String(value ?? ""))
    ? String(value).slice(0, 10)
    : /^\d{4}-\d{2}-\d{2}/.test(String(fallback ?? ""))
      ? String(fallback).slice(0, 10)
      : null;
  if (!candidate) return null;
  const d = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return weekStart(d);
}

/** The ISO week immediately before `week` (7 days earlier), Monday-normalized. */
function weekBefore(week) {
  const d = new Date(`${String(week).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 7);
  return weekStart(d);
}

function defaultWeeks(count = 12) {
  const end = new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - (day - 1) - i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function getJson(file) {
  const res = await fetch(`${BASE}${file}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

const isSourcedRecord = (record) =>
  Boolean(record && record.sourceId && /^https?:/.test(String(record.sourceUrl || "")) && record.collectedAt);

/** States that are carried over from an earlier observation, never a real point. */
const CARRIED_STATES = new Set(["missing", "invalid", "unavailable"]);

/**
 * A "real" weekly observation: a sourced row with a positive price that was
 * actually observed in its week. Carried (`missing`/`invalid`) and
 * `unavailable` rows are never trend points (WC §0.1, §7 rule 3).
 */
function isRealObservation(row) {
  return Boolean(row) && Number.isFinite(row.price) && row.price > 0 && !CARRIED_STATES.has(row.state ?? "live");
}

export function recordKey(record) {
  return [record.country, record.brand, record.model, record.variant, record.channel, record.sourceId, record.week].join("|");
}

/** The current ISO week per the loaded feed (falls back to the wall clock). */
function currentWeekKey() {
  return normalizeWeek(dataInfo.week) ?? weekStart();
}

/** Which of two candidate rows wins the `(series, week)` slot (WC §3.1). */
function preferRow(a, b) {
  const realA = isRealObservation(a) ? 0 : 1;
  const realB = isRealObservation(b) ? 0 : 1;
  // 1) A real observation always beats a carried one (anti-fabrication).
  if (realA !== realB) return realA < realB;
  // 2) latest.json wins for the current week.
  const current = currentWeekKey();
  if (a.week === current && b.week === current) {
    const srcA = a.__source === "latest" ? 0 : 1;
    const srcB = b.__source === "latest" ? 0 : 1;
    if (srcA !== srcB) return srcA < srcB;
  }
  // 3) Newest collection wins, then the lowest verified price.
  const atA = Date.parse(a.collectedAt ?? "") || 0;
  const atB = Date.parse(b.collectedAt ?? "") || 0;
  if (atA !== atB) return atA > atB;
  const priceA = Number.isFinite(a.price) ? a.price : Infinity;
  const priceB = Number.isFinite(b.price) ? b.price : Infinity;
  if (priceA !== priceB) return priceA < priceB;
  return a.__source === "latest" && b.__source !== "latest";
}

/**
 * Merge `latest.json` records with the aggregated `history.json` points into at
 * most one row per `(country, model, channel, variant, ISO week)`, with `week`
 * normalized to the ISO Monday. This is what makes week-over-week deltas real.
 */
function mergedRows() {
  const byKey = new Map();
  const candidates = [
    ...records.map((record) => ({ ...record, __source: "latest" })),
    ...historyPoints.map((point) => ({ ...point, __source: "history" })),
  ];
  for (const row of candidates) {
    const week = normalizeWeek(row.week, row.collectedAt);
    if (!week) continue; // unplaceable row: dropped, never guessed into a week
    const normalized = week === row.week ? row : { ...row, week };
    const key = [normalized.country, normalized.model, normalized.channel, normalized.variant, week].join("|");
    const existing = byKey.get(key);
    if (!existing || preferRow(normalized, existing)) byKey.set(key, normalized);
  }
  return [...byKey.values()].sort((a, b) => String(a.week).localeCompare(String(b.week)));
}

function setWeeks() {
  const present = new Set();
  for (const record of records) {
    const week = normalizeWeek(record.week, record.collectedAt);
    if (week) present.add(week);
  }
  for (const point of historyPoints) if (point.week) present.add(point.week);
  const merged = new Set([...defaultWeeks(), ...present]);
  weeks = [...merged].sort();
}

/** Validate + normalize a `data/history.json` payload into real weekly points. */
function applyHistoryPoints(payload) {
  const raw = Array.isArray(payload?.points) ? payload.points : [];
  const out = [];
  for (const point of raw) {
    if (!isSourcedRecord(point)) continue;
    const week = normalizeWeek(point.week);
    const price = Number(point.price);
    const state = point.state ?? "live";
    if (!week || !Number.isFinite(price) || price <= 0) continue;
    if (state !== "live" && state !== "promo") continue; // carried rows are not history
    // WC §2 rule 7: brand/series are real collected fields carried verbatim (never
    // inferred) so historical ids absent from models.json stay filterable; legacy
    // rows without them stay null and can only be attributed via models.json.
    out.push({
      ...point,
      week,
      price,
      state,
      brand: point.brand ?? null,
      series: point.series ?? null,
    });
  }
  return out;
}

/** Validate a `data/specs.json` payload into the modelId -> spec map. */
function applySpecs(payload) {
  const source = payload && typeof payload === "object" && payload.models && typeof payload.models === "object" ? payload.models : null;
  if (!source) return {};
  const out = {};
  for (const [modelId, spec] of Object.entries(source)) {
    if (spec && typeof spec === "object" && !Array.isArray(spec)) out[modelId] = spec;
  }
  return out;
}

/**
 * Recompute `priceUsd` from the published rates (WC §3.1 addendum, `priceUsd` is
 * documented as `round(price × fx.rates[currency], 2)`). A missing or non-finite
 * rate leaves the stored value untouched: real published data is already `null`
 * there and fixture values must not be nulled.
 */
function normalizePriceUsd(rows) {
  const rates = dataInfo.fx?.rates ?? {};
  for (const row of rows) {
    const rate = rates?.[row.currency];
    if (!Number.isFinite(rate) || !Number.isFinite(row.price)) continue;
    row.priceUsd = Math.round(row.price * rate * 100) / 100;
  }
}

/** Apply already-parsed payloads. Exported so tests can hydrate from disk. */
export function hydrate({
  markets = null,
  models: modelCfg = null,
  latest = null,
  fx: fxFile = null,
  specs: specsFile = null,
  history: historyFile = null,
  errors = [],
} = {}) {
  if (markets?.countries?.length) {
    countries = markets.countries;
    if (markets.brands?.length) brands = markets.brands;
    if (markets.channels?.length) {
      channels.splice(
        0,
        channels.length,
        ...markets.channels.map((c, i) => ({ ...c, color: c.color ?? channels[i % channels.length]?.color ?? "#16756a" })),
      );
    }
    retailers = countries.flatMap((c) => (c.retailers ?? []).map((r) => ({ ...r, country: c.id, countryName: c.name })));
  }

  if (latest?.records?.length) {
    records = latest.records.filter(isSourcedRecord);
  } else {
    records = [];
  }

  if (modelCfg?.models?.length) {
    models = modelCfg.models.map((m) => ({
      id: m.id,
      name: m.name,
      series: m.series,
      brandId: m.brandId ?? "samsung",
      variants: m.variants?.length ? m.variants : ["N/A"],
    }));
    for (const key of Object.keys(availability)) delete availability[key];
    for (const m of modelCfg.models) {
      for (const countryId of Object.keys(m.countries ?? {})) {
        if (m.countries[countryId]?.available === false) continue;
        (availability[countryId] ??= new Set()).add(m.id);
      }
    }
  } else {
    // Derive a model list from the records we do have.
    const map = new Map();
    for (const r of records) {
      const entry = map.get(r.model) ?? { id: r.model, name: r.modelName ?? `Galaxy ${r.model}`, series: r.series, variants: new Set() };
      if (r.variant) entry.variants.add(r.variant);
      map.set(r.model, entry);
    }
    models = [...map.values()].map((m) => ({ ...m, variants: [...m.variants].sort() }));
  }

  const fx = latest?.fx ?? (fxFile ? { base: fxFile.base, asOf: fxFile.asOf, source: fxFile.source, stale: fxFile.stale, rates: fxFile.rates } : dataInfo.fx);
  specs = applySpecs(specsFile);
  historyPoints = applyHistoryPoints(historyFile);
  Object.assign(dataInfo, {
    contract: latest?.apiVersion ?? "1.1",
    mode: latest?.mode ?? "empty",
    collectedAt: latest?.collectedAt ?? null,
    week: latest?.week ?? null,
    sourceCount: latest?.sourceCount ?? 0,
    verifiedProductCount: latest?.verifiedProductCount ?? 0,
    failedSources: latest?.failedSources ?? [],
    fx: { base: "USD", asOf: null, source: null, stale: false, rates: {}, ...(fx ?? {}) },
    loaded: true,
    errors,
  });

  // WC §3.1 addendum: displayed USD is a function of the PUBLISHED rates, so a
  // stored priceUsd computed under an older rate (history.json points) must not
  // win at display time. Rows whose currency has no published rate keep their
  // stored value untouched — never forced to null.
  normalizePriceUsd(records);
  normalizePriceUsd(historyPoints);

  setWeeks();
  return errors;
}

/** Load markets/models/latest/fx/specs/history. Failures are recorded, never fatal. */
export async function loadRemoteRecords() {
  const errors = [];
  const [markets, modelCfg, latest, fxFile, specsFile, historyFile] = await Promise.all([
    getJson("data/markets.json").catch((e) => (errors.push(String(e.message)), null)),
    getJson("data/models.json").catch((e) => (errors.push(String(e.message)), null)),
    getJson("data/latest.json").catch((e) => (errors.push(String(e.message)), null)),
    getJson("data/fx.json").catch((e) => (errors.push(String(e.message)), null)),
    getJson("data/specs.json").catch((e) => (errors.push(String(e.message)), null)),
    getJson("data/history.json").catch((e) => (errors.push(String(e.message)), null)),
  ]);
  hydrate({ markets, models: modelCfg, latest, fx: fxFile, specs: specsFile, history: historyFile, errors });
  return errors.length === 0;
}

const FLAG_EMOJI = {
  tr: "🇹🇷", sa: "🇸🇦", ae: "🇦🇪", qa: "🇶🇦", om: "🇴🇲", jo: "🇯🇴", kw: "🇰🇼", eg: "🇪🇬", bh: "🇧🇭",
};

/** Emoji flag fallback for markets without a PNG asset. */
export function flagEmoji(countryId) {
  return FLAG_EMOJI[countryId] ?? String(countryId ?? "").toUpperCase();
}

/* ------------------------------ lookups -------------------------------- */

/**
 * One row per ISO week for a (country, model, channel, variant) cell, merged
 * from `latest.json` + `history.json`. When several retailers/channels/variants
 * cover the same combination we keep the lowest verified price for that week,
 * preferring a real record over a carried one, so the cell is well-defined and
 * the trend is consistent.
 */
function rowsFor(country, model, channel, variant) {
  const matched = mergedRows().filter(
    (r) =>
      r.country === country &&
      r.model === model &&
      (channel === ALL || r.channel === channel) &&
      (variant === ALL || variant == null || r.variant === variant),
  );
  const rank = (r) => (isRealObservation(r) ? 0 : r.state === "unavailable" ? 2 : 1);
  const byWeek = new Map();
  for (const row of matched) {
    const current = byWeek.get(row.week);
    if (!current) {
      byWeek.set(row.week, row);
      continue;
    }
    const better =
      rank(row) < rank(current) ||
      (rank(row) === rank(current) && Number.isFinite(row.price) && (!Number.isFinite(current.price) || row.price < current.price));
    if (better) byWeek.set(row.week, row);
  }
  return [...byWeek.values()].sort((a, b) => String(a.week).localeCompare(String(b.week)));
}

export function isAvailable(country, model, channel) {
  const set = availability[country];
  if (set) return set.has(model);
  return rowsFor(country, model, channel).length > 0;
}

function hasPrice(record) {
  return Number.isFinite(record?.price) && record?.state !== "unavailable";
}

/** Explain which other variant/channel has a verified price for this cell. */
export function availabilityHint(country, model, channel, variant, week = weeks.at(-1)) {
  const candidates = records.filter(
    (record) =>
      record.country === country &&
      record.model === model &&
      String(record.week) <= String(week) &&
      hasPrice(record),
  );
  if (!candidates.length) return null;

  const selected = candidates.some(
    (record) =>
      (channel === ALL || record.channel === channel) &&
      (variant === ALL || record.variant === variant),
  );
  if (selected) return null;

  const combinations = [...new Map(
    candidates.map((record) => [
      `${record.channel}|${record.variant}`,
      `${channelShort(record.channel)} · ${variantLabel(record.variant)}`,
    ]),
  ).values()];
  if (!combinations.length) return null;
  if (combinations.length === 1) return `仅${combinations[0]}`;
  const visible = combinations.slice(0, 3).join("；");
  return `可选：${visible}${combinations.length > 3 ? "等" : ""}`;
}

/** The value shown for a cell at `week`, with carry-forward clearly marked. */
export function cell(country, model, channel, variant, week = weeks.at(-1)) {
  const rows = rowsFor(country, model, channel, variant);
  const atOrBefore = rows.filter((r) => String(r.week) <= String(week) && hasPrice(r));
  const unavailable = () => ({
    value: null,
    priceUsd: null,
    state: "unavailable",
    delta: null,
    percent: null,
    effectiveDate: null,
    carried: false,
    sourceUrl: null,
    sourceId: null,
    collectedAt: null,
    currency: currencyOf(country),
    channel: null,
    variant: null,
    availabilityHint: availabilityHint(country, model, channel, variant, week),
  });
  if (!atOrBefore.length) return unavailable();

  const current = atOrBefore.at(-1);
  const isCurrentWeek = String(current.week) === String(week);
  const state = isCurrentWeek ? current.state ?? "live" : "missing";
  // Deltas require two REAL observations in adjacent ISO weeks; a carried row or
  // a multi-week gap yields null (never an interpolation, WC §3.1/§7).
  const previousWeek = isCurrentWeek && isRealObservation(current) ? weekBefore(current.week) : null;
  const previous = previousWeek ? rows.find((r) => r.week === previousWeek && isRealObservation(r)) ?? null : null;
  const delta = previous && Number.isFinite(previous.price) && Number.isFinite(current.price) ? current.price - previous.price : null;
  return {
    value: Number.isFinite(current.price) ? current.price : null,
    priceUsd: Number.isFinite(current.priceUsd) ? current.priceUsd : null,
    previous: previous && Number.isFinite(previous.price) ? previous.price : null,
    state,
    carried: !isCurrentWeek,
    delta,
    percent: delta != null && previous?.price ? (delta / previous.price) * 100 : null,
    effectiveDate: current.effectiveDate ?? current.week,
    week: current.week,
    currency: current.currency ?? currencyOf(country),
    sourceUrl: current.sourceUrl ?? null,
    sourceId: current.sourceId ?? null,
    collectedAt: current.collectedAt ?? null,
    channel: current.channel ?? null,
    variant: current.variant ?? null,
    availabilityHint: null,
  };
}

/**
 * Weekly series: one point per ISO week, merged from `latest.json` records and
 * the aggregated `history.json` points (no interpolation, gaps stay gaps).
 * Carried rows stay visible with `carried: true` but never seed a trend point
 * (WC §3.1); `weeklyTrend()` and `cell()` deltas ignore them.
 */
export function history(country, model, channel, variant, until = weeks.at(-1)) {
  return rowsFor(country, model, channel, variant)
    .filter((r) => String(r.week) <= String(until))
    .map((r) => ({
      week: r.week,
      value: Number.isFinite(r.price) ? r.price : null,
      priceUsd: Number.isFinite(r.priceUsd) ? r.priceUsd : null,
      state: r.state ?? "live",
      carried: r.state === "missing" || r.state === "invalid",
      effectiveDate: r.effectiveDate ?? r.week,
      currency: r.currency ?? currencyOf(country),
      sourceId: r.sourceId ?? null,
      sourceUrl: r.sourceUrl ?? null,
      collectedAt: r.collectedAt ?? null,
      channel: r.channel ?? null,
      variant: r.variant ?? null,
      rawEvidence: r.rawEvidence ?? null,
    }));
}

/** Trend points for a chart, optionally in USD. */
export function trend(country, model, channel, variant, { usd = false, until = weeks.at(-1) } = {}) {
  return history(country, model, channel, variant, until).map((row) => ({
    ...row,
    plot: usd ? row.priceUsd : row.value,
  }));
}

/* ---------------------------- specs (WC §3/§4) --------------------------- */

/** The researched spec object for a model, or `null` when none is published. */
export function specOf(modelId) {
  if (modelId == null) return null;
  return specs[modelId] ?? null;
}

const specValueSort = (a, b) => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true });
};

/** Sorted distinct non-null values published for a spec field (arrays flattened). */
export function specValues(field) {
  const out = new Set();
  for (const spec of Object.values(specs)) {
    if (!spec || typeof spec !== "object") continue;
    const raw = spec[field];
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      if (value == null || value === "") continue;
      out.add(value);
    }
  }
  return [...out].sort(specValueSort);
}

/** True once a non-empty `data/specs.json` has been applied. */
export function specsLoaded() {
  return Object.keys(specs).length > 0;
}

/* ----------------------- weekly trend (WC §3.2/§3.3) --------------------- */

/** Flat band: ±0.5%. `pct` is a FRACTION (WC §3.2: `pct = (p_w − p_{w−1}) / p_{w−1}`). */
const TREND_FLAT_THRESHOLD = 0.005;
/** A week-over-week move beyond ±50% is reported as suspect, never deleted (A2). */
const TREND_SUSPECT_THRESHOLD = 0.5;
const TREND_DEFAULT_LIMIT = 12;

const unrestricted = (value) => value == null || value === "" || value === ALL;
const sameText = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const nearest = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const numberMatches = (actual, wanted) => {
  const a = nearest(actual);
  if (a == null) return false;
  const w = nearest(wanted);
  if (w == null) return sameText(actual, wanted);
  return Math.abs(a - w) < 1e-6;
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function modelMeta(modelId) {
  return models.find((m) => m.id === modelId) ?? null;
}

/** Caller filters narrow the scope only when explicitly set (A1). */
function inTrendScope(row, scope) {
  if (!unrestricted(scope.country) && row.country !== scope.country) return false;
  if (!unrestricted(scope.channel) && row.channel !== scope.channel) return false;
  if (!unrestricted(scope.variant) && row.variant !== scope.variant) return false;
  if (unrestricted(scope.brand) && unrestricted(scope.series)) return true;
  const meta = modelMeta(row.model);
  const brandId = meta?.brandId ?? row.brand;
  const series = meta?.series ?? row.series;
  if (!unrestricted(scope.brand) && !sameText(brandId, scope.brand) && !sameText(row.brand, scope.brand)) return false;
  if (!unrestricted(scope.series) && !sameText(series, scope.series) && !sameText(row.series, scope.series)) return false;
  return true;
}

function specFilterActive(scope) {
  return !unrestricted(scope.screenInches) || !unrestricted(scope.batteryMah) || !unrestricted(scope.storage);
}

/** `ok` | `noSpec` (no spec entry) | `missingSpec` (entry lacks the field) | `mismatch`. */
function specVerdict(modelId, scope) {
  const spec = specOf(modelId);
  if (!spec) return "noSpec";
  if (!unrestricted(scope.screenInches)) {
    if (spec.screenInches == null || spec.screenInches === "") return "missingSpec";
    if (!numberMatches(spec.screenInches, scope.screenInches)) return "mismatch";
  }
  if (!unrestricted(scope.batteryMah)) {
    if (spec.batteryMah == null || spec.batteryMah === "") return "missingSpec";
    if (!numberMatches(spec.batteryMah, scope.batteryMah)) return "mismatch";
  }
  if (!unrestricted(scope.storage)) {
    const list = Array.isArray(spec.storage) ? spec.storage.filter((v) => v != null && v !== "") : [];
    if (!list.length) return "missingSpec";
    if (!list.some((v) => sameText(v, scope.storage) || numberMatches(v, scope.storage))) return "mismatch";
  }
  return "ok";
}

/**
 * Frozen weekly aggregation (WC §3.2, amended by §3.3 A1–A3).
 *
 * `pct` / `medianPct` / `summary.topGainers[].pct` / `suspects[].pct` are
 * FRACTIONS (0.0123 = +1.23%), per the contract's `pct = (p_w − p_{w−1}) / p_{w−1}`
 * and `index(w) = index(prev) × (1 + medianPct(w))`. Multiply by 100 to display.
 *
 * The aggregation runs over every real weekly point in the merged history —
 * including historical model ids that are absent from `models.json` (A1).
 * Weeks with fewer than 3 matched series get `medianPct: null` / `index: null`
 * (a gap, never a guess); carried rows are excluded entirely.
 *
 * `summary.suspects` / `topGainers` / `topLosers` entries carry both the machine
 * values (`variant`/`channel`, possibly `all`) and human-facing labels
 * (`variantLabel`/`channelLabel`, e.g. "全部容量"/"全部渠道") so Chinese UI copy
 * never has to render a raw `all`.
 */
export function weeklyTrend(scope = {}) {
  const s = scope ?? {};
  const limit = Number.isFinite(s.limit) && s.limit > 0 ? Math.floor(s.limit) : TREND_DEFAULT_LIMIT;
  const excluded = { missingSpec: 0, noSpec: 0 };
  const all = mergedRows();

  const until =
    normalizeWeek(s.until) ??
    [normalizeWeek(dataInfo.week), all.length ? all[all.length - 1].week : null]
      .filter(Boolean)
      .sort()
      .at(-1) ??
    null;

  let rows = all.filter((row) => isRealObservation(row) && inTrendScope(row, s));
  if (until) rows = rows.filter((row) => String(row.week) <= String(until));

  // Spec filters drop models, but count them so the UI never hides a model
  // silently (WC §3.2, §5).
  if (specFilterActive(s)) {
    const modelIds = new Set(rows.map((row) => row.model));
    const dropped = new Set();
    for (const modelId of modelIds) {
      const verdict = specVerdict(modelId, s);
      if (verdict === "noSpec") {
        excluded.noSpec += 1;
        dropped.add(modelId);
      } else if (verdict === "missingSpec") {
        excluded.missingSpec += 1;
        dropped.add(modelId);
      } else if (verdict === "mismatch") {
        dropped.add(modelId);
      }
    }
    rows = rows.filter((row) => !dropped.has(row.model));
  }

  // A series is (country, model, channel, variant); `variant: ALL` collapses
  // variants by taking the lowest real price per week.
  const collapseVariant = unrestricted(s.variant);
  const series = new Map();
  for (const row of rows) {
    const variantKey = collapseVariant ? ALL : row.variant;
    const key = [row.country, row.model, row.channel, variantKey].join("|");
    let entry = series.get(key);
    if (!entry) {
      entry = { country: row.country, model: row.model, channel: row.channel, variant: variantKey, points: new Map() };
      series.set(key, entry);
    }
    const existing = entry.points.get(row.week);
    if (!existing || row.price < existing.price) entry.points.set(row.week, { price: row.price, row });
  }

  const weekKeys = [...new Set(rows.map((row) => row.week))].sort();

  const statsFor = (week) => {
    const previousWeek = weekBefore(week);
    const matches = [];
    for (const entry of series.values()) {
      const current = entry.points.get(week);
      const previous = previousWeek ? entry.points.get(previousWeek) : null;
      if (!current || !previous || !(previous.price > 0)) continue;
      matches.push({
        entry,
        from: previous.price,
        to: current.price,
        pct: (current.price - previous.price) / previous.price,
      });
    }
    matches.sort((a, b) => b.pct - a.pct || a.entry.model.localeCompare(b.entry.model));
    const changedUp = matches.filter((m) => m.pct > TREND_FLAT_THRESHOLD).length;
    const changedDown = matches.filter((m) => m.pct < -TREND_FLAT_THRESHOLD).length;
    const medianPct = matches.length >= 3 ? median(matches.map((m) => m.pct)) : null;
    return { week, index: null, medianPct, changedUp, changedDown, sample: matches.length, matches };
  };

  // OQ-5: weeks and points cover the same list, starting at the first week with
  // a computable median (a leading week with no comparable predecessor is not
  // reported at all, rather than as an unlabelled gap).
  const allStats = weekKeys.map(statsFor);
  const start = allStats.findIndex((point) => point.medianPct != null);
  const points = (start === -1 ? [] : allStats.slice(start)).slice(-limit);

  // Index: base 100 at the first week with a non-null median, then chained.
  let index = null;
  for (const point of points) {
    if (point.medianPct == null) {
      point.index = null;
      continue;
    }
    index = index == null ? 100 : index * (1 + point.medianPct);
    point.index = Math.round(index * 10000) / 10000;
  }
  const windowWeeks = points.map((point) => point.week);

  const latest = points.at(-1) ?? null;
  const latestMatches = latest?.matches ?? [];
  const up = latestMatches.filter((m) => m.pct > TREND_FLAT_THRESHOLD).length;
  const down = latestMatches.filter((m) => m.pct < -TREND_FLAT_THRESHOLD).length;
  const entryShape = (match) => ({
    country: match.entry.country,
    model: match.entry.model,
    variant: match.entry.variant,
    variantLabel: variantLabel(match.entry.variant),
    channel: match.entry.channel,
    channelLabel: channelName(match.entry.channel),
    from: match.from,
    to: match.to,
    pct: match.pct,
  });

  const contribution = (field) => {
    const counts = new Map();
    for (const match of latestMatches) {
      const id = field === "channel" ? match.entry.channel : match.entry.country;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, sample]) => ({ id, sample }))
      .sort((a, b) => b.sample - a.sample || String(a.id).localeCompare(String(b.id)));
  };

  // A2: extreme moves stay in the median and are surfaced, never hidden.
  const suspects = [];
  for (const point of points) {
    for (const match of point.matches) {
      if (Math.abs(match.pct) > TREND_SUSPECT_THRESHOLD) {
        suspects.push({ ...entryShape(match), week: point.week });
      }
    }
  }
  suspects.sort(
    (a, b) =>
      Math.abs(b.pct) - Math.abs(a.pct) ||
      String(a.week).localeCompare(String(b.week)) ||
      `${a.country}|${a.model}`.localeCompare(`${b.country}|${b.model}`),
  );

  const gainers = latestMatches.filter((m) => m.pct > 0).slice(0, 3);
  const losers = latestMatches.filter((m) => m.pct < 0).slice(-3).reverse();

  return {
    weeks: windowWeeks,
    points: points.map(({ matches, ...point }) => point),
    summary: {
      seriesCount: series.size,
      sample: latestMatches.length,
      up,
      down,
      flat: latestMatches.length - up - down,
      medianPct: latest?.medianPct ?? null,
      topGainers: gainers.map(entryShape),
      topLosers: losers.map(entryShape),
      suspects,
      markets: contribution("country"),
      channels: contribution("channel"),
      insufficient: points.filter((point) => point.medianPct != null).length < 2,
    },
    excluded,
  };
}

export function currencyOf(countryId) {
  return countries.find((c) => c.id === countryId)?.currency ?? "USD";
}

export function usd(value) {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function money(value, currency = "") {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = value.toLocaleString("en-US", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${formatted}${currency ? ` ${currency}` : ""}`;
}

export function percentage(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function csv(rows) {
  return rows
    .map((row) =>
      row
        .map((cellValue) => {
          const text = cellValue == null ? "" : String(cellValue);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
}

function fxIsStale(fx) {
  if (fx?.stale === true) return true;
  if (!fx?.asOf) return true;
  const ageDays = (Date.now() - new Date(fx.asOf).getTime()) / 86400000;
  return ageDays > FX_STALE_AFTER_DAYS;
}

export function fxLabel() {
  const { asOf, source } = dataInfo.fx ?? {};
  if (!asOf) return "汇率不可用";
  return `${asOf} · ${fxIsStale(dataInfo.fx) ? "已过期" : "有效"}${source ? ` · ${String(source).replace(/^https?:\/\//, "").split("/")[0]}` : ""}`;
}

/** The next scheduled run strictly after `after` (COLLECT_SCHEDULE, UTC). */
function nextScheduledRun(after) {
  const { weekday, hourUtc, minuteUtc } = COLLECT_SCHEDULE;
  const at = new Date(
    Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), hourUtc, minuteUtc, 0, 0),
  );
  const currentWeekday = at.getUTCDay() || 7;
  at.setUTCDate(at.getUTCDate() + ((weekday - currentWeekday + 7) % 7));
  if (at.getTime() <= after.getTime()) at.setUTCDate(at.getUTCDate() + 7);
  return at;
}

/**
 * Next expected refresh: the next scheduled Monday 03:17 UTC strictly after
 * `collectedAt`. Honest by construction — once the schedule has already missed
 * that run we report the delay instead of projecting a future time the feed has
 * not reached (WC §1).
 */
export function nextRefresh() {
  if (!dataInfo.collectedAt) {
    return { at: null, late: false, text: "采集时间未知，无法计算下次刷新" };
  }
  const collected = new Date(dataInfo.collectedAt);
  if (Number.isNaN(collected.getTime())) {
    return { at: null, late: false, text: "采集时间无效" };
  }
  const at = nextScheduledRun(collected);
  const late = Date.now() >= at.getTime();
  return {
    at: at.toISOString(),
    late,
    text: late
      ? `刷新已延迟 · 距上次采集已超过 ${cadenceSpan()}`
      : `预计下次刷新 ${localTime(at)}`,
  };
}

/**
 * Freshness verdict shown in the banner.
 *
 * Level rules (contract v1.1, client side):
 *   stale    — `collectedAt` older than the weekly cadence + 1 day grace
 *   degraded — `mode !== "live"`, any `failedSources`, or FX older than 7 days
 *   fresh    — none of the above
 */
export function freshness() {
  const collectedAtLocal = localTime(dataInfo.collectedAt);
  const next = nextRefresh();
  const base = {
    cadence: cadenceLabel(),
    collectedAtLocal,
    next,
    fx: fxLabel(),
  };
  if (!dataInfo.loaded) return { ...base, level: "pending", text: "正在加载数据…" };
  if (!dataInfo.collectedAt)
    return { ...base, level: "stale", text: "尚未连接到已验证来源" };

  const collected = new Date(dataInfo.collectedAt).getTime();
  const ageMinutes = Number.isNaN(collected)
    ? Infinity
    : (Date.now() - collected) / 60000;
  const staleFx = fxIsStale(dataInfo.fx);

  if (ageMinutes > STALE_AFTER_MINUTES) {
    return {
      ...base,
      level: "stale",
      text: `数据可能过期 · 最近采集 ${collectedAtLocal}（已超过 ${cadenceShort()}）`,
    };
  }

  const reasons = [];
  if (dataInfo.mode !== "live") reasons.push("采集模式非实时");
  if (dataInfo.failedSources?.length)
    reasons.push(`${dataInfo.failedSources.length} 个来源失败`);
  if (staleFx) reasons.push("汇率过期");
  if (reasons.length) {
    return { ...base, level: "degraded", text: `数据降级 · ${reasons.join(" · ")}` };
  }

  return {
    ...base,
    level: "fresh",
    text: `数据有效 · ${dataInfo.sourceCount} 个来源 · ${dataInfo.verifiedProductCount} 条本周价格`,
  };
}
