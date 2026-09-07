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
export const models = ["A06", "A16", "A25", "A35", "A55"].map((id, i) => ({
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
export const dataInfo = { mode: "demo", collectedAt: null, sourceCount: 0, failedSources: [] };
export async function loadRemoteRecords(path = `${import.meta.env.BASE_URL}data/latest.json`) {
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.records) || !payload.records.length) throw new Error("empty records");
    records.splice(0, records.length, ...payload.records);
    Object.assign(dataInfo, { mode: payload.mode || "live", collectedAt: payload.collectedAt || null, sourceCount: payload.sourceCount || 0, failedSources: payload.failedSources || [] });
    return true;
  } catch { return false; }
}
export const labels = {
  normal: "正常",
  promo: "促销",
  missing: "缺价 · 沿用",
  invalid: "来源失效 · 沿用",
  new: "首次采集",
  source: "来源变化",
};
export const anomaly = (s) => s === "missing" || s === "invalid";
// Deterministic demo observations, not collected market prices.
export const records = countries.flatMap((c, ci) =>
  models.flatMap((m, mi) =>
    m.variants.flatMap((v) =>
      channels.flatMap((ch, hi) =>
        weeks.map((week, wi) => {
          let state = wi === 0 ? "new" : "normal";
          if (wi === 8) state = "source";
          if ((wi + mi + ci + hi) % 8 === 3) state = "promo";
          if (
            (wi === 11 && ci === 2 && mi === 2) ||
            (wi === 6 && mi === 1 && hi === 1)
          )
            state = "missing";
          if (wi === 11 && ci === 1 && mi === 1 && hi === 0) state = "invalid";
          const scale = c.currency === "KWD" ? 0.085 : 1;
          const amount =
            scale *
            ([449, 699, 999, 1399, 1799][mi] +
              (11 - wi) * 10 +
              ((wi + mi + ci) % 3) * 15 -
              hi * 35 +
              (v === "256GB" ? 150 : v === "64GB" ? -80 : 0) -
              (state === "promo" ? 50 : 0));
          return {
            country: c.id,
            model: m.id,
            channel: ch.id,
            variant: v,
            week,
            price: anomaly(state) ? null : Math.round(amount * 1000) / 1000,
            state,
            collectedAt: `${week}T08:00:00Z`,
            sourceUrl: c.url,
          };
        }),
      ),
    ),
  ),
);
export function history(
  country,
  model,
  channel,
  variant,
  until = weeks.at(-1),
) {
  let previous = null;
  return records
    .filter(
      (r) =>
        r.country === country &&
        r.model === model &&
        r.channel === channel &&
        r.variant === variant &&
        r.week <= until,
    )
    .map((r) => {
      if (r.price !== null) previous = r;
      return {
        ...r,
        value: r.price ?? previous?.price ?? null,
        effectiveDate: previous?.week ?? null,
        carried: r.price === null && previous !== null,
      };
    });
}
export function cell(...args) {
  const rows = history(...args),
    current = rows.at(-1),
    previous = rows.at(-2)?.value ?? null;
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
