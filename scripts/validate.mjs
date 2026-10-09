/**
 * Data-contract validator (v1.1). Dependency-free; exits non-zero on any
 * violation so CI fails BEFORE bad data is committed.
 *
 *   node scripts/validate.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

const STATES = new Set(["live", "missing", "invalid", "unavailable"]);
const round2 = (n) => Math.round(n * 100) / 100;

let latest;
let markets;
let models;
let fx;
try {
  latest = read("public/data/latest.json");
  markets = read("public/data/markets.json");
  models = read("public/data/models.json");
  fx = read("public/data/fx.json");
} catch (error) {
  console.error(`FAIL: could not read a data file: ${error.message}`);
  process.exit(1);
}

/* ---------------------------- latest.json ------------------------------- */
check(!latest.apiVersion || latest.apiVersion === "1.1", `latest.apiVersion is "${latest.apiVersion}", expected "1.1"`);
check(latest.apiVersion === "1.1", "latest.apiVersion must be exactly '1.1'");
check(Number.isFinite(Date.parse(latest.collectedAt ?? "")), "latest.collectedAt must be an ISO timestamp");
check(/^\d{4}-\d{2}-\d{2}$/.test(latest.week ?? ""), "latest.week must be YYYY-MM-DD (ISO week start)");
check(typeof latest.mode === "string", "latest.mode missing");
check(Number.isFinite(latest.sourceCount), "latest.sourceCount must be a number");
check(Number.isFinite(latest.verifiedProductCount), "latest.verifiedProductCount must be a number");
check(Array.isArray(latest.failedSources), "latest.failedSources must be an array");
check(Array.isArray(latest.records), "latest.records must be an array");
check(latest.fx && typeof latest.fx === "object", "latest.fx missing");
check(latest.fx?.asOf == null || /^\d{4}-\d{2}-\d{2}$/.test(latest.fx.asOf), "latest.fx.asOf must be YYYY-MM-DD or null");

const countryIds = new Set((markets.countries ?? []).map((c) => c.id));
const seenKeys = new Set();
const liveThisWeek = [];

for (const [i, r] of (latest.records ?? []).entries()) {
  const at = `records[${i}] (${r.country ?? "?"}/${r.model ?? "?"})`;
  check(Boolean(r.country), `${at}: country missing`);
  check(countryIds.has(r.country), `${at}: country "${r.country}" is not in markets.json`);
  check(Boolean(r.brand), `${at}: brand missing`);
  check(Boolean(r.model), `${at}: model missing`);
  check(Boolean(r.channel), `${at}: channel missing`);
  check(STATES.has(r.state), `${at}: state "${r.state}" is not in ${[...STATES].join("|")}`);
  check(Boolean(r.sourceId), `${at}: sourceId missing`);
  check(/^https?:/.test(String(r.sourceUrl ?? "")), `${at}: sourceUrl must be http(s)`);
  check(Boolean(r.collectedAt), `${at}: collectedAt missing`);
  check(Boolean(r.rawEvidence), `${at}: rawEvidence missing (no evidence, no price)`);
  check(/^\d{4}-\d{2}-\d{2}$/.test(r.week ?? ""), `${at}: week must be YYYY-MM-DD`);

  if (r.state === "unavailable") {
    check(r.price === null, `${at}: state=unavailable must have price null`);
    check(r.priceUsd == null, `${at}: state=unavailable must have priceUsd null`);
  }
  if (r.price != null) {
    check(Number.isFinite(r.price) && r.price > 0, `${at}: price must be a positive number`);
    const rate = fx.rates?.[r.currency];
    check(Number.isFinite(rate), `${at}: no FX rate for currency "${r.currency}"`);
    if (Number.isFinite(rate)) {
      check(r.priceUsd === round2(r.price * rate), `${at}: priceUsd ${r.priceUsd} != round(price*rate,2) = ${round2(r.price * rate)}`);
    }
  }
  const key = [r.country, r.brand, r.model, r.variant, r.channel, r.sourceId, r.week].join("|");
  check(!seenKeys.has(key), `${at}: duplicate record key ${key}`);
  seenKeys.add(key);
  if (r.week === latest.week && r.state === "live") liveThisWeek.push(r);
}

check(liveThisWeek.length === latest.verifiedProductCount, `verifiedProductCount ${latest.verifiedProductCount} != live records this week ${liveThisWeek.length}`);
check(latest.mode === (liveThisWeek.length ? "live" : "empty"), `mode "${latest.mode}" disagrees with ${liveThisWeek.length} live records`);

/* ------------------------------ fx.json -------------------------------- */
check(fx.base === "USD", `fx.base must be "USD" (got "${fx.base}")`);
check(Object.keys(fx.rates ?? {}).length > 0, "fx.rates is empty — USD values would all be null");
for (const [code, rate] of Object.entries(fx.rates ?? {})) {
  check(Number.isFinite(rate) && rate > 0, `fx.rates.${code} must be a positive number`);
}

/* ---------------------------- markets.json ----------------------------- */
check(Array.isArray(markets.brands) && markets.brands.length > 0, "markets.brands is empty");
check(Array.isArray(markets.countries) && markets.countries.length > 0, "markets.countries is empty");
for (const c of markets.countries ?? []) {
  check(Boolean(c.id && c.name && c.currency), `markets country ${c.id ?? "?"}: id/name/currency required`);
  check(Array.isArray(c.retailers), `markets country ${c.id}: retailers must be an array`);
}
const usedCurrencies = new Set((latest.records ?? []).filter((r) => r.price != null).map((r) => r.currency));
for (const code of usedCurrencies) {
  check(Number.isFinite(fx.rates?.[code]), `currency "${code}" is used by records but missing from fx.rates`);
}

/* ---------------------------- models.json ------------------------------ */
check(Array.isArray(models.models), "models.models must be an array");
for (const m of models.models ?? []) {
  check(Boolean(m.id && m.name), `models entry ${JSON.stringify(m).slice(0, 60)} needs id + name`);
  check(Array.isArray(m.variants) && m.variants.length > 0, `model ${m.id}: variants must be a non-empty array`);
}

/* ------------------------- api mirror identity ------------------------- */
const mirror = readFileSync(resolve(root, "public/api/prices.json"), "utf8");
const source = readFileSync(resolve(root, "public/data/latest.json"), "utf8");
check(mirror === source, "public/api/prices.json is not byte-identical to public/data/latest.json");

if (problems.length) {
  console.error(`FAIL: ${problems.length} contract violation(s):`);
  for (const p of problems.slice(0, 60)) console.error(`  - ${p}`);
  if (problems.length > 60) console.error(`  … ${problems.length - 60} more`);
  process.exit(1);
}
console.log(
  `OK: contract v1.1 valid · ${latest.records.length} records · ${liveThisWeek.length} live this week · ${markets.countries.length} markets · ${models.models.length} models · fx ${fx.asOf}`,
);
