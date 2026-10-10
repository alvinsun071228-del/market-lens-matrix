/**
 * UI weekly spec (WC §5) — R2 spec drawer, R3 seven filters, R4 weekly trend.
 *
 * Every test runs on fixtures served through `page.route`, so the suite passes
 * whether or not the researched `public/data/specs.json` exists and never
 * depends on its contents. Assertions cover: no `pageerror`, all seven filters
 * present in one bar and each narrowing the matrix, the header model button
 * opening the spec drawer (Enter/Space) with Escape closing it and returning
 * focus, and the trend section rendering either real numbers or an explicit
 * insufficient state.
 */
import { test, expect } from "@playwright/test";

const W0 = "2026-09-14";
const W1 = "2026-09-21";
const W2 = "2026-09-28";
const W3 = "2026-10-05";
const STAMP = "2026-10-11T00:00:00.000Z";
const FX_RATES = { SAR: 0.2666, AED: 0.2723 };

const usdOf = (price, currency) => Math.round(price * FX_RATES[currency] * 100) / 100;

/* ------------------------------- fixtures -------------------------------- */

const MARKETS = {
  generatedAt: STAMP,
  brands: [
    { id: "samsung", name: "Samsung", series: ["Galaxy A", "Galaxy S"] },
    { id: "other", name: "Other Brand", series: ["Other"] },
  ],
  channels: [
    { id: "official", name: "官方商城" },
    { id: "retail", name: "零售渠道" },
  ],
  countries: [
    { id: "sa", name: "沙特阿拉伯", currency: "SAR", url: "https://example.com/sa", retailers: [] },
    { id: "ae", name: "阿联酋", currency: "AED", url: "https://example.com/ae", retailers: [] },
  ],
};

const MODEL_META = [
  { id: "S1", name: "Galaxy S1", series: "Galaxy A", brandId: "samsung", variants: ["128GB"] },
  { id: "S2", name: "Galaxy S2", series: "Galaxy A", brandId: "samsung", variants: ["128GB", "256GB"] },
  { id: "S3", name: "Galaxy S3", series: "Galaxy S", brandId: "samsung", variants: ["512GB"] },
  { id: "S4", name: "Galaxy S4", series: "Galaxy S", brandId: "samsung", variants: ["64GB"] },
  { id: "X1", name: "Other X1", series: "Other", brandId: "other", variants: ["128GB"] },
];

// A retired id: present in the weekly history but absent from models.json, so
// its brand can only be attributed by the row's own verbatim `brand` field
// (WC §2 rule 7). The capitalised spelling mirrors the real artifact's mix of
// `samsung`/`Samsung`, which the case-insensitive `sameText` must absorb.
const RETIRED = { id: "R9", name: "Galaxy R9", series: "Galaxy A", brandId: "Samsung", variants: ["128GB"] };

const metaOf = (id) => MODEL_META.find((m) => m.id === id) ?? (id === RETIRED.id ? RETIRED : null);

const MODELS = {
  totalModels: MODEL_META.length,
  models: MODEL_META.map((m) => ({
    ...m,
    countries: {
      sa: { available: true, channels: ["retail", "official"], lastSeen: W3, currency: "SAR" },
      ae: { available: true, channels: ["retail"], lastSeen: W3, currency: "AED" },
    },
  })),
};

const SPECS = {
  generatedAt: STAMP,
  models: {
    S1: {
      display: '6.2" OLED 90Hz',
      screenInches: 6.2,
      batteryMah: 4000,
      storage: ["128GB"],
      ramGb: 6,
      chipset: "Chip A",
      releaseYear: 2024,
      sources: ["https://example.com/s1"],
      confidence: "official",
    },
    S2: {
      display: '6.7" AMOLED 120Hz',
      screenInches: 6.7,
      batteryMah: 5000,
      storage: ["128GB", "256GB"],
      ramGb: null,
      chipset: null,
      releaseYear: null,
      sources: ["https://example.com/s2"],
      confidence: "retailer",
    },
    S3: {
      display: null,
      screenInches: null,
      batteryMah: null,
      storage: [],
      ramGb: 8,
      chipset: "Chip C",
      releaseYear: 2025,
      sources: [],
      confidence: "unverified",
    },
    X1: {
      display: '6.7" LCD',
      screenInches: 6.7,
      batteryMah: 5000,
      storage: ["1TB"],
      ramGb: 12,
      chipset: "Chip X",
      releaseYear: 2025,
      sources: ["https://example.com/x1"],
      confidence: "official",
    },
    // S4 intentionally has no spec entry at all.
  },
};

