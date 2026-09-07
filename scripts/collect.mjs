import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(new URL("..", import.meta.url).pathname);
const config = JSON.parse(await readFile(resolve(root, "config/sources.json"), "utf8"));
const outputPath = resolve(root, "public/data/latest.json");
const apiPath = resolve(root, "public/api/prices.json");
let previous = null;
try { previous = JSON.parse(await readFile(outputPath, "utf8")); } catch {}
const collectedAt = new Date().toISOString();
const week = collectedAt.slice(0, 10);
const active = config.sources.filter((source) => source.enabled);
const failedSources = [];
const historyPath = resolve(root, "data/history");
const activeIds = new Set(active.map((source) => source.id));
const records = previous?.records?.filter((record) => record.sourceId && activeIds.has(record.sourceId)).map((record) => ({ ...structuredClone(record), week: record.week || record.effectiveDate || record.collectedAt?.slice(0, 10) })) || [];

function parseJsonLd(html, source) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of blocks) {
    try {
      const value = JSON.parse(match[1].trim());
      const items = Array.isArray(value) ? value : [value, ...(value['@graph'] || [])];
      const product = items.find((item) => item.offers?.price || item.price);
      if (!product) continue;
      const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      const price = Number(offer?.price ?? product.price);
      if (Number.isFinite(price)) return { price, currency: offer?.priceCurrency || source.parser.currency };
    } catch {}
  }
  return null;
}

function parseRenderedPrice(text, source) {
  const currency = source.parser.currency;
  const token = currency === "SAR" ? "(?:SR|SAR|ريال)" : currency;
  const match = text.match(new RegExp(`(?:${token}\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)|([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*${token})`, "i"));
  return match ? { price: Number((match[1] || match[2]).replaceAll(",", "")), currency } : null;
}

function parseAmazonCard(card, source) {
  const text = card.text.replace(/\s+/g, " ");
  const modelNumber = source.model.replace("A", "");
  const modelPattern = `(?:\\b${source.model}\\b|(?:galaxy|جالكسي|ايه)\\s*${modelNumber}\\b|سامسونج[^\\n]{0,80}(?:${source.model}|ايه\\s*${modelNumber}))`;
  if (!new RegExp(modelPattern, "i").test(text)) return null;
  if (/case|cover|protector|charger|cable|accessor|حافظة|غطاء|شاحن|كابل|واقي|جراب|كيبل/i.test(text)) return null;
  const storage = source.variant.replace("GB", "");
  if (!new RegExp(`${storage}\\s*(?:GB|جيجابايت|جيجا)`, "i").test(text)) return null;
  const match = text.match(/(?:SAR|SR|ريال)\s*([0-9][0-9,.]*)|([0-9][0-9,.]*)\s*(?:SAR|SR|ريال)/i);
  if (!match) return null;
  const href = card.links.find((link) => /\/dp\//.test(link));
  return { price: Number((match[1] || match[2]).replaceAll(",", "")), currency: source.parser.currency, sourceUrl: href || source.url, title: text, productId: href?.match(/\/dp\/([^/?]+)/)?.[1] || null, rawEvidence: { method: "amazon-search-candidate", text: text.slice(0, 1200) } };
}

function parseAmazonDetail(html, text, source, url) {
  const json = parseJsonLd(html, source);
  const compact = text.replace(/\s+/g, " ");
  const modelNumber = source.model.replace("A", "");
  if (!new RegExp(`(?:\\b${source.model}\\b|Galaxy\\s*${modelNumber})`, "i").test(compact)) return null;
  if (!new RegExp(`${source.variant.replace("GB", "")}\\s*(?:GB|GBs|جيجابايت)`, "i").test(compact)) return null;
  const parsed = json || parseAmazonCard({ text: compact, links: [url] }, source);
  if (!parsed || !Number.isFinite(parsed.price)) return null;
  return { ...parsed, sourceUrl: url, title: json?.title || compact.slice(0, 800), productId: url.match(/\/dp\/([^/?]+)/)?.[1] || null, rawEvidence: { method: json ? "amazon-jsonld-detail" : "amazon-detail-text", title: compact.slice(0, 1200), price: parsed.price } };
}

function upsert(source, result) {
  const index = records.findIndex((record) => record.sourceId === source.id && record.week === week);
  const record = { country: source.country, brand: "Samsung", series: "Galaxy A", model: source.model, variant: source.variant, channel: source.channel, sourceId: source.id, sourceUrl: result.sourceUrl || source.url, productId: result.productId || null, title: result.title || source.name, price: result.price, currency: source.parser.currency, availability: "in_stock", state: "live", week, collectedAt, effectiveDate: week, rawEvidence: result.rawEvidence || { method: source.parser.type } };
  if (index >= 0) records[index] = record; else records.push(record);
}

let browser;
for (const source of active) {
  try {
    let result;
    if (source.parser.type === "amazon-search") {
      browser ||= await chromium.launch({ headless: true });
      const page = await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; MarketLens/1.0; +GitHub Actions)" });
      await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2200);
      const cards = await page.locator('[data-component-type="s-search-result"]').evaluateAll((elements) => elements.map((element) => ({ text: element.innerText, links: [...element.querySelectorAll("a")].map((a) => a.href) })));
      const candidates = cards.map((card) => parseAmazonCard(card, source)).filter((candidate) => candidate?.sourceUrl && /\/dp\//.test(candidate.sourceUrl));
      result = null;
      for (const candidate of candidates) {
        const detail = await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; MarketLens/1.0; +GitHub Actions)" });
        try {
          await detail.goto(candidate.sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
          await detail.waitForTimeout(1200);
          result = parseAmazonDetail(await detail.content(), await detail.locator("body").innerText(), source, candidate.sourceUrl);
          if (result) break;
        } finally { await detail.close(); }
      }
      await page.close();
    } else {
      const response = await fetch(source.url, { headers: { 'user-agent': 'MarketLensPriceBot/1.0 (+GitHub Actions)' }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      result = parseJsonLd(await response.text(), source);
      if (!result && source.parser.type === "browser-text") {
        browser ||= await chromium.launch({ headless: true });
        const page = await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; MarketLens/1.0; +GitHub Actions)" });
        await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(3500);
        result = parseRenderedPrice(await page.locator("body").innerText(), source);
        await page.close();
      }
    }
    if (!result || !Number.isFinite(result.price)) throw new Error("No matching product price found");
    upsert(source, result);
  } catch (error) {
    failedSources.push({ id: source.id, name: source.name, error: error.message });
    const prior = records.find((record) => record.sourceId === source.id && record.price != null);
    if (prior) {
      const index = records.findIndex((record) => record.sourceId === source.id && record.week === week);
      const carried = { ...prior, state: "missing", collectedAt, effectiveDate: prior.effectiveDate || prior.week, rawEvidence: { ...(prior.rawEvidence || {}), failure: error.message, carried: true } };
      if (index >= 0) records[index] = carried; else records.push(carried);
    }
  }
}
if (browser) await browser.close();
const output = { apiVersion: "1.0", mode: records.length ? 'live' : 'empty', collectedAt, week, sourceCount: active.length, verifiedProductCount: records.length, failedSources, records };
await mkdir(resolve(root, 'public/data'), { recursive: true });
await mkdir(resolve(root, 'public/api'), { recursive: true });
await mkdir(historyPath, { recursive: true });
await writeFile(outputPath, JSON.stringify(output, null, 2));
await writeFile(apiPath, JSON.stringify(output, null, 2));
await writeFile(resolve(historyPath, `${week}.json`), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ week, activeSources: active.length, failedSources: failedSources.length, retainedRecords: records.length }));
