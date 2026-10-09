/**
 * Market Lens collector (contract v1.1).
 *
 * Reads config/sources.json, refreshes FX, collects real prices from each
 * enabled retailer/brand source, and writes:
 *   public/data/latest.json   normalized records + fx + failedSources
 *   public/api/prices.json    byte-identical mirror of latest.json
 *   data/history/<date>.json  daily snapshot
 *
 * Hard rules: a price only ever comes from a real fetch that carries a
 * sourceId + sourceUrl + collectedAt + rawEvidence. When a source fails we
 * carry its previous record forward marked `missing` (original effectiveDate
 * preserved) or omit it entirely. We never invent a number.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { refreshFx, fxBlock, toUsd } from "./fx.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const config = JSON.parse(await readFile(resolve(root, "config/sources.json"), "utf8"));
const latestPath = resolve(root, "public/data/latest.json");
const apiPath = resolve(root, "public/api/prices.json");
const historyDir = resolve(root, "data/history");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** ISO week start (Monday, UTC) — the `week` key used across the app. */
export function weekStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

const verifiedRef = (source) => ({ method: source.parser, sourceId: source.id, sourceName: source.name });

let previous = null;
try {
  previous = JSON.parse(await readFile(latestPath, "utf8"));
} catch {}

// Always refresh; refreshFx() falls back to the last file (stale:true) on failure.
const fx = await refreshFx();
const collectedAt = new Date().toISOString();
const week = weekStart();
const activeSources = config.sources.filter((s) => s.enabled);
const knownIds = new Set(config.sources.map((s) => s.id));
const failedSources = [];

// Seed with prior records (all weeks) so trends keep their history. USD is
// backfilled with the current dated rate; a missing rate still yields null.
const records = (previous?.records ?? [])
  .filter((r) => r?.sourceId && knownIds.has(r.sourceId) && r.week !== week)
  .map((r) => {
    const copy = structuredClone(r);
    const source = config.sources.find((s) => s.id === copy.sourceId);
    // Normalize legacy rows written before the v1.1 schema.
    if (!copy.currency) copy.currency = source?.currency ?? null;
    if (!copy.brand) copy.brand = config.brand;
    if (!copy.series && copy.model) copy.series = `Galaxy ${String(copy.model)[0]}`;
    if (!copy.channel) copy.channel = source?.channel ?? "retail";
    if (copy.price != null && copy.currency) copy.priceUsd = toUsd(copy.price, copy.currency, fx);
    return copy;
  })
  // A priced row without a convertible currency cannot be shown honestly.
  .filter((r) => r.price == null || Number.isFinite(fx?.rates?.[r.currency]))
  // Amazon history written before the v1.1 matcher rewrite came from a
  // different (unreliable) product match, so it is not comparable and would
  // fake a price crash. Drop it rather than chart it.
  .filter((r) => !(r.sourceId?.startsWith("amazon-") && !r.collectorVersion));

const keyOf = (r) => [r.country, r.brand, r.model, r.variant, r.channel, r.sourceId, r.week].join("|");

function normalizeName(title) {
  return String(title || "")
    .replace(/\s*\((?:Samsung\.com|Online)[^)]*\)/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveModel(title) {
  const m = String(title).match(/Galaxy\s+([ASZMF]\d{2}[A-Za-z]?)/i);
  if (!m) return null;
  return m[1].toUpperCase();
}

function deriveVariant(title, url) {
  const fromUrl = String(url || "").match(/-(\d{2,4})\s?gb(?![a-z])/i);
  if (fromUrl) return `${fromUrl[1]}GB`;
  const fromTitle = String(title || "").match(/(\d{2,4})\s?GB/i);
  if (fromTitle) return `${fromTitle[1]}GB`;
  return "N/A";
}

const seriesOf = (model) => (model ? `Galaxy ${model[0]}` : null);

/**
 * Parse a localized price. TRY writes 13.299 (dot=thousands, comma=decimal);
 * the Gulf currencies write 1,429.96 (comma=thousands, dot=decimal).
 */
function parseLocalizedNumber(raw, currency = "") {
  let s = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    s = s.split(thousands).join("").replace(decimal, ".");
  } else if (hasComma) {
    s = currency === "TRY" ? s.replace(",", ".") : s.split(",").join("");
  } else if (hasDot && currency === "TRY") {
    const parts = s.split(".");
    if (parts.length > 1 && parts.at(-1).length === 3) s = parts.join("");
  }
  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}