// Saudi retail is the only series with adjacent real weeks -> the A3
// "sample only from one market/channel" case, plus one >50% suspect (S4).
const SERIES = [
  { model: "S1", variant: "128GB", prices: [100, 100, 95, 90] },
  { model: "S2", variant: "128GB", prices: [200, 200, 190, 180] },
  { model: "S2", variant: "256GB", prices: [230, 230, 220, 215] },
  { model: "S3", variant: "512GB", prices: [300, 300, 315, 330] },
  { model: "S4", variant: "64GB", prices: [400, 400, 380, 1000] },
  { model: "X1", variant: "128GB", prices: [800, 800, 840, 760] },
];

const sourceUrl = (country, model, variant, channel) =>
  `https://example.com/${country}/${model}/${variant}/${channel}`;

const sourced = (row) => ({
  sourceId: `${row.country}-${row.model}-${row.variant}-${row.channel}`,
  sourceUrl: sourceUrl(row.country, row.model, row.variant, row.channel),
  collectedAt: STAMP,
  rawEvidence: {
    method: "fixture",
    sourceId: `${row.country}-${row.model}-${row.variant}-${row.channel}`,
    priceText: `${row.currency}${row.price}`,
  },
});

const record = (country, channel, { model, variant }, week, price, offset = 0) => {
  const meta = metaOf(model);
  const amount = price + offset;
  const currency = country === "sa" ? "SAR" : "AED";
  const row = { country, model, variant, channel, week, price: amount, currency };
  return {
    country,
    // Real collected fields, carried verbatim (WC §2 rule 7) — including the
    // mixed-case `Samsung` spelling for the retired id.
    brand: meta?.brandId ?? null,
    series: meta?.series ?? null,
    model,
    modelName: meta?.name ?? model,
    variant,
    channel,
    retailer: `${channel}-${country}`,
    productId: `${model}-${variant}`,
    title: `${meta?.name ?? model} ${variant}`,
    price: amount,
    currency,
    priceUsd: usdOf(amount, currency),
    collectorVersion: "1.1",
    availability: "in_stock",
    state: "live",
    week,
    collectedAt: STAMP,
    effectiveDate: week,
    ...sourced(row),
  };
};

const point = (country, channel, { model, variant }, week, price) => {
  const meta = metaOf(model);
  const currency = country === "sa" ? "SAR" : "AED";
  const row = { country, model, variant, channel, week, price, currency };
  return {
    country,
    brand: meta?.brandId ?? null,
    series: meta?.series ?? null,
    model,
    channel,
    variant,
    week,
    price,
    currency,
    priceUsd: usdOf(price, currency),
    state: "live",
    effectiveDate: week,
    ...sourced(row),
  };
};

const HISTORY_POINTS = [W0, W1, W2].flatMap((week, index) =>
  SERIES.map((series) => point("sa", "retail", series, week, series.prices[index])),
);

/** W3 lives in latest.json (the contract keeps the current week out of history). */
const LATEST_RECORDS = [
  ...SERIES.map((series) => record("sa", "retail", series, W3, series.prices[3])),
  // One official price for S1 only: the 渠道 filter must change the matrix, and
  // official has no adjacent weeks, so the trend honestly reports "insufficient".
  record("sa", "official", { model: "S1", variant: "128GB" }, W3, 120),
  // Another market, current week only -> priced AE cells but no matched weeks.
  ...SERIES.map((series) => record("ae", "retail", series, W3, series.prices[3], 10)),
];

const LATEST = {
  apiVersion: "1.1",
  mode: "live",
  collectedAt: STAMP,
  week: W3,
  sourceCount: 3,
  verifiedProductCount: LATEST_RECORDS.length,
  failedSources: [],
  fx: { base: "USD", asOf: "2026-10-11", source: "fixture", rates: FX_RATES },
  records: LATEST_RECORDS,
};

