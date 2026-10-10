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
const HISTORY_STATES = new Set(["live", "promo"]);
const SPEC_FIELDS = ["display", "screenInches", "batteryMah", "storage", "ramGb", "chipset", "releaseYear"];
const SPEC_CONFIDENCE = new Set(["official", "retailer", "unverified"]);
const round2 = (n) => Math.round(n * 100) / 100;
const isoWeekStart = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
};
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
check(latest.week === isoWeekStart(latest.collectedAt), `latest.week ${latest.week} is not the ISO week start of latest.collectedAt`);
check(sameJson(latest.fx?.rates ?? {}, fx.rates ?? {}), "latest.fx.rates must match public/data/fx.json rates");
check(latest.fx?.base === fx.base, "latest.fx.base must match public/data/fx.json base");
check(latest.fx?.asOf === fx.asOf, "latest.fx.asOf must match public/data/fx.json asOf");

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
  const currentRun = r.collectedAt === latest.collectedAt;
  check(Boolean(r.collectedAt), `${at}: collectedAt missing`);
  // Retained pre-v1.1 history rows use their daily snapshot date; enforce the
  // current collector's ISO-week contract on rows written in this run.
  if (currentRun) check(isoWeekStart(r.collectedAt) === r.week, `${at}: week ${r.week} is not the ISO week start of collectedAt ${r.collectedAt}`);
  check(Boolean(r.rawEvidence), `${at}: rawEvidence missing (no evidence, no price)`);
  if (currentRun && r.state === "live") check(r.collectorVersion === "1.1", `${at}: live record collectorVersion must be "1.1"`);
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
      check(Number.isFinite(r.priceUsd) && r.priceUsd > 0, `${at}: priceUsd must be strictly positive when an FX rate exists`);
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
const observedModelIds = new Set();
const sourcePageModelIds = new Set();
for (const r of latest.records ?? []) {
  if (r.model) observedModelIds.add(r.model);
  const pageText = [r.sourceUrl, r.title, r.modelName, r.rawEvidence?.page, r.rawEvidence?.text].filter(Boolean).join(" ");
  const modelId = String(r.model ?? "").match(/^[ASZ]?\d+[A-Z]?$/)?.[0];
  if (modelId && pageText.includes(modelId)) sourcePageModelIds.add(modelId);
}
for (const m of models.models ?? []) {
  check(Boolean(m.id && m.name), `models entry ${JSON.stringify(m).slice(0, 60)} needs id + name`);
  check(Array.isArray(m.variants) && m.variants.length > 0, `model ${m.id}: variants must be a non-empty array`);
  check(observedModelIds.has(m.id) || sourcePageModelIds.has(m.id), `model ${m.id}: no record or real source-page evidence`);
}

/* ---------------------------- history.json ----------------------------- */
/* WC C2: the published weekly history must contain only real, sourced observations.
   Rule 7: `brand`/`series` are verbatim copies of the source record — the keys must be
   present on every point, but a legacy row with no brand legitimately carries null. */
let history;
try {
  history = read("public/data/history.json");
} catch (error) {
  console.error(`FAIL: could not read public/data/history.json: ${error.message}`);
  process.exit(1);
}
check(history.apiVersion === "1.1", `history.apiVersion is "${history.apiVersion}", expected "1.1"`);
check(Number.isFinite(Date.parse(history.generatedAt ?? "")), "history.generatedAt must be an ISO timestamp");
check(Array.isArray(history.weeks), "history.weeks must be an array");
check(Array.isArray(history.points), "history.points must be an array");

const historyWeeks = Array.isArray(history.weeks) ? history.weeks : [];
const historyWeekSet = new Set();
for (const [i, week] of historyWeeks.entries()) {
  check(/^\d{4}-\d{2}-\d{2}$/.test(week ?? ""), `history.weeks[${i}] "${week}" must be YYYY-MM-DD`);
  check(isoWeekStart(week) === week, `history.weeks[${i}] "${week}" is not an ISO week start (Monday)`);
  check(!historyWeekSet.has(week), `history.weeks[${i}] "${week}" is duplicated`);
  if (i > 0) check(String(historyWeeks[i - 1]) < String(week), `history.weeks is not sorted ascending at index ${i} ("${historyWeeks[i - 1]}" -> "${week}")`);
  historyWeekSet.add(week);
}

