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
 *
 * CLI:
 *   node scripts/collect.mjs                      normal run (writes files)
 *   node scripts/collect.mjs --only=id1,id2       collect only the listed sourceIds
 *   node scripts/collect.mjs --dry-run            fetch + build, write nothing
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { refreshFx, readFx, fetchFx, fxBlock, toUsd } from "./fx.mjs";

const args = process.argv.slice(2);
const flags = {};
for (const arg of args) {
  const match = arg.match(/^--([^=]+)(?:=([\s\S]*))?$/);
  if (match) flags[match[1]] = match[2] ?? true;
}
const onlyIds = typeof flags.only === "string" ? new Set(flags.only.split(",").map((s) => s.trim()).filter(Boolean)) : null;
const dryRun = flags["dry-run"] === true;

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
// --dry-run must not touch disk, so it reuses the cached rates (or fetches them
// in memory only).
const fx = dryRun ? (await readFx()) ?? (await fetchFx()) : await refreshFx();
const collectedAt = new Date().toISOString();
const week = weekStart();
const activeSources = config.sources.filter((s) => s.enabled && (!onlyIds || onlyIds.has(s.id)));
const activeIds = new Set(activeSources.map((s) => s.id));
const knownIds = new Set(config.sources.map((s) => s.id));
const failedSources = [];

/**
 * Legacy model-identity migrations (sourceId -> { oldId: currentId }).
 *
 * A single-product source *is* one product: its `sourceId` and product `sourceUrl`
 * are fixed. When the model taxonomy changes (e.g. connectivity like "5G" becomes
 * part of the identity), that product's earlier rows must not stay under the old
 * id, or one price history becomes two unrelated series. Only the label is
 * normalized here — price, currency, dates and evidence are untouched — and the
 * previous label is preserved in `rawEvidence.modelMigratedFrom`.
 */
const LEGACY_MODEL_IDS = {
  // Same product page (.../samsung-galaxy-a57-5g-smartphones-679663.html).
  "jarir-sa-a57-256": { A57: "A57 5G" },
};

