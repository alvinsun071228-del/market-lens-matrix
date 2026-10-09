import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cell, history, weeks, records, usd, weekStart, hydrate } from "../src/data.js";

const read = (p) => JSON.parse(readFileSync(resolve(process.cwd(), p), "utf8"));

const STATES = new Set(["live", "missing", "invalid", "unavailable"]);

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

test("dashboard renders config-driven markets, USD prices and freshness", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(page.locator(".freshness")).toBeVisible();
  await expect(page.locator(".freshness")).toContainText("汇率");

  // Country filter is data-driven and includes the six priority markets.
  const market = page.getByLabel("市场", { exact: true });
  const options = await market.locator("option").allTextContents();
  for (const label of ["土耳其", "沙特阿拉伯", "阿联酋", "卡塔尔", "阿曼", "约旦"]) {
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

  // A market without a reachable source renders blank cells, not zeros.
  await market.selectOption("qa");
  await expect(page.locator(".empty-cell").first()).toBeVisible();
  await expect(page.locator(".cell-button")).toHaveCount(0);

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
