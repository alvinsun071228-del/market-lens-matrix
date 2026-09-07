import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { countries, models } from "../src/data.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const config = JSON.parse(await readFile(resolve(root, "config/sources.json"), "utf8"));
const variantList = ["64GB", "128GB", "256GB", "512GB"];
const tasks = countries.flatMap((country) => models.flatMap((model) => variantList.map((variant) => ({ country, model, variant }))));
const report = { generatedAt: new Date().toISOString(), tasks: tasks.length, discovered: [], exact: [], unavailable: [], blocked: [], mismatch: [], review: [] };
const catalog = [];
let browser;
let discoveryPage;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function exactTitle(text, task) {
  const compact = text.replace(/\s+/g, " ");
  const model = new RegExp(`\\b${task.model.id}\\b`, "i").test(compact) || new RegExp(`Galaxy\\s*${task.model.id.replace("A", "")}`, "i").test(compact);
  const variant = compact.includes(task.variant.replace("GB", "GB")) || compact.includes(task.variant.replace("GB", " جيجابايت"));
  return model && variant && !/case|cover|charger|cable|protector|accessor|حافظة|غطاء|شاحن|كابل|واقي|جراب/i.test(compact);
}

async function scanAmazon(task, country) {
  const url = `https://www.amazon.${country.id === "sa" ? "sa" : country.id === "ae" ? "ae" : country.id === "kw" ? "com.kw" : "qa"}/s?k=Samsung+Galaxy+${task.model.id}+${task.variant}`;
  discoveryPage ||= await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; MarketLens/1.0)" });
  try { await discoveryPage.goto(url, { waitUntil: "domcontentloaded", timeout: 2500 }); await sleep(150); const cards = await discoveryPage.locator('[data-component-type="s-search-result"]').evaluateAll((els) => els.map((el) => ({ title: el.innerText, links: [...el.querySelectorAll("a")].map((a) => a.href) }))); return { url, cards }; }
  catch (error) { throw error; }
}

async function run() {
  browser = await chromium.launch({ headless: true });
  for (const task of tasks) {
    const country = task.country;
    try {
      const result = await scanAmazon(task, country);
      const matches = result.cards.filter((card) => exactTitle(card.title, task)).flatMap((card) => card.links.filter((href) => /\/dp\//.test(href)).map((url) => ({ ...task, channel: "retail", sourceId: `amazon-${country.id}`, url, title: card.title, method: "amazon-search" })));
      if (!matches.length) report.unavailable.push({ ...task, source: "amazon", searchUrl: result.url });
      else { report.discovered.push(...matches); report.exact.push(...matches); catalog.push(...matches); }
    } catch (error) { report.blocked.push({ ...task, source: "amazon", error: error.message }); }
  }
  await browser.close();
  await mkdir(resolve(root, "data"), { recursive: true });
  await writeFile(resolve(root, "data/discovery-report.json"), JSON.stringify(report, null, 2));
  await writeFile(resolve(root, "data/source-catalog.json"), JSON.stringify({ generatedAt: report.generatedAt, sources: catalog }, null, 2));
  console.log(JSON.stringify({ tasks: report.tasks, exact: report.exact.length, unavailable: report.unavailable.length, blocked: report.blocked.length }));
}
await run();
