import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { records as demoRecords, weeks } from "../src/data.js";

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
const records = previous?.records?.length ? structuredClone(previous.records) : structuredClone(demoRecords);
const latestKey = (r) => `${r.country}|${r.model}|${r.channel}|${r.variant}`;

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

for (const source of active) {
  try {
    const response = await fetch(source.url, { headers: { 'user-agent': 'MarketLensPriceBot/1.0 (+GitHub Actions)' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = parseJsonLd(await response.text(), source);
    if (!result) throw new Error('No JSON-LD offer found');
    const match = records.find((record) => record.country === source.country && record.channel === source.channel);
    if (match) { match.price = result.price; match.week = week; match.state = 'normal'; match.collectedAt = collectedAt; match.sourceUrl = source.url; }
  } catch (error) { failedSources.push({ id: source.id, name: source.name, error: error.message }); }
}
const output = { apiVersion: "1.0", mode: active.length && !failedSources.length ? 'live' : 'demo', collectedAt, week, sourceCount: active.length, failedSources, records };
await mkdir(resolve(root, 'public/data'), { recursive: true });
await mkdir(resolve(root, 'public/api'), { recursive: true });
await writeFile(outputPath, JSON.stringify(output, null, 2));
await writeFile(apiPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ week, activeSources: active.length, failedSources: failedSources.length, retainedRecords: records.length }));
