import { test, expect } from "@playwright/test";
import { cell, history, weeks, records } from "../src/data.js";

test("prices preserve missing observations and correct comparisons", () => {
  expect(
    new Set(
      records.map((r) =>
        [r.country, r.model, r.channel, r.variant, r.week].join("|"),
      ),
    ).size,
  ).toBe(records.length);
  const missing = cell("kw", "A25", "official", "128GB", weeks.at(-1));
  expect(missing.price).toBeNull();
  expect(missing.carried).toBe(true);
  expect(missing.value).toBe(missing.previous);
  expect(missing.delta).toBe(0);
  expect(cell("sa", "A06", "official", "128GB", weeks[0]).percent).toBeNull();
  const normal = cell("sa", "A35", "retail", "256GB", weeks.at(-1));
  expect(normal.percent).toBeCloseTo(
    ((normal.value - normal.previous) / normal.previous) * 100,
  );
  expect(history("sa", "A35", "retail", "256GB").length).toBe(12);
});
test("matrix filters, detail, exports and keyboard", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("http://localhost:5173");
  await expect(page.locator(".cell-button")).toHaveCount(24);
  await expect.poll(()=>page.locator('.country-name img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
  await page.screenshot({ path: "work/desktop.png", fullPage: true });
  await page.getByLabel("市场", { exact: true }).selectOption("sa");
  await expect(page.locator(".cell-button")).toHaveCount(6);
  await page.getByLabel("搜索型号").fill("A35");
  await expect(page.locator(".cell-button")).toHaveCount(1);
  await page.getByLabel("重置筛选", { exact: true }).click();
  await page.getByLabel("仅异常").check();
  await expect(page.locator(".cell-button")).toHaveCount(2);
  await page.getByLabel("仅异常").uncheck();
  await page.getByLabel("容量", { exact: true }).selectOption("256GB");
  await expect(page.locator(".cell-button")).toHaveCount(20);
  await page.getByLabel("重置筛选", { exact: true }).click();
  await page.getByRole("button", { name: "更多筛选" }).click();
  await page.getByLabel("品牌", { exact: true }).selectOption("Samsung");
  await page.getByLabel("系列", { exact: true }).selectOption("Galaxy A");
  await page.getByRole("button", { name: "更多筛选" }).click();
  await page.getByLabel("周次", { exact: true }).selectOption(weeks[0]);
  await expect(page.locator(".cell-button").first()).toContainText("暂无环比");
  await page.getByLabel("周次", { exact: true }).selectOption(weeks.at(-1));
  const trigger = page.getByRole("button", {
    name: "沙特阿拉伯 Galaxy A35 价格详情",
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".record")).toHaveCount(12);
  await dialog.getByLabel("时间范围").selectOption("4");
  await expect(dialog.locator(".record")).toHaveCount(4);
  await dialog.getByLabel("渠道", { exact: true }).selectOption("retail");
  await dialog.getByLabel("容量", { exact: true }).selectOption("256GB");
  await expect(dialog.locator(".recharts-line")).toHaveCount(2);
  await dialog.getByLabel("对比渠道").uncheck();
  await expect(dialog.locator(".recharts-line")).toHaveCount(1);
  await page.screenshot({ path: "work/detail.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 CSV" }).click();
  expect((await download).suggestedFilename()).toContain(weeks.at(-1));
  await page.getByRole("button", { name: "数据来源", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("已连接 1 个数据源");
  await page.getByLabel("关闭详情").click();
  await page.getByRole("button", { name: /查看全部/ }).click();
  expect(await page.locator(".signal").count()).toBeGreaterThan(4);
  await page.getByRole("button", { name: /收起/ }).click();
  await page.getByLabel("搜索型号").fill("not found");
  await expect(page.getByText("没有匹配的型号")).toBeVisible();
  await page
    .getByRole("button", { name: "重置筛选", exact: true })
    .last()
    .click();
  expect(errors).toEqual([]);
});
test("mobile layout and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://localhost:5173");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  const first = page.locator("tbody th").first();
  const left = (await first.boundingBox()).x;
  await page.locator(".matrix-scroll").evaluate((e) => (e.scrollLeft = 450));
  expect((await first.boundingBox()).x).toBeCloseTo(left, 0);
  await page.screenshot({ path: "work/mobile.png", fullPage: true });
  await page.locator(".matrix-scroll").evaluate((e) => (e.scrollLeft = 0));
  await page.locator(".cell-button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: "work/mobile-detail.png", fullPage: true });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
});
