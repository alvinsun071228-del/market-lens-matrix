/**
 * Weekly history aggregator (WC C2). Dependency-free.
 *
 * Reads every snapshot in data/history/*.json and writes public/data/history.json —
 * the published weekly price history consumed by the trend chart.
 *
 *   node scripts/history.mjs            # aggregate and write public/data/history.json
 *   node scripts/history.mjs --dry-run  # aggregate and print the summary, write nothing
 *
 * Honesty rules (WC §2, §7) — this script never invents a point or a week:
 *   - `week` is normalized to its ISO Monday week start. Older snapshots stamp the
 *     collection date (often a mid-week day), not a week start.
 *   - Only real observations are kept: a finite `price > 0` AND `state ∈ {live, promo}`.
 *     Carried/absent rows (`missing`/`invalid`/`unavailable`, or a 0/null price) are dropped;
 *     a carried row therefore can never seed a trend point.
 *   - A published point must carry its own evidence: country, model, channel, variant,
 *     currency, sourceId, http(s) sourceUrl and a parseable collectedAt. Records without
 *     them are dropped (never repaired, never guessed).
 *   - `brand`/`series` are copied VERBATIM from the source record (WC C2 rule 7) — never
 *     normalized, never inferred; an empty/missing source value stays null. They are not
 *     part of the dedupe key, so the winning observation's spelling is what ships.
 *   - Dedupe per (country, model, channel, variant, week): the newest `collectedAt` wins;
 *     on an exact tie the lower price wins.
 *   - A malformed snapshot (unreadable JSON, or no records[] array) is skipped with a
 *     warning to stderr; the remaining snapshots are still aggregated.
 *
 * Output order is deterministic: points sorted by country, model, channel, variant, week.
 * `weeks` lists only weeks that actually have a point.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SNAPSHOT_DIR = resolve(root, "data/history");
const OUTPUT_PATH = resolve(root, "public/data/history.json");
const API_VERSION = "1.1";
const REAL_STATES = new Set(["live", "promo"]);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dryRun = process.argv.includes("--dry-run");

/** ISO Monday week start (UTC) of a YYYY-MM-DD value, or null when unparseable. */
function weekStart(value) {
  if (!DATE_ONLY.test(String(value ?? ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

const timestamp = (value) => {
  const ms = Date.parse(value ?? "");
  return Number.isFinite(ms) ? ms : null;
};

const round2 = (n) => Math.round(n * 100) / 100;
/** Rule 7: copy a source field verbatim; empty/missing/non-string becomes null. */
const verbatim = (value) => (typeof value === "string" && value.trim() !== "" ? value : null);
const keyOf = (p) => [p.country, p.model, p.channel, p.variant, p.week].join("\u0001");
const by = (field) => (a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0);

const stats = {
  snapshots: 0,
  skipped: 0,
  records: 0,
  candidates: 0,
  duplicates: 0,
  droppedState: 0,
  droppedPrice: 0,
  droppedEvidence: 0,
};
const points = new Map();
const warn = (message) => console.warn(`WARN history: ${message}`);

let files;
try {
  files = readdirSync(SNAPSHOT_DIR).filter((name) => name.endsWith(".json")).sort();
} catch (error) {
  console.error(`FAIL history: cannot read ${SNAPSHOT_DIR}: ${error.message}`);
  process.exit(1);
}

for (const file of files) {
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(resolve(SNAPSHOT_DIR, file), "utf8"));
  } catch (error) {
    stats.skipped += 1;
    warn(`skipping ${file}: ${error.message}`);
    continue;
  }
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.records)) {
    stats.skipped += 1;
    warn(`skipping ${file}: no records[] array`);
    continue;
  }
  stats.snapshots += 1;

  for (const record of snapshot.records) {
    stats.records += 1;
    if (!record || typeof record !== "object") {
      stats.droppedEvidence += 1;
      continue;
    }
    // Rule 2: real observations only — carried/absent rows never become points.
    if (!REAL_STATES.has(record.state)) {
      stats.droppedState += 1;
      continue;
    }
    if (typeof record.price !== "number" || !Number.isFinite(record.price) || record.price <= 0) {
      stats.droppedPrice += 1;
      continue;
    }
    // Rule 1 + evidence: an unkeyable or unsourced row is dropped, not repaired.
    const [country, model, channel, variant] = [record.country, record.model, record.channel, record.variant].map((v) =>
      typeof v === "string" ? v.trim() : "",
    );
    const week = weekStart(record.week);
    const collectedMs = timestamp(record.collectedAt);
    const currency = typeof record.currency === "string" ? record.currency.trim() : "";
    if (
      !week ||
      collectedMs === null ||
      !country ||
      !model ||
      !channel ||
      !variant ||
      !currency ||
      !record.sourceId ||
      !/^https?:/.test(String(record.sourceUrl ?? ""))
    ) {
      stats.droppedEvidence += 1;
      continue;
    }

    const point = {
      country,
      brand: verbatim(record.brand),
      series: verbatim(record.series),
      model,
      channel,
      variant,
      week,
      price: record.price,
      currency,
      priceUsd: typeof record.priceUsd === "number" && Number.isFinite(record.priceUsd) && record.priceUsd > 0 ? round2(record.priceUsd) : null,
      state: record.state,
      sourceId: String(record.sourceId),
      sourceUrl: String(record.sourceUrl),
      collectedAt: String(record.collectedAt),
      effectiveDate: DATE_ONLY.test(String(record.effectiveDate ?? "")) ? record.effectiveDate : null,
    };
    stats.candidates += 1;

    // Rule 3: newest collectedAt wins; exact tie -> lowest price.
    const key = keyOf(point);
    const previous = points.get(key);
    if (!previous) {
      points.set(key, { point, collectedMs });
      continue;
    }
    stats.duplicates += 1;
    if (collectedMs > previous.collectedMs || (collectedMs === previous.collectedMs && point.price < previous.point.price)) {
      points.set(key, { point, collectedMs });
    }
  }
}

