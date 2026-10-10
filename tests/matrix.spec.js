import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cell,
  history,
  weeks,
  records,
  usd,
  weekStart,
  hydrate,
  fxLabel,
  freshness,
  nextRefresh,
  cadenceLabel,
  cadenceShort,
  COLLECT_CADENCE_MINUTES,
  COLLECT_SCHEDULE,
  STALE_AFTER_MINUTES,
  FX_STALE_AFTER_DAYS,
  weeklyTrend,
  specOf,
  specValues,
  specsLoaded,
} from "../src/data.js";

const read = (p) => JSON.parse(readFileSync(resolve(process.cwd(), p), "utf8"));

const STATES = new Set(["live", "missing", "invalid", "unavailable"]);

// USD math, mirroring the contract: round(local × fx.rates[currency], 2).
const expectedUsd = (price, currency, rates) => {
  const rate = rates?.[currency];
  if (!Number.isFinite(rate)) return null;
  return Math.round(price * rate * 100) / 100;
};

test("data contract v1.1 holds across the published files", () => {
  const latest = read("public/data/latest.json");
  const markets = read("public/data/markets.json");
  const models = read("public/data/models.json");
  const fx = read("public/data/fx.json");
  const api = read("public/api/prices.json");

  expect(latest.apiVersion).toBe("1.1");
  expect(Number.isFinite(Date.parse(latest.collectedAt))).toBe(true);
  expect(latest.week).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(fx.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(Object.keys(fx.rates).length).toBeGreaterThan(0);
  expect(markets.countries.map((c) => c.id)).toEqual(expect.arrayContaining(["tr", "sa", "ae", "qa", "om", "jo"]));
  expect(models.models.length).toBeGreaterThan(0);

  const countryIds = new Set(markets.countries.map((c) => c.id));
  for (const record of latest.records) {
    expect(record.sourceId).toBeTruthy();
    expect(record.sourceUrl).toMatch(/^https?:/);
    expect(record.collectedAt).toBeTruthy();
    expect(record.rawEvidence).toBeTruthy();
    expect(STATES.has(record.state)).toBe(true);
    expect(countryIds.has(record.country)).toBe(true);
    if (record.state === "unavailable") expect(record.price).toBeNull();
    if (record.price != null) {
      const rate = fx.rates[record.currency];
      expect(Number.isFinite(rate)).toBe(true);
      expect(record.priceUsd).toBe(Math.round(record.price * rate * 100) / 100);
    }
  }
  // The API mirror must be byte-identical to the runtime payload.
  expect(api).toEqual(latest);
  // Every current-week live record carries a usable USD value.
  for (const record of latest.records.filter((r) => r.week === latest.week && r.state === "live")) {
    expect(record.priceUsd).toBeGreaterThan(0);
  }
});

test("cell/history helpers carry forward honestly and keep gaps as gaps", () => {
  hydrate({
    markets: read("public/data/markets.json"),
    models: read("public/data/models.json"),
    latest: read("public/data/latest.json"),
    fx: read("public/data/fx.json"),
  });
  expect(weeks.at(-1)).toBe(weekStart());
  expect(usd(123.456)).toBe("$123.46");
  expect(usd(null)).toBe("—");

  const latest = read("public/data/latest.json");
  const live = latest.records.find((r) => r.state === "live");
  const { country, model, channel, variant, week } = live;
  const current = cell(country, model, channel, variant, week);
  expect(current.value).toBeGreaterThan(0);
  expect(current.state).toBe("live");

  // A market with no source is unavailable, never zero.
  const blank = cell("kw", "A16", "retail", "128GB", week);
  expect(blank.value).toBeNull();
  expect(blank.state).toBe("unavailable");
  expect(history("kw", "A16", "retail", "128GB")).toEqual([]);

  // history never invents a point for a week with no stored record.
  const rows = history(country, model, channel, variant);
  expect(rows.length).toBe(new Set(rows.map((r) => r.week)).size);
  expect(records.every((r) => r.sourceId && /^https?:/.test(r.sourceUrl))).toBe(true);
});

test("refresh promise: cadence constant, honest next-refresh clamping, staleness thresholds", () => {
  // The cadence lives in one constant so the schedule and the client agree.
  expect(COLLECT_CADENCE_MINUTES).toBeGreaterThan(0);
  expect(STALE_AFTER_MINUTES).toBe(COLLECT_CADENCE_MINUTES + 1440);
  expect(FX_STALE_AFTER_DAYS).toBe(7);
  expect(cadenceLabel()).toMatch(/自动采集$/);

  // A freshly collected feed projects a future next-refresh and reads fresh.
  const now = Date.now();
  hydrate({
    latest: {
      apiVersion: "1.1",
      mode: "live",
      collectedAt: new Date(now).toISOString(),
      week: weekStart(),
      sourceCount: 1,
      verifiedProductCount: 1,
      failedSources: [],
      fx: { base: "USD", asOf: new Date(now).toISOString().slice(0, 10), source: "test", rates: { AED: 0.27 } },
      records: [],
    },
    fx: { asOf: new Date(now).toISOString().slice(0, 10), source: "test", rates: { AED: 0.27 } },
  });
  expect(freshness().level).toBe("fresh");
  expect(nextRefresh().late).toBe(false);
  expect(nextRefresh().text).toContain("预计下次刷新");

  // Older than the cadence: honestly "late", never an invented future time.
  hydrate({
    latest: {
      apiVersion: "1.1",
      mode: "live",
      collectedAt: new Date(now - (COLLECT_CADENCE_MINUTES + 5) * 60000).toISOString(),
      week: weekStart(),
      sourceCount: 1,
      verifiedProductCount: 1,
      failedSources: [],
      fx: { base: "USD", asOf: new Date(now).toISOString().slice(0, 10), source: "test", rates: { AED: 0.27 } },
      records: [],
    },
  });
  expect(nextRefresh().late).toBe(true);
  expect(nextRefresh().text).toContain("刷新已延迟");

  // Older than the weekly cadence + 1 day grace becomes stale.
  hydrate({
    latest: {
      apiVersion: "1.1",
      mode: "live",
      collectedAt: new Date(now - (STALE_AFTER_MINUTES + 5) * 60000).toISOString(),
      week: weekStart(),
      sourceCount: 1,
      verifiedProductCount: 1,
      failedSources: [],
      fx: { base: "USD", asOf: new Date(now).toISOString().slice(0, 10), source: "test", rates: { AED: 0.27 } },
      records: [],
    },
  });
  expect(freshness().level).toBe("stale");

  // In-window but non-live / failed sources / old FX degrades.
  hydrate({
    latest: {
      apiVersion: "1.1",
      mode: "empty",
      collectedAt: new Date(now).toISOString(),
      week: weekStart(),
      sourceCount: 0,
      verifiedProductCount: 0,
      failedSources: [{ id: "x", name: "X", error: "boom" }],
      fx: { base: "USD", asOf: "2020-01-01", source: "test", stale: true, rates: {} },
      records: [],
    },
  });
  expect(freshness().level).toBe("degraded");
  expect(freshness().text).toContain("汇率过期");
});

/* --------------- weekly cadence + weeklyTrend unit tests --------------- */

const WEEK = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"];

const historyPoint = (model, week, price, overrides = {}) => ({
  country: "sa",
  model,
  channel: "retail",
  variant: "128GB",
  week,
  price,
  currency: "SAR",
  priceUsd: price,
  state: "live",
  sourceId: `test-${model}-${week}`,
  sourceUrl: "https://example.com/test",
  collectedAt: `${week}T00:00:00.000Z`,
  effectiveDate: week,
  ...overrides,
});

const feed = (latestRecords = [], overrides = {}) => ({
  apiVersion: "1.1",
  mode: "live",
  collectedAt: "2026-10-10T10:00:00.000Z",
  week: "2026-10-05",
  sourceCount: 1,
  verifiedProductCount: 1,
  failedSources: [],
  fx: { base: "USD", asOf: "2026-10-10", source: "test", rates: { SAR: 0.27 } },
  records: latestRecords,
  ...overrides,
});

test("weekly cadence: Monday 03:17 UTC schedule, Monday-aware next refresh, 8-day staleness", () => {
  expect(COLLECT_CADENCE_MINUTES).toBe(10080);
  expect(COLLECT_SCHEDULE).toEqual({ weekday: 1, hourUtc: 3, minuteUtc: 17, label: "每周一 03:17 UTC" });
  expect(STALE_AFTER_MINUTES).toBe(10080 + 1440);
  expect(FX_STALE_AFTER_DAYS).toBe(7);
  expect(cadenceShort()).toBe("每周一");
  expect(cadenceLabel()).toBe("每周一 03:17 UTC 自动采集");

  const scheduleFeed = (collectedAt) => ({
    apiVersion: "1.1",
    mode: "live",
    collectedAt,
    week: weekStart(),
    sourceCount: 1,
    verifiedProductCount: 1,
    failedSources: [],
    fx: { base: "USD", asOf: new Date().toISOString().slice(0, 10), source: "test", rates: { AED: 0.27 } },
    records: [],
  });

  // Across a Monday boundary: a Sunday collection projects the next Monday 03:17 UTC.
  hydrate({ latest: scheduleFeed("2026-09-13T20:00:00.000Z") });
  expect(nextRefresh().at).toBe("2026-09-14T03:17:00.000Z");
  // Collected exactly at the scheduled minute -> the following Monday (strictly after).
  hydrate({ latest: scheduleFeed("2026-09-14T03:17:00.000Z") });
  expect(nextRefresh().at).toBe("2026-09-21T03:17:00.000Z");
  // One second earlier -> the same Monday run.
  hydrate({ latest: scheduleFeed("2026-09-14T03:16:59.000Z") });
  expect(nextRefresh().at).toBe("2026-09-14T03:17:00.000Z");

  // A collection "now" always projects a future run and is honestly not late.
  hydrate({ latest: scheduleFeed(new Date().toISOString()) });
  expect(nextRefresh().late).toBe(false);
  expect(nextRefresh().text).toContain("预计下次刷新");

  // Weekly cadence + 1 day grace: just inside stays fresh, past it becomes stale.
  const now = Date.now();
  hydrate({ latest: scheduleFeed(new Date(now - (STALE_AFTER_MINUTES - 5) * 60000).toISOString()) });
  expect(freshness().level).toBe("fresh");
  hydrate({ latest: scheduleFeed(new Date(now - (STALE_AFTER_MINUTES + 5) * 60000).toISOString()) });
  expect(freshness().level).toBe("stale");

  // A feed older than one week reports the delay instead of a missed future time.
  hydrate({ latest: scheduleFeed(new Date(now - (COLLECT_CADENCE_MINUTES + 60) * 60000).toISOString()) });
  expect(nextRefresh().late).toBe(true);
  expect(nextRefresh().text).toContain("刷新已延迟");
  expect(nextRefresh().text).toContain("1 周");
});

test("weeklyTrend: median, chained index and up/down counts over real ISO weeks", () => {
  const prices = {
    "HIST-A": [100, 110, 112.2, 113.322, 113.322],
    "HIST-B": [200, 210, 214.2, 220.626, 222.83226],
    "HIST-C": [300, 300, 297, 291.06, 288.1494],
    "HIST-D": [400, 380, 376.2, 376.2, 391.248],
    "HIST-E": [500, 450, 445.5, 445.5, 427.68],
  };
  const points = Object.entries(prices).flatMap(([model, series]) =>
    series.map((price, i) => historyPoint(model, WEEK[i], price)),
  );
  // models.json deliberately does NOT list the fixture ids: the trend aggregates
  // all real merged history, not just configured models (WC §3.3 A1).
  hydrate({
    models: { models: [{ id: "A57 5G", name: "Galaxy A57 5G", series: "Galaxy A", brandId: "samsung", variants: ["128GB"] }] },
    latest: feed([]),
    history: { apiVersion: "1.1", weeks: WEEK, points },
  });

  const trend = weeklyTrend({});
  // OQ-5: weeks and points share one list, starting at the first computable median.
  expect(trend.weeks).toEqual(["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"]);
  expect(trend.points.map((p) => p.week)).toEqual(trend.weeks);
  expect(trend.points.map((p) => p.sample)).toEqual([5, 5, 5, 5]);
  expect(trend.points.map((p) => p.changedUp)).toEqual([2, 2, 2, 2]);
  expect(trend.points.map((p) => p.changedDown)).toEqual([2, 3, 1, 2]);
  // pct is a FRACTION: week medians are [0, -1%, 0, 0]; index is chained from 100.
  const medians = trend.points.map((p) => p.medianPct);
  [0, -0.01, 0, 0].forEach((expected, i) => expect(medians[i]).toBeCloseTo(expected, 6));
  expect(trend.points.map((p) => p.index)).toEqual([100, 99, 99, 99]);
  expect(trend.summary.seriesCount).toBe(5);
  expect(trend.summary.sample).toBe(5);
  expect(trend.summary.up).toBe(2);
  expect(trend.summary.down).toBe(2);
  expect(trend.summary.flat).toBe(1);
  expect(trend.summary.insufficient).toBe(false);
  expect(trend.summary.suspects).toEqual([]);
  expect(trend.summary.markets).toEqual([{ id: "sa", sample: 5 }]);
  expect(trend.summary.channels).toEqual([{ id: "retail", sample: 5 }]);
  expect(trend.summary.topGainers.map((g) => [g.model, g.from, g.to])).toEqual([
    ["HIST-D", 376.2, 391.248],
    ["HIST-B", 220.626, 222.83226],
  ]);
  expect(trend.summary.topLosers.map((g) => [g.model, g.from, g.to])).toEqual([
    ["HIST-E", 445.5, 427.68],
    ["HIST-C", 291.06, 288.1494],
  ]);
  expect(trend.excluded).toEqual({ missingSpec: 0, noSpec: 0 });
});

test("weeklyTrend: variant ALL collapses by lowest real price; variant filters records", () => {
  const points = [];
  for (const model of ["M1", "M2", "M3"]) {
    points.push(historyPoint(model, WEEK[0], 100, { variant: "128GB" }));
    points.push(historyPoint(model, WEEK[0], 90, { variant: "256GB" }));
    points.push(historyPoint(model, WEEK[1], 80, { variant: "128GB" }));
    points.push(historyPoint(model, WEEK[1], 95, { variant: "256GB" }));
  }
  hydrate({ latest: feed([]), history: { apiVersion: "1.1", weeks: WEEK, points } });

  const collapsed = weeklyTrend({});
  expect(collapsed.summary.seriesCount).toBe(3); // 3 series, not 6
  expect(collapsed.points[0].sample).toBe(3);
  expect(collapsed.points[0].medianPct).toBeCloseTo((80 - 90) / 90, 6);
  expect(collapsed.summary.topLosers).toHaveLength(3);
  expect(collapsed.summary.topLosers.every((l) => l.variant === "all" && l.from === 90 && l.to === 80)).toBe(true);
  // Machine values stay `all`, but UI copy gets a label, never a raw "all".
  expect(collapsed.summary.topLosers[0]).toMatchObject({
    variant: "all",
    variantLabel: "全部容量",
    channel: "retail",
    channelLabel: "零售渠道",
  });

  const only128 = weeklyTrend({ variant: "128GB" });
  expect(only128.summary.seriesCount).toBe(3);
  expect(only128.points[0].medianPct).toBeCloseTo((80 - 100) / 100, 6);
  expect(only128.summary.topLosers).toHaveLength(3);
  expect(only128.summary.topLosers.every((l) => l.variant === "128GB" && l.from === 100 && l.to === 80)).toBe(true);
  expect(only128.summary.topLosers[0]).toMatchObject({ variant: "128GB", variantLabel: "128GB" });

  const missing = weeklyTrend({ variant: "512GB" });
  expect(missing.weeks).toEqual([]);
  expect(missing.summary.insufficient).toBe(true);
});

test("weeklyTrend: an explicit brand filter does not silently kill the trend", () => {
  // Four retired ids (absent from models.json) carrying real collected
  // brand/series fields (WC §2 rule 7), each moving +10% week over week.
  const points = [];
  const prices = [100, 110, 121, 133.1];
  for (const model of ["HIST-A", "HIST-B", "HIST-C", "HIST-D"]) {
    WEEK.slice(0, 4).forEach((week, i) =>
      points.push(historyPoint(model, week, prices[i], { brand: "Samsung", series: "Galaxy A" })),
    );
  }
  hydrate({
    models: { models: [{ id: "A57 5G", name: "Galaxy A57 5G", series: "Galaxy A", brandId: "samsung", variants: ["128GB"] }] },
    latest: feed([]),
    history: { apiVersion: "1.1", weeks: WEEK, points },
  });

  const unfiltered = weeklyTrend({});
  const byBrand = weeklyTrend({ brand: "samsung" }); // mixed case must match "Samsung"
  expect(byBrand.weeks).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
  expect(unfiltered.weeks).toEqual(byBrand.weeks);
  expect(byBrand.points.map((p) => p.sample)).toEqual([4, 4, 4]);
  expect(byBrand.summary.seriesCount).toBe(4);
  expect(byBrand.summary.insufficient).toBe(false);
  expect(byBrand.points.map((p) => p.index)).toEqual([100, 110, 121]); // trend survives the filter
  expect(byBrand.summary.markets).toEqual([{ id: "sa", sample: 4 }]);

  // A brand that matches nothing is empty — never silently unfiltered.
  const other = weeklyTrend({ brand: "apple" });
  expect(other.weeks).toEqual([]);
  expect(other.summary.insufficient).toBe(true);
});

test("weeklyTrend: brand/series survive the history merge verbatim (mixed case)", () => {
  const base = [];
  for (const model of ["A06", "A57", "A57 5G"]) {
    WEEK.slice(0, 3).forEach((week, i) =>
      base.push(historyPoint(model, week, 100 + i * 10, { brand: "Samsung", series: "Galaxy A" })),
    );
  }
  hydrate({ latest: feed([]), history: { apiVersion: "1.1", weeks: WEEK, points: base } });

  // A06 is a retired id absent from models.json, yet its own brand field keeps it
  // in scope; the comparison is case-insensitive.
  expect(weeklyTrend({ brand: "Samsung" }).summary.seriesCount).toBe(3);
  expect(weeklyTrend({ brand: "samsung" }).summary.seriesCount).toBe(3);
  expect(weeklyTrend({ series: "galaxy a" }).summary.seriesCount).toBe(3);

  // Negative control: without brand/series the same retired ids cannot be
  // attributed and must be dropped, never guessed into a brand.
  const stripped = base.map(({ brand, series, ...rest }) => rest);
  hydrate({ latest: feed([]), history: { apiVersion: "1.1", weeks: WEEK, points: stripped } });
  expect(weeklyTrend({ brand: "samsung" }).weeks).toEqual([]);
  expect(weeklyTrend({ brand: "samsung" }).summary.insufficient).toBe(true);
  // Unrestricted scope still sees them (A1).
  expect(weeklyTrend({}).summary.seriesCount).toBe(3);
});

test("weeklyTrend: thin samples stay gaps (null index) and set insufficient", () => {
  const points = [];
  for (const model of ["M1", "M2", "M3", "M4", "M5"]) points.push(historyPoint(model, WEEK[0], 100));
  for (const model of ["M1", "M2", "M3", "M4", "M5"]) points.push(historyPoint(model, WEEK[1], 110));
  points.push(historyPoint("M1", WEEK[2], 121)); // only one comparable series that week
  hydrate({ latest: feed([]), history: { apiVersion: "1.1", weeks: WEEK, points } });

  const trend = weeklyTrend({});
  expect(trend.weeks).toEqual(["2026-09-14", "2026-09-21"]);
  expect(trend.points[0].medianPct).toBeCloseTo(0.1, 6);
  expect(trend.points[0].index).toBe(100);
  // <3 matched series is a gap: null median and null index, never interpolated.
  expect(trend.points[1].sample).toBe(1);
  expect(trend.points[1].medianPct).toBeNull();
  expect(trend.points[1].index).toBeNull();
  expect(trend.summary.insufficient).toBe(true); // fewer than 2 weeks with a median
  expect(trend.summary.sample).toBe(1);

  const empty = weeklyTrend({ country: "kw" });
  expect(empty.weeks).toEqual([]);
  expect(empty.points).toEqual([]);
  expect(empty.summary.insufficient).toBe(true);
});

test("weeklyTrend: carried rows are preserved by history() but never become trend points", () => {
  const latestRecords = [];
  const points = [];
  for (const model of ["M1", "M2", "M3"]) {
    // A carried row stamped with the week, retained in latest.json.
    latestRecords.push(historyPoint(model, WEEK[2], 777, { state: "missing", collectedAt: "2026-10-09T00:00:00.000Z" }));
    points.push(historyPoint(model, WEEK[0], 100), historyPoint(model, WEEK[1], 120));
  }
  hydrate({ latest: feed(latestRecords), history: { apiVersion: "1.1", weeks: WEEK, points } });

  // history() keeps the carried price, clearly marked (OQ-3) ...
  const carried = history("sa", "M1", "retail", "128GB").find((row) => row.week === "2026-09-21");
  expect(carried.value).toBe(777);
  expect(carried.carried).toBe(true);
  expect(carried.state).toBe("missing");

  // ... but it never becomes a trend point, and carries no delta.
  const trend = weeklyTrend({});
  expect(trend.weeks).toEqual(["2026-09-14"]);
  const carriedCell = cell("sa", "M1", "retail", "128GB", "2026-09-21");
  expect(carriedCell.value).toBe(777);
  expect(carriedCell.delta).toBeNull();
  expect(carriedCell.percent).toBeNull();

  // A real observation always beats a carried row in the same week.
  hydrate({
    latest: feed([historyPoint("M1", WEEK[2], 777, { state: "missing", collectedAt: "2026-10-09T00:00:00.000Z" })]),
    history: {
      apiVersion: "1.1",
      weeks: WEEK,
      points: [historyPoint("M1", WEEK[0], 100), historyPoint("M1", WEEK[1], 120), historyPoint("M1", WEEK[2], 150)],
    },
  });
  const merged = cell("sa", "M1", "retail", "128GB", "2026-09-21");
  expect(merged.value).toBe(150);
  expect(merged.state).toBe("live");
  expect(merged.delta).toBe(30); // adjacent real weeks 120 -> 150

  // Deltas need ADJACENT real weeks: a gap stays null, never an interpolation.
  hydrate({
    latest: feed([]),
    history: { apiVersion: "1.1", weeks: WEEK, points: [historyPoint("M1", WEEK[0], 100), historyPoint("M1", WEEK[2], 150)] },
  });
  const gapped = cell("sa", "M1", "retail", "128GB", "2026-09-21");
  expect(gapped.value).toBe(150);
  expect(gapped.delta).toBeNull();
  expect(gapped.percent).toBeNull();
});

test("weeklyTrend: extreme moves stay in the median and are surfaced as suspects (A2)", () => {
  hydrate({
    latest: feed([]),
    history: {
      apiVersion: "1.1",
      weeks: WEEK,
      points: [
        historyPoint("M1", WEEK[0], 100), historyPoint("M1", WEEK[1], 160),
        historyPoint("M2", WEEK[0], 100), historyPoint("M2", WEEK[1], 100),
        historyPoint("M3", WEEK[0], 100), historyPoint("M3", WEEK[1], 90),
      ],
    },
  });
  const trend = weeklyTrend({});
  expect(trend.points[0].sample).toBe(3); // the suspect is still counted
  expect(trend.points[0].medianPct).toBeCloseTo(0, 6); // median of [0.6, 0, -0.1]
  expect(trend.summary.suspects).toHaveLength(1);
  expect(trend.summary.suspects[0]).toMatchObject({
    country: "sa",
    model: "M1",
    week: "2026-09-14",
    from: 100,
    to: 160,
  });
  expect(trend.summary.suspects[0].pct).toBeCloseTo(0.6, 6); // fraction form: >50%
  // ±0.5% (0.005) remains the up/down bucket boundary, not the suspect threshold.
  expect(trend.summary.up).toBe(1);
  expect(trend.summary.down).toBe(1);
  expect(trend.summary.flat).toBe(1);
});

test("spec accessors and spec-filter exclusions", () => {
  const specsFile = {
    generatedAt: "2026-10-11T00:00:00.000Z",
    models: {
      M1: { screenInches: 6.7, batteryMah: 5000, storage: ["128GB", "256GB"] },
      M2: { screenInches: 6.7, batteryMah: null, storage: [] },
    },
  };
  const points = [];
  for (const model of ["M1", "M2", "M3"]) {
    for (let i = 0; i < 4; i += 1) points.push(historyPoint(model, WEEK[i], 100 + i));
  }
  hydrate({ latest: feed([]), specs: specsFile, history: { apiVersion: "1.1", weeks: WEEK, points } });

  expect(specsLoaded()).toBe(true);
  expect(specOf("M1")).toEqual(specsFile.models.M1);
  expect(specOf("M3")).toBeNull();
  expect(specValues("screenInches")).toEqual([6.7]);
  expect(specValues("storage")).toEqual(["128GB", "256GB"]);
  expect(specValues("batteryMah")).toEqual([5000]);

  // No spec entry -> excluded.noSpec (reported, never silently hidden).
  const byScreen = weeklyTrend({ screenInches: '6.7"' });
  expect(byScreen.excluded).toEqual({ missingSpec: 0, noSpec: 1 });
  expect(byScreen.summary.seriesCount).toBe(2);

  // Spec entry without the field -> excluded.missingSpec.
  const byBattery = weeklyTrend({ batteryMah: "5000 mAh" });
  expect(byBattery.excluded).toEqual({ missingSpec: 1, noSpec: 1 });
  expect(byBattery.summary.seriesCount).toBe(1);

  // No active spec filter -> nothing is excluded.
  expect(weeklyTrend({}).excluded).toEqual({ missingSpec: 0, noSpec: 0 });

  // Absent specs.json keeps the app working with empty specs.
  hydrate({ latest: feed([]) });
  expect(specsLoaded()).toBe(false);
  expect(specOf("M1")).toBeNull();
  expect(specValues("screenInches")).toEqual([]);
});

test("dashboard renders config-driven markets, USD prices and freshness", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(page.locator(".freshness")).toBeVisible();
  await expect(page.locator(".freshness")).toContainText("汇率");

  // Timely-update banner: cadence, next refresh, FX date + source.
  const latest = read("public/data/latest.json");
  const fx = read("public/data/fx.json");
  const liveRecords = latest.records.filter(
    (record) => record.week === latest.week && record.state === "live" && Number.isFinite(record.price),
  );
  await expect(page.locator(".freshness")).toContainText(cadenceLabel());
  await expect(page.locator(".next-refresh")).toBeVisible();
  await expect(page.locator(".next-refresh")).toHaveText(/预计下次刷新|刷新已延迟/);
  await expect(page.locator(".freshness")).toContainText(fx.asOf);
  await expect(page.locator(".freshness")).toContainText(
    String(fx.source).replace(/^https?:\/\//, "").split("/")[0],
  );

  // Country filter is data-driven and includes the six priority markets.
  const market = page.getByLabel("市场", { exact: true });
  const options = await market.locator("option").allTextContents();
  for (const label of ["土耳其", "沙特阿拉伯", "阿联酋", "卡塔尔", "阿曼", "约旦", "科威特"]) {
    expect(options).toContain(label);
  }

  await expect(page.locator(".cell-button").first()).toBeVisible();
  await expect(page.locator(".usd-cell").first()).toContainText("$");
  const channelOptions = await page.getByLabel("渠道", { exact: true }).locator("option").allTextContents();
  const variantOptions = await page.getByLabel("容量", { exact: true }).locator("option").allTextContents();
  expect(channelOptions).toContain("全部渠道");
  expect(variantOptions).toContain("全部容量");
  expect(variantOptions).toContain("容量未标注");
  await expect(page.locator(".matrix-footer")).toContainText("同周最低价");
  await expect(page.locator(".matrix-summary")).toContainText(`${latest.verifiedProductCount} 条已验证价格`);
  await expect(page.locator(".matrix-summary")).toContainText(`${latest.sourceCount} 个来源`);
  const pricedCellCount = await page.locator(".matrix .cell-button").count();
  // Every country/model pair carrying a live current-week price must render as a
  // priced cell. (Was a magic 0.6 ratio; data drift to 127 live records / 76
  // pairs made that ratio off by one, which is not a product signal.)
  const pricedPairs = new Set(liveRecords.map((record) => `${record.country}|${record.model}`));
  expect(pricedCellCount).toBeGreaterThanOrEqual(pricedPairs.size);
  await expect(page.locator(".channel-tag").first()).toBeVisible();
  await expect.poll(() =>
    page.locator(".matrix tbody .country-name").evaluateAll((cells) =>
      cells.every((c) => {
        const img = c.querySelector("img");
        return Boolean(img && img.complete && img.naturalWidth > 0) || Boolean(c.querySelector(".flag-emoji"));
      }),
    ),
  ).toBe(true);
  await page.screenshot({ path: "work/desktop.png", fullPage: true });

  // Filtering to Saudi Arabia keeps only Saudi cells.
  await market.selectOption("sa");
  const rows = await page.locator(".matrix tbody tr").count();
  expect(rows).toBe(1);

  // Kuwait is now covered too (X-cite KWD), so it shows real priced cells + USD.
  await market.selectOption("kw");
  await expect(page.locator(".cell-button").first()).toBeVisible();
  await expect(page.locator(".usd-cell").first()).toContainText("$");

  // Honesty guard: a model genuinely not sold in a market must render an
  // explicit not-for-sale state, never a zero. Türkiye does not list Galaxy A07S.
  await page.getByLabel("重置筛选", { exact: true }).click();
  await market.selectOption("tr");
  await page.getByLabel("搜索型号").fill("A07S");
  await expect(page.locator(".cell-button")).toHaveCount(0);
  await expect(page.locator(".empty-cell").first()).toContainText("未在售");
  await page.getByLabel("重置筛选", { exact: true }).click();

  // Oman was enabled with real eXtra OMR prices, so it now shows priced cells + USD.
  await market.selectOption("om");
  await expect(page.locator(".cell-button").first()).toBeVisible();
  await expect(page.locator(".usd-cell").first()).toContainText("$");

  await page.getByLabel("重置筛选", { exact: true }).click();
  await page.getByLabel("市场", { exact: true }).selectOption("sa");
  await page.getByLabel("渠道", { exact: true }).selectOption("official");
  await page.locator(".cell-button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("周度趋势");
  await expect(page.getByRole("dialog")).toContainText("$");
  await page.getByLabel("显示美元").check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("alternate variant or channel availability is explicit", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const latest = read("public/data/latest.json");
  const modelConfig = read("public/data/models.json");
  const current = latest.records.filter(
    (record) => record.week === latest.week && record.state === "live" && Number.isFinite(record.price),
  );
  const grouped = new Map();
  for (const record of current) {
    const key = `${record.country}|${record.model}`;
    const rows = grouped.get(key) ?? [];
    rows.push(record);
    grouped.set(key, rows);
  }
  const hintCase = [...grouped.entries()]
    .map(([key, rows]) => {
      const [country, model] = key.split("|");
      const config = modelConfig.models.find((candidate) => candidate.id === model);
      const present = new Set(rows.map((row) => row.variant));
      const missingVariant = config?.variants?.find((candidate) => !present.has(candidate));
      return missingVariant ? { country, model, missingVariant } : null;
    })
    .find(Boolean);
  expect(hintCase).toBeTruthy();

  await page.goto("/");
  await expect(page.locator(".freshness")).toBeVisible();
  await page.getByLabel("市场", { exact: true }).selectOption(hintCase.country);
  await page.getByLabel("容量", { exact: true }).selectOption(hintCase.missingVariant);
  await expect(page.locator(".empty-cell.has-hint").first()).toBeVisible();
  await expect(page.locator(".empty-cell.has-hint").first()).toContainText(/仅|可选/);
  await expect(page.locator(".empty-cell.has-hint").first()).not.toContainText("未在售");
  expect(errors).toEqual([]);
});

test("refresh button re-fetches in place and updates the last-checked timestamp", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const button = page.getByRole("button", { name: /刷新数据/ });
  const stamp = page.locator(".last-checked");
  await expect(stamp).toBeVisible();
  await expect(stamp).not.toHaveText("最近检查 —");

  const before = await stamp.getAttribute("data-ts");
  expect(before).toBeTruthy();

  // The refresh must reuse the cache-busting fetch and never reload the page.
  await page.evaluate(() => {
    window.__reloadCount = 0;
    window.addEventListener("beforeunload", () => {
      window.__reloadCount += 1;
    });
  });

  await Promise.all([
    page.waitForResponse((r) => /data\/latest\.json/.test(r.url())),
    button.click(),
  ]);

  await expect.poll(async () => stamp.getAttribute("data-ts")).not.toBe(before);
  await expect(page.getByRole("status")).toContainText("数据已刷新");
  await expect(button).toBeEnabled();
  await expect(page.locator(".cell-button").first()).toBeVisible();

  const reloadCount = await page.evaluate(() => window.__reloadCount);
  expect(reloadCount).toBe(0);
  expect(errors).toEqual([]);
});

test("every visible cell's USD equals round(local × fx.rates[currency], 2)", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const fx = read("public/data/fx.json");
  await page.goto("/");
  await expect(page.locator(".cell-button").first()).toBeVisible();

  const checked = await page.locator(".cell-button").evaluateAll(
    (buttons, { rates, digits }) =>
      buttons.map((b) => {
        const local = b.querySelector(".price")?.textContent?.replace(/[^\d.,-]/g, "") ?? "";
        const usdText = b.querySelector(".usd-cell")?.textContent?.trim() ?? "";
        // Find the row's currency from the row header (e.g. "SAR").
        const row = b.closest("tr");
        const currency = row?.querySelector("th small")?.textContent?.trim() ?? "";
        const rate = rates[currency];
        return { local, usdText, currency, rate, digits };
      }),
    { rates: fx.rates, digits: 2 },
  );
  expect(checked.length).toBeGreaterThan(0);

  for (const item of checked) {
    if (item.rate == null) {
      expect(item.usdText).toBe("FX 不可用");
      continue;
    }
    // Parse the localized local price (may contain thousands separators).
    const local = Number(item.local.replace(/,/g, ""));
    expect(Number.isFinite(local)).toBe(true);
    const expected = (Math.round(local * item.rate * 100) / 100)
      .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(item.usdText).toBe(`$${expected}`);
  }
  expect(errors).toEqual([]);
});