const historyKeys = new Set();
const historyPoints = Array.isArray(history.points) ? history.points : [];
for (const [i, p] of historyPoints.entries()) {
  const at = `history.points[${i}] (${p?.country ?? "?"}/${p?.model ?? "?"}/${p?.week ?? "?"})`;
  check(Boolean(p) && typeof p === "object" && !Array.isArray(p), `${at}: point must be an object`);
  if (!p || typeof p !== "object" || Array.isArray(p)) continue;
  for (const field of ["country", "model", "channel", "variant"]) check(Boolean(p[field]), `${at}: ${field} missing`);
  check("brand" in p, `${at}: brand key missing (null allowed, key required)`);
  check("series" in p, `${at}: series key missing (null allowed, key required)`);
  check(p.brand == null || typeof p.brand === "string", `${at}: brand must be a string or null (copied verbatim, never inferred)`);
  check(p.series == null || typeof p.series === "string", `${at}: series must be a string or null (copied verbatim, never inferred)`);
  check(/^\d{4}-\d{2}-\d{2}$/.test(p.week ?? ""), `${at}: week must be YYYY-MM-DD`);
  check(isoWeekStart(p.week) === p.week, `${at}: week ${p.week} is not the ISO week start of its own week value`);
  check(historyWeekSet.has(p.week), `${at}: week ${p.week} is not listed in history.weeks`);
  check(typeof p.price === "number" && Number.isFinite(p.price) && p.price > 0, `${at}: price must be a finite positive number`);
  check(HISTORY_STATES.has(p.state), `${at}: state "${p.state}" must be live|promo (a carried row is not an observation)`);
  check(Boolean(p.sourceId), `${at}: sourceId missing`);
  check(/^https?:/.test(String(p.sourceUrl ?? "")), `${at}: sourceUrl must be http(s)`);
  check(Number.isFinite(Date.parse(p.collectedAt ?? "")), `${at}: collectedAt must be an ISO timestamp`);
  const key = [p.country, p.model, p.channel, p.variant, p.week].join("|");
  check(!historyKeys.has(key), `${at}: duplicate point for key ${key} (one real point per key)`);
  historyKeys.add(key);
}

/* ----------------------------- specs.json ------------------------------ */
/* WC C4. Absent is not a failure (the spec view degrades to 暂无数据); present
   but malformed, unsourced or keyed to an unknown model is. Partial coverage is
   an acceptable documented outcome and is warned about, not failed. */
let specs = null;
let specsPresent = true;
try {
  specs = read("public/data/specs.json");
} catch (error) {
  if (error?.code === "ENOENT") {
    specsPresent = false;
    console.warn("WARN: public/data/specs.json is absent — the spec drawer and spec filters will show 暂无数据.");
  } else {
    problems.push(`public/data/specs.json is present but unreadable/invalid JSON: ${error.message}`);
  }
}
let specsChecked = false;
if (specsPresent) {
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) {
    problems.push("specs.json must be a JSON object");
  } else {
    specsChecked = true;
    check(specs.generatedAt == null || Number.isFinite(Date.parse(specs.generatedAt ?? "")), "specs.generatedAt must be an ISO timestamp");
    check(specs.notes == null || typeof specs.notes === "string", "specs.notes must be a string");
    check(specs.models && typeof specs.models === "object" && !Array.isArray(specs.models), "specs.models must be an object keyed by model id");
    const specEntries = specs.models && typeof specs.models === "object" && !Array.isArray(specs.models) ? Object.entries(specs.models) : [];
    const modelIds = new Set((models.models ?? []).map((m) => m.id));
    for (const id of Object.keys(specs.models ?? {})) check(modelIds.has(id), `specs.models["${id}"] is not a model id in public/data/models.json`);
    for (const [id, spec] of specEntries) {
      const at = `specs.models["${id}"]`;
      check(Boolean(spec) && typeof spec === "object" && !Array.isArray(spec), `${at} must be an object`);
      if (!spec || typeof spec !== "object" || Array.isArray(spec)) continue;
      for (const field of ["display", "chipset"]) check(spec[field] == null || typeof spec[field] === "string", `${at}.${field} must be a string or null`);
      for (const field of ["screenInches", "batteryMah", "ramGb"]) check(spec[field] == null || (typeof spec[field] === "number" && Number.isFinite(spec[field]) && spec[field] > 0), `${at}.${field} must be a positive number or null`);
      check(spec.releaseYear == null || (Number.isInteger(spec.releaseYear) && spec.releaseYear > 2000 && spec.releaseYear < 2100), `${at}.releaseYear must be a plausible year or null`);
      check(spec.storage == null || (Array.isArray(spec.storage) && spec.storage.every((v) => typeof v === "string" && v.length > 0)), `${at}.storage must be an array of non-empty strings or null`);
      check(SPEC_CONFIDENCE.has(spec.confidence), `${at}.confidence must be official|retailer|unverified`);
      check(Array.isArray(spec.sources) && spec.sources.every((u) => /^https?:/.test(String(u))), `${at}.sources must be an array of http(s) URLs`);
      check(spec.missing == null || (Array.isArray(spec.missing) && spec.missing.every((f) => typeof f === "string")), `${at}.missing must be an array of field names`);
      for (const field of spec.missing ?? []) check(SPEC_FIELDS.includes(field), `${at}.missing lists unknown field "${field}"`);
      const stated = SPEC_FIELDS.filter((field) => spec[field] != null);
      check(stated.length === 0 || (spec.sources ?? []).length > 0, `${at}: a non-null spec value requires at least one source URL`);
    }
    const uncovered = [...modelIds].filter((id) => !Object.prototype.hasOwnProperty.call(specs.models ?? {}, id));
    if (uncovered.length) console.warn(`WARN: specs.json has no entry for ${uncovered.length}/${modelIds.size} model id(s): ${uncovered.join(", ")} — those models must render 暂无数据.`);
  }
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
  `OK: contract v1.1 valid · ${latest.records.length} records · ${liveThisWeek.length} live this week · ${markets.countries.length} markets · ${models.models.length} models · fx ${fx.asOf} · history ${historyWeeks.length} weeks / ${historyPoints.length} points${specsChecked ? " · specs present" : ""}`,
);