const ordered = [...points.values()]
  .map((entry) => entry.point)
  .sort((a, b) => by("country")(a, b) || by("model")(a, b) || by("channel")(a, b) || by("variant")(a, b) || by("week")(a, b));
const weeks = [...new Set(ordered.map((p) => p.week))].sort();
const artifact = { apiVersion: API_VERSION, generatedAt: new Date().toISOString(), weeks, points: ordered };
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;

console.log(
  [
    `history: ${stats.snapshots} snapshots read · ${stats.skipped} skipped · ${stats.records} records scanned`,
    `  real observations: ${stats.candidates} · merged duplicates: ${stats.duplicates}`,
    `  dropped: ${stats.droppedState} non-real state · ${stats.droppedPrice} non-positive price · ${stats.droppedEvidence} without identity/evidence`,
    `  weeks: ${weeks.length}${weeks.length ? ` (${weeks[0]} … ${weeks.at(-1)})` : ""} · points: ${ordered.length}`,
  ].join("\n"),
);

if (stats.snapshots === 0) {
  console.error(`FAIL history: no readable snapshot in data/history — refusing to publish an empty history.`);
  process.exit(1);
}
if (ordered.length === 0) {
  const message = "aggregation produced 0 real points — refusing to overwrite the published history";
  if (dryRun) {
    console.warn(`WARN history: ${message} (dry run: nothing written anyway).`);
  } else {
    console.error(`FAIL history: ${message}.`);
    process.exit(1);
  }
}

if (dryRun) {
  console.log(`  dry run: ${OUTPUT_PATH} not written`);
} else {
  writeFileSync(OUTPUT_PATH, serialized);
  console.log(`  wrote ${OUTPUT_PATH} (${(Buffer.byteLength(serialized) / 1024).toFixed(1)} KB)`);
}