// Seed with prior records (all weeks) so trends keep their history. Records for
// the current week are dropped and re-collected for every active source; with
// --only, current-week records of sources we are NOT re-collecting are kept so
// a debug run still produces a complete payload.
// USD is backfilled with the current dated rate; a missing rate still yields null.
const records = (previous?.records ?? [])
  .filter((r) => r?.sourceId && knownIds.has(r.sourceId))
  .filter((r) => r.week !== week || !activeIds.has(r.sourceId))
  .map((r) => {
    const copy = structuredClone(r);
    const source = config.sources.find((s) => s.id === copy.sourceId);
    // Normalize legacy rows written before the v1.1 schema.
    if (!copy.currency) copy.currency = source?.currency ?? null;
    if (!copy.brand) copy.brand = config.brand;
    if (!copy.series && copy.model) copy.series = `Galaxy ${String(copy.model)[0]}`;
    if (!copy.channel) copy.channel = source?.channel ?? "retail";
    const migratedModel = LEGACY_MODEL_IDS[copy.sourceId]?.[copy.model];
    if (migratedModel && migratedModel !== copy.model) {
      copy.rawEvidence = { ...(copy.rawEvidence ?? {}), modelMigratedFrom: copy.model };
      copy.model = migratedModel;
    }
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

const MODEL_SUFFIXES = /^(5G|Ultra|Plus|FE|Edge|Lite)$/i;

/**
 * Derive the tracked model identity from a listing/product title.
 *
 * The identity keeps connectivity and the S-series sub-model, because those are
 * different products: "Galaxy A17" vs "Galaxy A17 5G", "Galaxy S26" vs
 * "Galaxy S26+" vs "Galaxy S26 Ultra" vs "Galaxy S26 FE". Collapsing them into
 * one id previously let the lowest price of a different phone win the cell.
 * "Plus" normalizes to "+" so "S26 Plus" and "S26+" resolve to one identity.
 */
function deriveModel(title) {
  const match = String(title).match(/Galaxy\s+([ASZMF]\d{2}[A-Za-z]?)(\+)?(?:[,\s]+(5G|Ultra|Plus|FE|Edge|Lite))?/i);
  if (!match) return null;
  const base = match[1].toUpperCase();
  if (match[2] === "+") return `${base}+`;
  if (!match[3]) return base;
  const suffix = match[3].toUpperCase() === "PLUS" ? "+" : match[3].toUpperCase();
  return `${base} ${suffix}`;
}

/** True when an observed model belongs to the configured (family-level) model. */
function modelMatches(derived, configured) {
  if (!derived || !configured) return false;
  const d = String(derived).toUpperCase().trim();
  const c = String(configured).toUpperCase().trim();
  return d === c || d.startsWith(`${c} `) || d.startsWith(`${c}+`);
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
// A "bundle"/"combo" price is not the phone's price: it includes Buds/SmartTag/
// adapter. Recording it would overstate the phone (and let an accessory decide
// the cell). Reject those listings.
const BUNDLE = /\b(?:bundle|combo)\b|with\s+buds|\+\s*buds/i;

function isPlausiblePhonePrice(price, currency, fxRates) {
  if (!Number.isFinite(price)) return false;
  const rate = fxRates?.[currency];
  if (Number.isFinite(rate)) return price * rate >= USD_FLOOR;
  const floor = LOCAL_FLOOR[currency];
  return floor == null ? true : price >= floor;
}

function makeRecord({ source, price, currency, title, sourceUrl, model, variant, availability, productId, rawEvidence }) {
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
    productId: productId ?? null,
    title: normalizeName(title),
    price,
    currency: resolvedCurrency,
    priceUsd: toUsd(price, resolvedCurrency, fx),
    collectorVersion: "1.1",
    availability: availability ?? "in_stock",
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
    if (BUNDLE.test(product.title) || ACCESSORY.test(product.title) || NOT_NEW.test(product.title)) continue;
    const model = deriveModel(product.title);
    if (!model) continue;
    const variant = deriveVariant(product.title, product.url);
    const key = `${model}|${variant}`;
    const existing = byKey.get(key);
    if (!existing || product.price < existing.price) byKey.set(key, { ...product, model, variant });
  }
  if (!byKey.size) throw new Error("ItemList had no Galaxy models");
  // sourceUrl is the listing page the price was actually parsed from; the deep
  // product link is kept in rawEvidence. (Some Samsung "/buy/?modelCode=" links
  // show a different promo price than the listing, so pointing sourceUrl at the
  // listing is the honest provenance.)
  return [...byKey.values()].map((p) =>
    makeRecord({
      source,
      price: p.price,
      currency: p.currency || source.currency,
      title: p.title,
      sourceUrl: source.url,
      model: p.model,
      variant: p.variant,
      rawEvidence: { ...verifiedRef(source), page: source.url, productUrl: p.url, listSize: products.length },
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

const amazonHost = (source) => new URL(source.url).hostname.replace(/^www\./, "");
const amazonDpUrl = (source, asin) => `https://www.${amazonHost(source)}/dp/${asin}`;

function matchAmazonCard(card, source) {
  const title = String(card.title || "").replace(/\s+/g, " ").trim();
  const text = `${title} ${String(card.text || "")}`.replace(/\s+/g, " ").trim();
  if (!card.asin) return null;
  const model = deriveModel(title || text);
  if (!model || !modelMatches(model, source.model)) return null;
  if (ACCESSORY.test(text) || NOT_NEW.test(text) || BUNDLE.test(text)) return null;
  const storage = String(source.variant || "").replace("GB", "");
  if (source.variant && !new RegExp(`${storage}\\s*(?:GB|جيجابايت|جيجا)`, "i").test(text)) return null;
  let price = parseLocalizedNumber(card.offscreen, source.currency);
  if (!Number.isFinite(price)) {
    const match = text.match(new RegExp(`${PRICE_TOKEN}\\s*([0-9][0-9.,]*)|([0-9][0-9.,]*)\\s*${PRICE_TOKEN}`, "i"));
    price = match ? parseLocalizedNumber(match[1] || match[2], source.currency) : null;
  }
  if (!Number.isFinite(price) || !isPlausiblePhonePrice(price, source.currency, fx?.rates)) return null;
  return {
    price,
    currency: source.currency,
    title: title || text.slice(0, 300),
    productId: card.asin,
    model,
    rawEvidence: { ...verifiedRef(source), productId: card.asin, priceText: card.offscreen || null, title: (title || "").slice(0, 200) },
  };
}

async function parseAmazonSearch(source, browser) {
  const page = await browser.newPage({ userAgent: UA, locale: "en-US" });
  try {
    await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    const cards = await page.locator('[data-component-type="s-search-result"]').evaluateAll((elements) =>
      elements.map((element) => ({
        asin: element.getAttribute("data-asin"),
        title: element.querySelector('[data-cy="title-recipe"]')?.innerText ?? element.querySelector("h2")?.innerText ?? "",
        offscreen: element.querySelector("span.a-price span.a-offscreen")?.textContent ?? "",
        text: element.innerText,
      })),
    );
    const candidates = cards.map((card) => matchAmazonCard(card, source)).filter(Boolean);
    // Deterministic order: lowest card price, then ASIN. The search grid order
    // is not stable run-to-run, so it must not decide which product we record.
    candidates.sort((a, b) => a.price - b.price || String(a.productId).localeCompare(String(b.productId)));
    // Verify up to two candidates on their canonical product page and use the
    // product page's own listed price, so sourceUrl actually carries the price.
    for (const candidate of candidates.slice(0, 2)) {
      const dpUrl = amazonDpUrl(source, candidate.productId);
      const detail = await browser.newPage({ userAgent: UA, locale: "en-US" });
      try {
        await detail.goto(dpUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await detail.waitForTimeout(1500);
        const title = (
          (await detail.locator("#productTitle").first().textContent().catch(() => null)) || candidate.title
        )
          .replace(/\s+/g, " ")
          .trim();
        const off = await detail.locator("span.a-price span.a-offscreen").first().textContent().catch(() => null);
        const price = parseLocalizedNumber(off, source.currency);
        const pageModel = deriveModel(title);
        const storage = String(source.variant || "").replace("GB", "");
        const variantOk =
          !source.variant ||
          new RegExp(`${storage}\\s*(?:GB|جيجابايت|جيجا)`, "i").test(title) ||
          deriveVariant(title, dpUrl) === source.variant;
        if (pageModel && modelMatches(pageModel, source.model) && variantOk && isPlausiblePhonePrice(price, source.currency, fx?.rates)) {
          return [
            {
              price,
              currency: source.currency,
              title,
              sourceUrl: dpUrl,
              productId: candidate.productId,
              model: pageModel,
              rawEvidence: { ...verifiedRef(source), method: "amazon-detail", productId: candidate.productId, priceText: off, title },
            },
          ];
        }
      } catch {}
      finally {
        await detail.close();
      }
    }
    const best = candidates[0];
    if (best) {
      const dpUrl = amazonDpUrl(source, best.productId);
      return [
        {
          ...best,
          sourceUrl: dpUrl,
          rawEvidence: { ...best.rawEvidence, method: "amazon-search-card", sourceUrl: dpUrl, detailPageBlocked: true },
        },
      ];
    }
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
    // A product-page parser must not price a different phone: require the
    // configured model to appear in the page title/text when one is set.
    if (source.model) {
      const pageModel = deriveModel(json?.title || text);
      if (!pageModel || !modelMatches(pageModel, source.model)) {
        throw new Error(`model mismatch: page=${pageModel ?? "unknown"} config=${source.model}`);
      }
    }
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

/**
 * eXtra (extra.com) search parser. eXtra's storefront prices live in Unbxd;
 * the search page embeds its public apiKey/siteKey, so we read those, query the
 * public search API, then confirm the chosen product's price on its own product
 * page JSON-LD. Used for the OMR-denominated Oman market.
 */
let extraKeyCache = null;
async function extraKeys(source) {
  if (extraKeyCache) return extraKeyCache;
  const res = await fetch(source.url, {
    headers: { "user-agent": UA, "accept-language": "en-OM,en;q=0.9,ar;q=0.8" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const apiKey = html.match(/"apiKey"\s*:\s*"([^"]+)"/)?.[1];
  const siteKey = html.match(/"siteKey"\s*:\s*"([^"]+)"/)?.[1];
  if (!apiKey || !siteKey) throw new Error("Unbxd apiKey/siteKey not found in search page");
  extraKeyCache = { apiKey, siteKey };
  return extraKeyCache;
}

async function parseExtraSearch(source) {
  const { apiKey, siteKey } = await extraKeys(source);
  const query = source.query || [source.model, String(source.variant || "").replace("GB", "")].filter(Boolean).join(" ");
  const api = `https://search.unbxd.io/${apiKey}/${siteKey}/search?q=${encodeURIComponent(query)}&rows=60`;
  const res = await fetch(api, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Unbxd HTTP ${res.status}`);
  const json = await res.json();
  const products = (json.response?.products ?? []).filter((p) => (p.categoryPath ?? []).some((c) => /Smartphone/i.test(c)));
  const candidates = [];
  for (const product of products) {
    const title = String(product.nameEn || "");
    const model = deriveModel(title);
    if (!model || !modelMatches(model, source.model)) continue;
    if (ACCESSORY.test(title) || NOT_NEW.test(title) || BUNDLE.test(title)) continue;
    const titleVariant = deriveVariant(title, null);
    const mem = String(product.featureEnMemoryInternal || "").replace(/\s+/g, "").toUpperCase();
    const variant = titleVariant !== "N/A" ? titleVariant : mem || null;
    if (source.variant && variant && variant.toUpperCase() !== String(source.variant).toUpperCase()) continue;
    const price = Number(product.price);
    if (!product.productUrl || !isPlausiblePhonePrice(price, "OMR", fx?.rates)) continue;
    candidates.push({
      model,
      variant: variant ?? source.variant,
      title,
      price,
      productUrl: product.productUrl,
      modelNumber: product.modelNumber,
      inStock: product.inStockFlag === "true",
    });
  }
  // Deterministic pick: in-stock first, then lowest price, then modelNumber.
  candidates.sort(
    (a, b) =>
      Number(b.inStock) - Number(a.inStock) || a.price - b.price || String(a.modelNumber).localeCompare(String(b.modelNumber)),
  );
  const chosen = candidates[0];
  if (!chosen) return [];
  const pageRes = await fetch(chosen.productUrl, {
    headers: { "user-agent": UA, "accept-language": "en-OM,en;q=0.9,ar;q=0.8" },
    signal: AbortSignal.timeout(30000),
  });
  if (!pageRes.ok) throw new Error(`product page HTTP ${pageRes.status}`);
  const one = parseJsonLd(await pageRes.text(), source);
  if (!one || !Number.isFinite(one.price)) throw new Error("product page had no JSON-LD offer");
  const pageModel = deriveModel(one.title);
  if (source.model && pageModel && !modelMatches(pageModel, source.model)) throw new Error(`model mismatch on page: ${pageModel}`);
  const pageVariant = deriveVariant(one.title, chosen.productUrl);
  return [
    {
      price: one.price,
      currency: one.currency || source.currency,
      title: one.title,
      sourceUrl: chosen.productUrl,
      productId: chosen.modelNumber,
      model: pageModel ?? chosen.model,
      variant: pageVariant !== "N/A" ? pageVariant : chosen.variant ?? source.variant,
      availability: chosen.inStock ? "in_stock" : "out_of_stock",
      rawEvidence: {
        ...verifiedRef(source),
        method: "extra-unbxd+jsonld",
        query,
        modelNumber: chosen.modelNumber,
        inStockFlag: chosen.inStock,
        unbxdPrice: chosen.price,
        title: one.title,
      },
    },
  ];
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
    } else if (source.parser === "extra-search") {
      parsed = await parseExtraSearch(source);
    } else if (source.parser === "jsonld") {
      const res = await fetch(source.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const one = parseJsonLd(await res.text(), source);
      if (one) {
        const model = deriveModel(one.title) ?? source.model;
        const variant = deriveVariant(one.title, source.url) ?? source.variant;
        // Never relabel a product page as a different model than it actually is.
        if (source.model && model && !modelMatches(model, source.model)) {
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
      .map((p) => {
        const derivedVariant = p.variant ?? deriveVariant(p.title, p.sourceUrl ?? source.url);
        const variant = derivedVariant && derivedVariant !== "N/A" ? derivedVariant : source.variant ?? "N/A";
        const model = p.model ?? deriveModel(p.title) ?? source.model;
        return makeRecord({ source, ...p, model, variant });
      })
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
// Fully explicit order => two runs over the same input serialize identically.
deduped.sort(
  (a, b) =>
    String(b.week).localeCompare(String(a.week)) ||
    String(a.country).localeCompare(String(b.country)) ||
    String(a.model).localeCompare(String(b.model)) ||
    String(a.channel).localeCompare(String(b.channel)) ||
    String(a.variant).localeCompare(String(b.variant)) ||
    String(a.sourceId).localeCompare(String(b.sourceId)),
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

const serialized = `${JSON.stringify(payload, null, 2)}\n`;
if (dryRun) {
  console.log(`[dry-run] week=${week} activeSources=${activeSources.length} live=${live.length} totalRecords=${deduped.length} (no files written)`);
} else {
  await mkdir(historyDir, { recursive: true });
  await mkdir(resolve(root, "public/api"), { recursive: true });
  await writeFile(latestPath, serialized);
  await writeFile(apiPath, serialized);
  await writeFile(resolve(historyDir, `${collectedAt.slice(0, 10)}.json`), serialized);
  console.log(`week=${week} activeSources=${activeSources.length} live=${live.length} totalRecords=${deduped.length}`);
}
console.log(`fx asOf=${payload.fx.asOf ?? "n/a"} stale=${payload.fx.stale}`);
if (failedSources.length) {
  console.log(`failed sources (${failedSources.length}):`);
  for (const f of failedSources) console.log(`  - ${f.id} [${f.country}]: ${f.error}`);
}