// A phone is never this cheap in these markets: anything below the floor is an
// accessory or a price fragment and is rejected rather than recorded.
const USD_FLOOR = 30;
const LOCAL_FLOOR = { TRY: 1000, SAR: 100, AED: 100, QAR: 100, OMR: 10, JOD: 10, KWD: 10 };
const ACCESSORY = /case|cover|protector|charger|cable|accessor|holder|strap|screen guard|tempered|kılıf|ekran koruyucu|şarj|حافظة|غطاء|شاحن|كابل|واقي|جراب|كيبل/i;
const NOT_NEW = /renewed|refurbished|used|pre-?owned|open box|مجدّد|مجدد|معاد تجديده/i;

function isPlausiblePhonePrice(price, currency, fxRates) {
  if (!Number.isFinite(price)) return false;
  const rate = fxRates?.[currency];
  if (Number.isFinite(rate)) return price * rate >= USD_FLOOR;
  const floor = LOCAL_FLOOR[currency];
  return floor == null ? true : price >= floor;
}

function makeRecord({ source, price, currency, title, sourceUrl, model, variant, rawEvidence }) {
  const resolvedModel = model ?? deriveModel(title);
  if (!resolvedModel || !Number.isFinite(price)) return null;
  const resolvedCurrency = currency || source.currency;
  if (!isPlausiblePhonePrice(price, resolvedCurrency, fx?.rates)) return null;
  return {
    country: source.country,
    brand: config.brand,
    series: seriesOf(resolvedModel),
    model: resolvedModel,
    modelName: normalizeName(title),
    variant: variant ?? deriveVariant(title, sourceUrl),
    channel: source.channel,
    retailer: source.id.split("-").slice(0, 2).join("-"),
    sourceId: source.id,
    sourceUrl,
    productId: null,
    title: normalizeName(title),
    price,
    currency: resolvedCurrency,
    priceUsd: toUsd(price, resolvedCurrency, fx),
    collectorVersion: "1.1",
    availability: "in_stock",
    state: "live",
    week,
    collectedAt,
    effectiveDate: week,
    rawEvidence,
  };
}

function upsertMany(list) {
  for (const record of list) {
    if (!record) continue;
    const idx = records.findIndex((r) => keyOf(r) === keyOf(record));
    if (idx >= 0) records[idx] = record;
    else records.push(record);
  }
}

/* ------------------------------- parsers -------------------------------- */

function itemListProducts(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products = [];
  for (const block of blocks) {
    let value;
    try {
      value = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    const items = Array.isArray(value) ? value : [value, ...(value["@graph"] || [])];
    for (const item of items) {
      if (item?.["@type"] !== "ItemList") continue;
      for (const element of item.itemListElement || []) {
        const product = element.item || element;
        const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        const price = Number(offer?.price ?? product.price);
        if (product?.name && Number.isFinite(price)) {
          products.push({ title: product.name, price, currency: offer?.priceCurrency, url: offer?.url || product.url || null });
        }
      }
    }
  }
  return products;
}

async function parseSamsungOfficialList(source) {
  const res = await fetch(source.url, {
    headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const products = itemListProducts(await res.text());
  if (!products.length) throw new Error("no priced products in ItemList");

  // One record per (model, variant): keep the lowest listed price.
  const byKey = new Map();
  for (const product of products) {
    const model = deriveModel(product.title);
    if (!model) continue;
    const variant = deriveVariant(product.title, product.url);
    const key = `${model}|${variant}`;
    const existing = byKey.get(key);
    if (!existing || product.price < existing.price) byKey.set(key, { ...product, model, variant });
  }
  if (!byKey.size) throw new Error("ItemList had no Galaxy models");
  return [...byKey.values()].map((p) =>
    makeRecord({
      source,
      price: p.price,
      currency: p.currency || source.currency,
      title: p.title,
      sourceUrl: p.url || source.url,
      model: p.model,
      variant: p.variant,
      rawEvidence: { ...verifiedRef(source), page: source.url, listSize: products.length },
    }),
  );
}

function parseJsonLd(html, source) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const value = JSON.parse(block[1].trim());
      const items = Array.isArray(value) ? value : [value, ...(value["@graph"] || [])];
      const product = items.find((item) => item.offers?.price || item.price);
      if (!product) continue;
      const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      const price = Number(offer?.price ?? product.price);
      if (Number.isFinite(price)) return { price, currency: offer?.priceCurrency || source.currency, title: product.name || source.name };
    } catch {}
  }
  return null;
}

function parseTokenPrice(text, source) {
  const tokens = source.tokens?.length ? source.tokens : [source.currency];
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(`(?:${escaped})\\s*([0-9][0-9.,]*[0-9])|([0-9][0-9.,]*[0-9])\\s*(?:${escaped})`, "i");
  const match = text.match(re);
  if (!match) return null;
  const price = parseLocalizedNumber(match[1] || match[2], source.currency);
  if (!Number.isFinite(price) || !isPlausiblePhonePrice(price, source.currency, fx?.rates)) return null;
  return { price, currency: source.currency };
}