const HISTORY = {
  apiVersion: "1.1",
  generatedAt: STAMP,
  weeks: [W0, W1, W2],
  points: HISTORY_POINTS,
};

const FX = { base: "USD", asOf: "2026-10-11", source: "fixture", rates: FX_RATES };

/** Two comparable series per week: too thin for a median (medianPct = null). */
const THIN_HISTORY = {
  apiVersion: "1.1",
  generatedAt: STAMP,
  weeks: [W0, W1, W2],
  points: [W0, W1, W2].flatMap((week, index) =>
    SERIES.filter((series) => series.model === "S1" || series.model === "S2").map((series) =>
      point("sa", "retail", series, week, series.prices[index]),
    ),
  ),
};

const THIN_LATEST = {
  ...LATEST,
  records: SERIES.filter((series) => series.model === "S1" || series.model === "S2").map((series) =>
    record("sa", "retail", series, W3, series.prices[3]),
  ),
};

/**
 * Brand-scope regression fixture (WC §2 rule 7 / A1).
 *
 * Only S1 + S2 are in models.json (both `samsung`); R9 exists solely in the
 * weekly history under the verbatim brand `Samsung`. S1/S2 ship `samsung`, R9
 * ships `Samsung` and is absent from models.json, so it can only stay in a
 * `brand: "samsung"` scope through case-insensitive matching on the row's own
 * brand. Drop it and matched falls to 2 -> medianPct null -> insufficient.
 */
const BRAND_SERIES = [
  { model: "S1", variant: "128GB", prices: [100, 100, 95, 90] },
  { model: "S2", variant: "128GB", prices: [200, 200, 190, 180] },
  { model: "R9", variant: "128GB", prices: [300, 300, 315, 330] },
];

const BRAND_MODELS = {
  totalModels: 2,
  models: MODELS.models.filter((m) => m.id === "S1" || m.id === "S2"),
};

const BRAND_HISTORY = {
  apiVersion: "1.1",
  generatedAt: STAMP,
  weeks: [W0, W1, W2],
  points: [W0, W1, W2].flatMap((week, index) =>
    BRAND_SERIES.map((series) => point("sa", "retail", series, week, series.prices[index])),
  ),
};

const BRAND_RECORDS = BRAND_SERIES.map((series) => record("sa", "retail", series, W3, series.prices[3]));

const BRAND_LATEST = {
  ...LATEST,
  sourceCount: 1,
  verifiedProductCount: BRAND_RECORDS.length,
  records: BRAND_RECORDS,
};

/* ------------------------------- helpers --------------------------------- */

