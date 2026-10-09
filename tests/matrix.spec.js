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
  COLLECT_CADENCE_MINUTES,
  STALE_AFTER_MINUTES,
  FX_STALE_AFTER_DAYS,
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

  // A market with no source is blank, never zero.
  const blank = cell("qa", "A16", "retail", "128GB", week);
  expect(blank.value).toBeNull();
  expect(blank.state).toBe("unavailable");
  expect(history("qa", "A16", "retail", "128GB")).toEqual([]);

  // history never invents a point for a week with no stored record.
  const rows = history(country, model, channel, variant);
  expect(rows.length).toBe(new Set(rows.map((r) => r.week)).size);
  expect(records.every((r) => r.sourceId && /^https?:/.test(r.sourceUrl))).toBe(true);
});

test("refresh promise: cadence constant, honest next-refresh clamping, staleness thresholds", () => {
  // The cadence lives in one constant so the schedule and the client agree.
  expect(COLLECT_CADENCE_MINUTES).toBeGreaterThan(0);
  expect(STALE_AFTER_MINUTES).toBe(COLLECT_CADENCE_MINUTES * 3);
  expect(FX_STALE_AFTER_DAYS).toBe(7);
  expect(cadenceLabel()).toMatch(/^每 .+自动采集$/);

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

  // Older than 3× the cadence becomes stale.
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

  // A market still without a reachable source (Kuwait) renders blank cells, not zeros.
  await market.selectOption("kw");
  await expect(page.locator(".empty-cell").first()).toBeVisible();
  await expect(page.locator(".cell-button")).toHaveCount(0);

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