const PRICE_TOKEN = String.raw`(?:SAR|SR|AED|TRY|TL|₺|ريال|د\.إ|درهم|د\.ا|ر\.ق|ر\.ع|OMR|QAR|JOD)`;

function parseAmazonCard(card, source) {
  const text = card.text.replace(/\s+/g, " ");
  const modelNumber = String(source.model).replace(/[A-Za-z]/g, "");
  const modelPattern = `(?:\\b${source.model}\\b|(?:galaxy|جالكسي|ايه|جلاکسى)\\s*${modelNumber}\\b)`;
  if (!new RegExp(modelPattern, "i").test(text)) return null;
  if (String(deriveModel(text)).toUpperCase() !== String(source.model).toUpperCase()) return null;
  if (ACCESSORY.test(text) || NOT_NEW.test(text)) return null;
  const storage = String(source.variant).replace("GB", "");
  if (!new RegExp(`${storage}\\s*(?:GB|جيجابايت|جيجا)`, "i").test(text)) return null;
  const match = text.match(new RegExp(`${PRICE_TOKEN}\\s*([0-9][0-9.,]*)|([0-9][0-9.,]*)\\s*${PRICE_TOKEN}`, "i"));
  if (!match) return null;
  const price = parseLocalizedNumber(match[1] || match[2], source.currency);
  if (!Number.isFinite(price) || !isPlausiblePhonePrice(price, source.currency, fx?.rates)) return null;
  const href = card.links.find((link) => /\/(?:dp|gp\/product)\//.test(link));
  return {
    price,
    currency: source.currency,
    sourceUrl: href || source.url,
    title: text,
    productId: href?.match(/\/(?:dp|gp\/product)\/([^/?]+)/)?.[1] || null,
    rawEvidence: { ...verifiedRef(source), text: text.slice(0, 1200) },
  };
}

function parseAmazonDetail(html, text, source, url) {
  const json = parseJsonLd(html, source);
  const compact = text.replace(/\s+/g, " ");
  const modelNumber = String(source.model).replace(/[A-Za-z]/g, "");
  if (!new RegExp(`(?:\\b${source.model}\\b|Galaxy\\s*${modelNumber})`, "i").test(compact)) return null;
  if (String(deriveModel(compact)).toUpperCase() !== String(source.model).toUpperCase()) return null;
  if (!new RegExp(`${String(source.variant).replace("GB", "")}\\s*(?:GB|GBs|جيجابايت)`, "i").test(compact)) return null;
  const parsed = json || parseAmazonCard({ text: compact, links: [url] }, source);
  if (!parsed || !Number.isFinite(parsed.price)) return null;
  return {
    ...parsed,
    sourceUrl: url,
    title: json?.title || compact.slice(0, 800),
    productId: url.match(/\/(?:dp|gp\/product)\/([^/?]+)/)?.[1] || null,
    rawEvidence: { ...verifiedRef(source), method: json ? "amazon-jsonld-detail" : "amazon-detail-text", text: compact.slice(0, 1200) },
  };
}

async function parseAmazonSearch(source, browser) {
  const page = await browser.newPage({ userAgent: UA, locale: "en-US" });
  try {
    await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    const cards = await page
      .locator('[data-component-type="s-search-result"]')
      .evaluateAll((elements) =>
        elements.map((element) => ({ text: element.innerText, links: [...element.querySelectorAll("a")].map((a) => a.href) })),
      );
    const candidates = cards
      .map((card) => parseAmazonCard(card, source))
      .filter((candidate) => candidate?.sourceUrl && /\/(?:dp|gp\/product)\//.test(candidate.sourceUrl));
    // Prefer the product page, but Amazon rate-limits detail navigation hard;
    // the search card itself carries the retailer's listed price, so it is a
    // valid fallback once model + variant match and the price is plausible.
    for (const candidate of candidates.slice(0, 2)) {
      const detail = await browser.newPage({ userAgent: UA, locale: "en-US" });
      try {
        await detail.goto(candidate.sourceUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await detail.waitForTimeout(1200);
        const parsed = parseAmazonDetail(await detail.content(), await detail.locator("body").innerText(), source, candidate.sourceUrl);
        if (parsed) return [parsed];
      } catch {}
      finally {
        await detail.close();
      }
    }
    const best = candidates.filter((c) => Number.isFinite(c.price)).sort((a, b) => a.price - b.price)[0];
    if (best) return [{ ...best, rawEvidence: { ...best.rawEvidence, method: "amazon-search-card", detailPageBlocked: true } }];
    return [];
  } finally {
    await page.close();
  }
}

async function parseBrowserText(source, browser) {
  const page = await browser.newPage({ userAgent: UA, locale: "en-US" });
  try {
    const response = await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()}`);
    await page.waitForTimeout(3500);
    const html = await page.content();
    const text = await page.locator("body").innerText();
    const json = parseJsonLd(html, source);
    const parsed = json ?? parseTokenPrice(text, source);
    if (!parsed || !Number.isFinite(parsed.price)) return [];
    return [
      {
        price: parsed.price,
        currency: parsed.currency || source.currency,
        title: parsed.title || source.name,
        sourceUrl: source.url,
        productId: null,
        rawEvidence: { ...verifiedRef(source), method: json ? "jsonld" : "browser-text", text: text.slice(0, 1200) },
      },
    ];
  } finally {
    await page.close();
  }
}

/* --------------------------------- run ---------------------------------- */

let browser;
for (const source of activeSources) {
  try {
    let parsed;
    if (source.parser === "jsonld-itemlist") {
      parsed = await parseSamsungOfficialList(source);
    } else if (source.parser === "amazon-search") {
      browser ||= await chromium.launch({ headless: true });
      parsed = await parseAmazonSearch(source, browser);
    } else if (source.parser === "browser-text") {
      browser ||= await chromium.launch({ headless: true });
      parsed = await parseBrowserText(source, browser);
    } else if (source.parser === "jsonld") {
      const res = await fetch(source.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const one = parseJsonLd(await res.text(), source);
      if (one) {
        const model = deriveModel(one.title) ?? source.model;
        const variant = deriveVariant(one.title, source.url) ?? source.variant;
        // Never relabel a product page as a different model than it actually is.
        if (source.model && model && model.toUpperCase() !== String(source.model).toUpperCase()) {
          throw new Error("model mismatch: page=" + model + " config=" + source.model);
        }
        parsed = [{ ...one, model, variant, sourceUrl: source.url, rawEvidence: { ...verifiedRef(source), method: "jsonld", title: one.title } }];
      } else {
        parsed = [];
      }
    } else {
      throw new Error(`unknown parser: ${source.parser}`);
    }

    const built = parsed
      .map((p) => makeRecord({ source, ...p, model: p.model ?? source.model, variant: p.variant ?? source.variant }))
      .filter(Boolean);

    if (!built.length) throw new Error("no matching product price found");
    upsertMany(built);
  } catch (error) {
    const message = String(error.message || error);
    failedSources.push({ id: source.id, name: source.name, country: source.country, error: message });
    // Carry the most recent verified value for this source, clearly marked.
    const priorWeeks = records
      .filter((r) => r.sourceId === source.id && r.week !== week && Number.isFinite(r.price))
      .sort((a, b) => String(b.week).localeCompare(String(a.week)));
    const newestWeek = priorWeeks[0]?.week;
    for (const prior of priorWeeks.filter((r) => r.week === newestWeek)) {
      const carried = {
        ...prior,
        week,
        effectiveDate: prior.effectiveDate || prior.week,
        state: "missing",
        collectedAt,
        priceUsd: toUsd(prior.price, prior.currency, fx),
        rawEvidence: { ...(prior.rawEvidence || {}), failure: message, carried: true, carriedFromWeek: prior.week },
      };
      const idx = records.findIndex((r) => keyOf(r) === keyOf(carried));
      if (idx >= 0) records[idx] = carried;
      else records.push(carried);
    }
  }
}
if (browser) await browser.close();

// One record per key+week is what the UI assumes.
const seen = new Set();
const deduped = records.filter((r) => {
  const key = keyOf(r);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
deduped.sort(
  (a, b) =>
    String(b.week).localeCompare(String(a.week)) ||
    String(a.country).localeCompare(String(b.country)) ||
    String(a.model).localeCompare(String(b.model)) ||
    String(a.channel).localeCompare(String(b.channel)),
);

const live = deduped.filter((r) => r.week === week && r.state === "live");
const payload = {
  apiVersion: "1.1",
  mode: live.length ? "live" : "empty",
  collectedAt,
  week,
  brand: config.brand,
  sourceCount: activeSources.length,
  verifiedProductCount: live.length,
  fx: fxBlock(fx),
  failedSources,
  records: deduped,
};

await mkdir(historyDir, { recursive: true });
await mkdir(resolve(root, "public/api"), { recursive: true });
const serialized = `${JSON.stringify(payload, null, 2)}\n`;
await writeFile(latestPath, serialized);
await writeFile(apiPath, serialized);
await writeFile(resolve(historyDir, `${collectedAt.slice(0, 10)}.json`), serialized);

console.log(`week=${week} activeSources=${activeSources.length} live=${live.length} totalRecords=${deduped.length}`);
console.log(`fx asOf=${payload.fx.asOf ?? "n/a"} stale=${payload.fx.stale}`);
if (failedSources.length) {
  console.log(`failed sources (${failedSources.length}):`);
  for (const f of failedSources) console.log(`  - ${f.id} [${f.country}]: ${f.error}`);
}
