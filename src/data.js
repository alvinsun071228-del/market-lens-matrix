export const countries = [
  {
    id: "sa",
    name: "沙特阿拉伯",
    currency: "SAR",
    url: "https://www.samsung.com/sa_en/",
  },
  {
    id: "ae",
    name: "阿联酋",
    currency: "AED",
    url: "https://www.samsung.com/ae/",
  },
  {
    id: "kw",
    name: "科威特",
    currency: "KWD",
    url: "https://www.samsung.com/ae/",
  },
  {
    id: "qa",
    name: "卡塔尔",
    currency: "QAR",
    url: "https://www.samsung.com/ae/",
  },
];
export const models = ["A06", "A16", "A25", "A35", "A55", "A57"].map((id, i) => ({
  id,
  name: `Galaxy ${id}`,
  variants: i === 0 ? ["64GB", "128GB"] : ["128GB", "256GB"],
}));
export const channels = [
  { id: "official", name: "官方商城", color: "#16756a" },
  { id: "retail", name: "零售渠道", color: "#b16629" },
];
export const weeks = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(2026, 5, 22 + i * 7)).toISOString().slice(0, 10),
);
export const dataInfo = { mode: "empty", collectedAt: null, sourceCount: 0, failedSources: [] };
export async function loadRemoteRecords(path = `${import.meta.env.BASE_URL}data/latest.json`) {
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.records)) throw new Error("invalid records");
    records.splice(0, records.length, ...payload.records.filter((record) => record.sourceUrl && record.sourceId && record.collectedAt));
    Object.assign(dataInfo, { mode: payload.mode || "live", collectedAt: payload.collectedAt || null, sourceCount: payload.sourceCount || 0, failedSources: payload.failedSources || [] });
    return true;
  } catch { records.splice(0, records.length); Object.assign(dataInfo, { mode: "empty", collectedAt: null, sourceCount: 0, failedSources: [] }); return false; }
}
export const labels = {
  normal: "正常",
  promo: "促销",
  missing: "缺价 · 沿用",
  invalid: "来源失效 · 沿用",
  new: "首次采集",
  source: "来源变化",
  unavailable: "暂无该型号",
};
export const anomaly = (s) => s === "missing" || s === "invalid";
export function isAvailable(country, model, channel) {
  if (model === "A57") return channel === "retail" && country === "sa";
  return true;
}
// Prices are loaded only from public/data/latest.json. There is no fallback price set.
export const records = [];
export function history(
  country,
  model,
  channel,
  variant,
  until = weeks.at(-1),
) {
  if (!isAvailable(country, model, channel)) return [];
  let previous = null;
  const matching = records
    .filter(
      (r) =>
        r.country === country &&
        r.model === model &&
        r.channel === channel &&
        r.variant === variant &&
        r.week <= until,
    );
  return [...new Set(matching.map((r) => r.week))]
    .sort()
    .map((week) => {
      const rows = matching.filter((r) => r.week === week && r.price !== null);
      const r = rows.sort((a, b) => a.price - b.price)[0] || matching.find((row) => row.week === week);
      if (r?.price !== null) previous = r;
      return {
        ...r,
        value: r?.price ?? previous?.price ?? null,
        effectiveDate: previous?.week ?? null,
        carried: r?.price === null && previous !== null,
      };
    });
}
export function cell(...args) {
  const rows = history(...args),
    current = rows.at(-1),
    previous = rows.at(-2)?.value ?? null;
  if (!current) return { state: "unavailable", value: null, price: null, previous: null, delta: null, percent: null };
  const delta =
    current?.value != null && previous !== null
      ? Math.round((current.value - previous) * 1000) / 1000
      : null;
  return {
    ...current,
    previous,
    delta,
    percent: previous > 0 && delta !== null ? (delta / previous) * 100 : null,
  };
}
export const money = (v, c) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        minimumFractionDigits: c === "KWD" ? 3 : 0,
        maximumFractionDigits: c === "KWD" ? 3 : 0,
      }).format(v);
export const percentage = (v) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
export const csv = (rows) =>
  "\uFEFF" +
  rows
    .map((row) =>
      row.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","),
    )
    .join("\r\n");
