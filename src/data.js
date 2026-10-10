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

/**
 * Documented automatic collection cadence, in minutes.
 *
 * SINGLE SOURCE OF TRUTH for the client promise: the banner prints it, the
 * next-refresh estimate is derived from it, and the staleness threshold is a
 * multiple of it. It MUST match the cron in `.github/workflows/collect.yml`
 * (the scheduled collection moved to hourly, i.e. `23 * * * *`).
 */
export const COLLECT_CADENCE_MINUTES = 60;
/** Warn once the feed is older than 3× the documented cadence (~3h when hourly). */
export const STALE_AFTER_MINUTES = COLLECT_CADENCE_MINUTES * 3;
/** FX older than a week is treated as degraded, never silently reused as current. */
export const FX_STALE_AFTER_DAYS = 7;

/** Human cadence, e.g. "1 小时" / "6 小时" / "45 分钟". */
export function cadenceShort() {
  return COLLECT_CADENCE_MINUTES % 60 === 0
    ? `${COLLECT_CADENCE_MINUTES / 60} 小时`
    : `${COLLECT_CADENCE_MINUTES} 分钟`;
}

/** Banner copy for the documented cadence, e.g. "每 1 小时自动采集". */
export function cadenceLabel() {
  return `每 ${cadenceShort()}自动采集`;
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
    fx: { base: "USD", asOf: null, source: null, stale: false, rates: {}, ...(fx ?? {}) },
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
    (r) =>
      r.country === country &&
      r.model === model &&
      (channel === ALL || r.channel === channel) &&
      (variant === ALL || variant == null || r.variant === variant),
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
    channel: current.channel ?? null,
    variant: current.variant ?? null,
    availabilityHint: null,
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

/**
 * Next expected refresh, derived from `collectedAt + cadence` and clamped
 * honestly: once the feed is already late we say so instead of projecting a
 * future time that the schedule has already missed.
 */
export function nextRefresh() {
  if (!dataInfo.collectedAt) {
    return { at: null, late: false, text: "采集时间未知，无法计算下次刷新" };
  }
  const collected = new Date(dataInfo.collectedAt);
  if (Number.isNaN(collected.getTime())) {
    return { at: null, late: false, text: "采集时间无效" };
  }
  const at = new Date(collected.getTime() + COLLECT_CADENCE_MINUTES * 60000);
  const late = Date.now() >= at.getTime();
  return {
    at: at.toISOString(),
    late,
    text: late
      ? `刷新已延迟 · 距上次采集已超过 ${cadenceShort()}`
      : `预计下次刷新 ${localTime(at)}`,
  };
}

/**
 * Freshness verdict shown in the banner.
 *
 * Level rules (contract v1.1, client side):
 *   stale    — `collectedAt` older than 3× the documented cadence
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
