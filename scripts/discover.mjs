/**
 * Market model discovery (contract v1.1).
 *
 * Keeps `public/data/models.json` in sync with what is ACTUALLY observed on
 * sale per market, instead of a hardcoded wishlist. Models come from prices
 * collected from real retailer/brand sources (latest.json) plus the retailer
 * catalogs declared in markets.json. If a market has no reachable source, it
 * is listed with an empty model set and a reason — never a guessed lineup.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(resolve(root, p), "utf8"));
  } catch {
    return fallback;
  }
};

const markets = await read("public/data/markets.json", { brands: [], countries: [] });
const config = await read("config/sources.json", { sources: [] });
const latest = await read("public/data/latest.json", { records: [] });
const brandId = config.brand || "samsung";

const seriesOf = (id) => `Galaxy ${String(id)[0]}`;
const records = (latest.records ?? []).filter((r) => r.price != null && r.model);

/** modelId -> { variants:Set, countries:{ id:{available,channels:Set,lastSeen,priceUsd} } } */
const modelMap = new Map();
for (const record of records) {
  if (!modelMap.has(record.model)) {
    modelMap.set(record.model, { variants: new Set(), countries: new Map() });
  }
  const entry = modelMap.get(record.model);
  if (record.variant) entry.variants.add(record.variant);
  const country = entry.countries.get(record.country) ?? {
    available: true,
    channels: new Set(),
    lastSeen: null,
    priceUsd: null,
    currency: null,
  };
  country.channels.add(record.channel);
  if (!country.lastSeen || String(record.week) > String(country.lastSeen)) {
    country.lastSeen = record.week;
    country.priceUsd = record.priceUsd ?? null;
    country.currency = record.currency ?? null;
  }
  entry.countries.set(record.country, country);
}

const models = [...modelMap.entries()]
  .map(([id, entry]) => ({
    id,
    name: `Galaxy ${id}`,
    series: seriesOf(id),
    brandId,
    variants: [...entry.variants].sort(),
    countries: Object.fromEntries(
      [...entry.countries.entries()].map(([countryId, c]) => [
        countryId,
        {
          available: c.available,
          channels: [...c.channels].sort(),
          lastSeen: c.lastSeen,
          currency: c.currency,
          priceUsd: c.priceUsd,
        },
      ]),
    ),
  }))
  .sort((a, b) => a.series.localeCompare(b.series) || a.id.localeCompare(b.id));

const byCountry = {};
for (const country of markets.countries ?? []) {
  const enabled = config.sources.filter((s) => s.enabled && s.country === country.id);
  const observed = models.filter((m) => m.countries[country.id]?.available).map((m) => m.id);
  byCountry[country.id] = {
    modelIds: observed,
    sourceIds: enabled.map((s) => s.id),
    reachableSources: enabled.length,
    unavailableReason: enabled.length
      ? null
      : (config.sources.find((s) => s.country === country.id)?.disabledReason ??
        "No reachable price source for this market yet."),
  };
}

const payload = {
  generatedAt: new Date().toISOString(),
  contractVersion: "1.1",
  brandId,
  totalModels: models.length,
  models,
  byCountry,
};
await writeFile(resolve(root, "public/data/models.json"), `${JSON.stringify(payload, null, 2)}\n`);

const report = {
  generatedAt: payload.generatedAt,
  brands: markets.brands,
  countries: byCountry,
  failedSources: latest.failedSources ?? [],
  models: models.map((m) => ({ id: m.id, series: m.series, variants: m.variants, countries: Object.keys(m.countries) })),
};
await writeFile(resolve(root, "data/discovery-report.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(`models=${models.length} countries=${Object.keys(byCountry).length}`);
for (const [id, info] of Object.entries(byCountry)) {
  console.log(`  ${id}: models=[${info.modelIds.join(",")}] sources=${info.reachableSources}${info.unavailableReason ? ` (${info.unavailableReason.slice(0, 60)})` : ""}`);
}