async function mount(page, overrides = {}) {
  const files = {
    "markets.json": MARKETS,
    "models.json": MODELS,
    "latest.json": LATEST,
    "fx.json": FX,
    "specs.json": SPECS,
    "history.json": HISTORY,
    ...overrides,
  };
  await page.route("**/data/*.json*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    const body = files[name];
    if (!body) return route.fulfill({ status: 404, contentType: "application/json", body: "null" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await expect(page.locator("section.filters")).toBeVisible();
  await expect.poll(() => page.locator(".matrix .model-button").count()).toBeGreaterThan(0);
}

const columns = (page) => page.locator(".matrix .model-button strong");
const rows = (page) => page.locator(".matrix tbody .country-name strong");

/** Reset every filter, re-pin the week, then apply one filter (WC §5 R3). */
async function applyFilter(page, label, value) {
  await page.getByLabel("重置筛选", { exact: true }).click();
  await page.getByLabel("周次", { exact: true }).selectOption(W3);
  if (label === "搜索型号") await page.getByLabel("搜索型号").fill(value);
  else await page.getByLabel(label, { exact: true }).selectOption(value);
}

test("seven filters are visible in one bar and each narrows the matrix", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1200 });
  await mount(page);
  await page.getByLabel("周次", { exact: true }).selectOption(W3);

  const bar = page.locator("section.filters");
  for (const label of ["市场", "渠道", "品牌", "系列", "屏幕尺寸", "容量", "电池"]) {
    await expect(bar.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(bar.getByLabel("搜索型号")).toBeVisible();
  await expect(bar.getByLabel("重置筛选")).toBeVisible();
  // The old 更多筛选 toggle is gone: nothing is hidden behind a second click.
  await expect(page.getByText("更多筛选")).toHaveCount(0);
  // Only values actually published in specs.json are offered.
  await expect(page.getByLabel("屏幕尺寸", { exact: true }).locator("option")).toHaveText([
    "全部屏幕尺寸",
    '6.2"',
    '6.7"',
  ]);
  await expect(page.getByLabel("电池", { exact: true }).locator("option")).toHaveText([
    "全部电池容量",
    "4000 mAh",
    "5000 mAh",
  ]);

  // Default scope is the first configured brand (restored pre-existing default),
  // which is also the trend's default scope — see the R4 tests.
  await expect(page.getByLabel("品牌", { exact: true })).toHaveValue("samsung");
  await expect(columns(page)).toHaveText(["Galaxy S1", "Galaxy S2", "Galaxy S3", "Galaxy S4"]);
  await expect(rows(page)).toHaveText(["沙特阿拉伯", "阿联酋"]);
  await expect(page.locator(".matrix .cell-button")).toHaveCount(8);

  // 1. 市场 narrows the rows.
  await applyFilter(page, "市场", "sa");
  await expect(rows(page)).toHaveText(["沙特阿拉伯"]);
  await expect(page.locator("section.trend .trend-scope")).toContainText("市场：沙特阿拉伯");

  // 2. 渠道 narrows the priced cells (only S1 has a Saudi official price).
  await applyFilter(page, "渠道", "official");
  await expect(page.locator(".matrix .cell-button")).toHaveCount(1);
  await expect(page.locator(".matrix .cell-button .price")).toContainText("120");
  // The trend follows the filter scope and honestly reports the thin sample.
  await expect(page.locator("section.trend .trend-thin")).toBeVisible();

  // 3. 品牌 narrows the columns: 全部品牌 adds the non-Samsung model back.
  await applyFilter(page, "品牌", "all");
  await expect(columns(page)).toHaveText(["Galaxy S1", "Galaxy S2", "Galaxy S3", "Galaxy S4", "Other X1"]);
  await applyFilter(page, "品牌", "samsung");
  await expect(columns(page)).toHaveText(["Galaxy S1", "Galaxy S2", "Galaxy S3", "Galaxy S4"]);

  // 4. 系列 narrows the columns.
  await applyFilter(page, "系列", "Galaxy A");
  await expect(columns(page)).toHaveText(["Galaxy S1", "Galaxy S2"]);

  // 5. 屏幕尺寸 narrows the columns and reports models dropped for missing data.
  await applyFilter(page, "屏幕尺寸", "6.2");
  await expect(columns(page)).toHaveText(["Galaxy S1"]);
  await expect(page.locator(".spec-exclusion")).toContainText("1 个型号因缺少规格数据被排除");

  // 6. 容量 matches a model variant ...
  await applyFilter(page, "容量", "512GB");
  await expect(columns(page)).toHaveText(["Galaxy S3"]);
  // ... or a researched specs.storage value that is not a model variant
  // (1TB belongs to the other brand, so widen the brand scope to see it).
  await applyFilter(page, "容量", "1TB");
  await page.getByLabel("品牌", { exact: true }).selectOption("all");
  await expect(columns(page)).toHaveText(["Other X1"]);

  // 7. 电池 narrows the columns.
  await applyFilter(page, "电池", "4000");
  await expect(columns(page)).toHaveText(["Galaxy S1"]);

  // Search still narrows too.
  await applyFilter(page, "搜索型号", "S2");
  await expect(columns(page)).toHaveText(["Galaxy S2"]);

  // Reset clears everything again, including back to the default brand.
  await page.getByLabel("重置筛选", { exact: true }).click();
  await page.getByLabel("周次", { exact: true }).selectOption(W3);
  await expect(page.getByLabel("品牌", { exact: true })).toHaveValue("samsung");
  await expect(columns(page)).toHaveText(["Galaxy S1", "Galaxy S2", "Galaxy S3", "Galaxy S4"]);
  await expect(page.locator(".spec-exclusion")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("R2: header model button opens the spec drawer and Escape returns focus", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mount(page);
  await page.getByLabel("周次", { exact: true }).selectOption(W3);

  const button = page.getByRole("button", { name: "Galaxy S1 产品规格" });
  await expect(button).toBeVisible();
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Galaxy S1 · 产品规格");
  for (const label of ["屏幕尺寸", "电池容量", "容量（存储）", "运行内存", "芯片", "发布时间", "来源链接"]) {
    await expect(dialog).toContainText(label);
  }
  await expect(dialog.locator(".spec-row", { hasText: "屏幕尺寸" }).locator("dd")).toContainText('6.2"');
  // The researched `display` string already opens with the size, so the row must
  // print it once (value column) and keep the panel detail in the note.
  const screenCell = dialog.locator(".spec-row", { hasText: "屏幕尺寸" }).locator("dd");
  await expect(screenCell).toContainText("OLED 90Hz");
  expect((await screenCell.innerText()).split('6.2"').length - 1).toBe(1);
  await expect(dialog.locator(".spec-row", { hasText: "电池容量" }).locator("dd")).toContainText("4000 mAh");
  await expect(dialog.locator(".spec-row", { hasText: "容量（存储）" }).locator("dd")).toContainText("128GB");
  await expect(dialog.locator(".spec-row", { hasText: "运行内存" }).locator("dd")).toContainText("6 GB");
  await expect(dialog.locator(".spec-row", { hasText: "芯片" }).locator("dd")).toContainText("Chip A");
  await expect(dialog.locator(".spec-row", { hasText: "发布时间" }).locator("dd")).toContainText("2024 年");
  await expect(dialog.locator(".spec-sources a")).toHaveAttribute("href", "https://example.com/s1");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();

  // Space activates it too, and an unknown field renders 暂无数据 — never a guess.
  const second = page.getByRole("button", { name: "Galaxy S2 产品规格" });
  await second.focus();
  await page.keyboard.press(" ");
  const secondDialog = page.getByRole("dialog");
  await expect(secondDialog).toContainText("Galaxy S2 · 产品规格");
  // Same defect shape as the real artifact (`6.7"` + `6.7" AMOLED 120Hz`).
  const secondScreen = secondDialog.locator(".spec-row", { hasText: "屏幕尺寸" }).locator("dd");
  await expect(secondScreen).toContainText("AMOLED 120Hz");
  expect((await secondScreen.innerText()).split('6.7"').length - 1).toBe(1);
  await expect(secondDialog.locator(".spec-row", { hasText: "运行内存" }).locator("dd")).toHaveText("暂无数据");
  await expect(secondDialog.locator(".spec-row", { hasText: "芯片" }).locator("dd")).toHaveText("暂无数据");
  await page.keyboard.press("Escape");
  await expect(secondDialog).toHaveCount(0);

  // A spec entry without the researched field renders 暂无数据, including 来源链接.
  const partial = page.getByRole("button", { name: "Galaxy S3 产品规格" });
  await partial.focus();
  await page.keyboard.press("Enter");
  const partialDialog = page.getByRole("dialog");
  await expect(partialDialog.locator(".spec-row", { hasText: "屏幕尺寸" }).locator("dd")).toHaveText("暂无数据");
  await expect(partialDialog.locator(".spec-row", { hasText: "电池容量" }).locator("dd")).toHaveText("暂无数据");
  await expect(partialDialog.locator(".spec-row", { hasText: "容量（存储）" }).locator("dd")).toHaveText("暂无数据");
  await expect(partialDialog.locator(".spec-row", { hasText: "运行内存" }).locator("dd")).toContainText("8 GB");
  await expect(partialDialog.locator(".spec-sources-empty")).toHaveText("暂无数据");
  await page.keyboard.press("Escape");
  await expect(partialDialog).toHaveCount(0);
  await expect(partial).toBeFocused();

  // A model with no spec entry: one honest line, no invented rows.
  const missing = page.getByRole("button", { name: "Galaxy S4 产品规格" });
  await missing.focus();
  await page.keyboard.press("Enter");
  const missingDialog = page.getByRole("dialog");
  await expect(missingDialog).toContainText("Galaxy S4 暂无已核实的规格数据");
  await expect(missingDialog.locator(".spec-grid")).toHaveCount(0);
  await expect(missingDialog.locator(".spec-row")).toHaveCount(0);
  await expect(missingDialog.locator("a")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(missingDialog).toHaveCount(0);
  await expect(missing).toBeFocused();

  expect(errors).toEqual([]);
});

test("R4: trend section renders index, per-week sample, A2 suspects and A3 concentration", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1400 });
  await mount(page);
  await page.getByLabel("周次", { exact: true }).selectOption(W3);

  const trend = page.locator("section.trend");
  await expect(trend).toBeVisible();
  await expect(trend).toContainText("本周价格变化趋势");
  await expect(trend.locator(".trend-chart")).toBeVisible();
  // The default scope is the first configured brand (samsung), which leaves a
  // real 4-model series — not the 样本不足 state.
  await expect(trend.locator(".trend-thin")).toHaveCount(0);
  await expect(trend.locator(".trend-week")).toHaveCount(3);
  await expect(trend.locator(".trend-week").first()).toContainText(W1);
  await expect(trend.locator(".trend-week").nth(1)).toContainText("指数 95.00");
  await expect(trend.locator(".trend-week").last()).toContainText(W3);
  await expect(trend.locator(".trend-week").last()).toContainText("指数 94.76");
  await expect(trend.locator(".trend-week").last()).toContainText("可比样本 4");

  const summary = trend.locator(".trend-summary");
  await expect(summary).toContainText("可比样本 4 项");
  await expect(summary).toContainText("上涨 2");
  await expect(summary).toContainText("下跌 2");
  await expect(summary).toContainText("持平 0");
  // medianPct is a FRACTION: -0.0025 must render as -0.3%, not -0.0%.
  await expect(summary).toContainText("-0.3%");
  // A2: extreme moves are named, never deleted or smoothed.
  await expect(summary).toContainText("疑似异常，需核对来源");
  await expect(summary.locator(".trend-suspects li")).toHaveCount(1);
  await expect(summary.locator(".trend-suspects")).toContainText("+163.2%");
  await expect(summary).toContainText("S4");
  // A3: the single contributing market and channel are named.
  await expect(summary).toContainText("样本仅来自沙特阿拉伯 · 零售渠道");
  // The section states its scope and that it is a weekly snapshot.
  await expect(trend.locator(".trend-scope")).toContainText("全部市场");
  await expect(trend.locator(".trend-scope")).toContainText("品牌：Samsung");
  await expect(trend).toContainText("非实时");
  await expect(trend.locator(".trend-method")).toContainText("不跨币种换算");
  // The matrix and signals above it are untouched.
  await expect(page.locator("section.signals")).toBeVisible();
  await expect(page.locator(".matrix .cell-button").first()).toBeVisible();

  await trend.screenshot({ path: "/tmp/ui-weekly-trend.png" });

  // Widening the brand scope feeds the other brand's model into the same chart.
  await applyFilter(page, "品牌", "all");
  await expect(trend.locator(".trend-scope")).toContainText("全部品牌");
  await expect(trend.locator(".trend-thin")).toHaveCount(0);
  await expect(trend.locator(".trend-week").last()).toContainText("指数 90.00");
  await expect(trend.locator(".trend-week").last()).toContainText("可比样本 5");
  await expect(summary).toContainText("可比样本 5 项");
  await expect(summary).toContainText("下跌 3");
  await expect(summary).toContainText("-5.3%");
  await expect(summary.locator(".trend-suspects li")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("R3: missing specs.json degrades honestly with no invented options", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mount(page, { "specs.json": null });
  await page.getByLabel("周次", { exact: true }).selectOption(W3);
  await expect(columns(page)).toHaveText(["Galaxy S1", "Galaxy S2", "Galaxy S3", "Galaxy S4"]);

  const note = page.locator("section.filters .filter-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText("规格数据未载入或缺失");

  const screen = page.getByLabel("屏幕尺寸", { exact: true });
  const battery = page.getByLabel("电池", { exact: true });
  await expect(screen).toBeVisible();
  await expect(battery).toBeVisible();
  await expect(screen.locator("option")).toHaveText(["全部屏幕尺寸"]);
  await expect(battery.locator("option")).toHaveText(["全部电池容量"]);
  await expect(page.locator(".spec-exclusion")).toHaveCount(0);

  // The spec drawer degrades to one honest line instead of invented rows.
  await page.getByRole("button", { name: "Galaxy S1 产品规格" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("暂无已核实的规格数据");
  await expect(dialog.locator(".spec-row")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // The matrix and the trend still run on the published weekly points.
  await expect(page.locator(".matrix .cell-button").first()).toBeVisible();
  await expect(page.locator("section.trend .trend-chart")).toBeVisible();
  expect(errors).toEqual([]);
});

test("R4: a thin sample says 本周可比样本不足 instead of inventing a trend", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mount(page, { "history.json": THIN_HISTORY, "latest.json": THIN_LATEST });
  await page.getByLabel("周次", { exact: true }).selectOption(W3);

  const trend = page.locator("section.trend");
  await expect(trend).toBeVisible();
  await expect(trend.locator(".trend-empty")).toBeVisible();
  await expect(trend.locator(".trend-chart")).toHaveCount(0);
  await expect(trend.locator(".trend-week")).toHaveCount(0);

  const summary = trend.locator(".trend-summary");
  await expect(summary.locator(".trend-thin")).toBeVisible();
  await expect(summary).toContainText("本周可比样本不足，暂不判断趋势");
  await expect(summary).toContainText("中位数与价格指数均为缺口");
  await expect(summary).not.toContainText("价格指数以");
  expect(errors).toEqual([]);
});

/**
 * Regression for the defect that forced the 品牌 default to "all": `history.json`
 * used to carry no brand/series, so a single-brand scope collapsed the weekly
 * trend to sample 0 / 样本不足 even though models.json had the brand.
 *
 * The fixture makes the case-insensitive, verbatim-only attribution load-bearing:
 * R9 is missing from models.json and its own rows spell the brand `Samsung`
 * (capital S, like 18 of the 138 real points). If it drops out of the scope,
 * matched falls from 3 to 2, `medianPct` becomes null and the section renders
 * the insufficient state instead of the real series asserted below.
 */
test("R4: an active brand scope keeps history-only ids in the trend", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1400 });
  await mount(page, {
    "models.json": BRAND_MODELS,
    "history.json": BRAND_HISTORY,
    "latest.json": BRAND_LATEST,
  });
  // The restored pre-existing default is the first configured brand.
  await expect(page.getByLabel("品牌", { exact: true })).toHaveValue("samsung");
  await page.getByLabel("周次", { exact: true }).selectOption(W3);
  // R9 is not a model: it may not appear in the matrix …
  await expect(columns(page)).toHaveText(["Galaxy S1", "Galaxy S2"]);

  const trend = page.locator("section.trend");
  await expect(trend).toBeVisible();
  // … but it is a weekly series, so it must count inside the brand scope.
  await expect(trend.locator(".trend-thin")).toHaveCount(0);
  await expect(trend.locator(".trend-empty")).toHaveCount(0);
  await expect(trend.locator(".trend-chart")).toBeVisible();
  await expect(trend.locator(".trend-week")).toHaveCount(3);
  await expect(trend.locator(".trend-week").nth(1)).toContainText("指数 95.00");
  await expect(trend.locator(".trend-week").last()).toContainText(W3);
  await expect(trend.locator(".trend-week").last()).toContainText("指数 90.00");
  await expect(trend.locator(".trend-week").last()).toContainText("可比样本 3");
  await expect(trend.locator(".trend-scope")).toContainText("品牌：Samsung");

  const summary = trend.locator(".trend-summary");
  await expect(summary).toContainText("可比样本 3 项");
  await expect(summary).toContainText("上涨 1");
  await expect(summary).toContainText("下跌 2");
  await expect(summary).toContainText("-5.3%");
  // A2 only fires on genuine outliers; nothing here crosses ±50%.
  await expect(summary.locator(".trend-suspects")).toHaveCount(0);
  // A3 still names the single contributing market and channel.
  await expect(summary).toContainText("样本仅来自沙特阿拉伯 · 零售渠道");
  expect(errors).toEqual([]);
});
