/**
 * Client data layer (contract v1.1).
 *
 * Everything is loaded at runtime from the published JSON so the brand,
 * country list, model list and FX rates are configuration — not code:
 *   data/markets.json  brands + countries + retailers
 *   data/models.json   models actually observed on sale per market
 *   data/latest.json   normalized price records + fx + failedSources
 *   data/fx.json       dated USD rates (USD per 1 local unit)
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

export const labels = {
  live: "正常",
  normal: "正常",
  promo: "促销",
  missing: "缺价 · 沿用",
  invalid: "来源失效 · 沿用",
  new: "首次采集",
  source: "来源变化",
  unavailable: "暂无该型号",
};
export const anomaly = (s) => s === "missing" || s === "invalid" || s === "unavailable";

export const channels = [
  { id: "official", name: "官方商城", color: "#16756a" },
  { id: "retail", name: "零售渠道", color: "#b16629" },
];

export let brands = [{ id: "samsung", name: "Samsung", series: ["Galaxy A", "Galaxy S"] }];
export let countries = [];
export let models = [];
export let retailers = [];
export let records = [];
export let weeks = defaultWeeks();

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

export function recordKey(record) {
  return [record.country, record.brand, record.model, record.variant, record.channel, record.sourceId, record.week].join("|");
}

function setWeeks() {
  const present = new Set(records.map((r) => r.week));
  const merged = new Set([...defaultWeeks(), ...present]);
  weeks = [...merged].sort();
}

/** Apply already-parsed payloads. Exported so tests can hydrate from disk. */
export function hydrate({ markets = null, models: modelCfg = null, latest = null, fx: fxFile = null, errors = [] } = {}) {
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
  Object.assign(dataInfo, {
    contract: latest?.apiVersion ?? "1.1",
    mode: latest?.mode ?? "empty",
    collectedAt: latest?.collectedAt ?? null,
    week: latest?.week ?? null,
    sourceCount: latest?.sourceCount ?? 0,
    verifiedProductCount: latest?.verifiedProductCount ?? 0,
    failedSources: latest?.failedSources ?? [],
    fx: { base: "USD", asOf: null, source: null, stale: true, rates: {}, ...(fx ?? {}) },
    loaded: true,
    errors,
  });

  setWeeks();
  return errors;
}

/** Load markets/models/latest/fx. Failures are recorded, never fatal. */
export async function loadRemoteRecords() {
  const errors = [];
  const [markets, modelCfg, latest, fxFile] = await Promise.all([
    getJson("data/markets.json").catch((e) => (errors.push(String(e.message)), null)),
    getJson("data/models.json").catch((e) => (errors.push(String(e.message)), null)),
    getJson("data/latest.json").catch((e) => (errors.push(String(e.message)), null)),
    getJson("data/fx.json").catch((e) => (errors.push(String(e.message)), null)),
  ]);
  hydrate({ markets, models: modelCfg, latest, fx: fxFile, errors });
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
 * One row per week for a (country, model, channel, variant) cell. When several
 * retailers cover the same combination we keep the lowest verified price for
 * that week, preferring a live record over a carried one, so the cell is
 * well-defined and the trend is consistent.
 */
function rowsFor(country, model, channel, variant) {
  const matched = records.filter(
    (r) => r.country === country && r.model === model && r.channel === channel && (variant == null || r.variant === variant),
  );
  const rank = (r) => (r.state === "live" ? 0 : r.state === "unavailable" ? 2 : 1);
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

/** The value shown for a cell at `week`, with carry-forward clearly marked. */
export function cell(country, model, channel, variant, week = weeks.at(-1)) {
  const rows = rowsFor(country, model, channel, variant);
  if (!rows.length) return { value: null, priceUsd: null, state: "unavailable", delta: null, percent: null, effectiveDate: null, carried: false, sourceUrl: null, sourceId: null, collectedAt: null, currency: currencyOf(country) };

  const atOrBefore = rows.filter((r) => String(r.week) <= String(week));
  const current = atOrBefore.at(-1);
  if (!current) return { value: null, priceUsd: null, state: "unavailable", delta: null, percent: null, effectiveDate: null, carried: false, sourceUrl: null, sourceId: null, collectedAt: null, currency: currencyOf(country) };

  const previous = atOrBefore.at(-2) ?? null;
  const isCurrentWeek = String(current.week) === String(week);
  const state = isCurrentWeek ? current.state ?? "live" : "missing";
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
  };
}

/** Weekly series: one point per stored week (no interpolation, gaps stay gaps). */
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

export function fxLabel() {
  const { asOf, source, stale } = dataInfo.fx ?? {};
  if (!asOf) return "汇率不可用";
  return `${asOf} · ${stale ? "已过期" : "有效"}${source ? ` · ${String(source).replace(/^https?:\/\//, "").split("/")[0]}` : ""}`;
}

export function freshness() {
  if (!dataInfo.loaded) return { level: "pending", text: "正在加载数据…" };
  if (!dataInfo.collectedAt) return { level: "stale", text: "尚未连接到已验证来源" };
  const ageHours = (Date.now() - new Date(dataInfo.collectedAt).getTime()) / 3600000;
  const fxAgeDays = dataInfo.fx?.asOf ? (Date.now() - new Date(dataInfo.fx.asOf).getTime()) / 86400000 : Infinity;
  if (ageHours > 24 || fxAgeDays > 7 || dataInfo.fx?.stale) {
    return { level: "stale", text: `数据可能过期（采集于 ${new Date(dataInfo.collectedAt).toLocaleString("zh-CN")}）` };
  }
  return { level: "fresh", text: `数据有效 · ${dataInfo.sourceCount} 个来源 · ${dataInfo.verifiedProductCount} 条本周价格` };
}
