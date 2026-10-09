/**
 * FX refresh: writes public/data/fx.json with USD conversion rates.
 *
 * Contract (v1.1): `rates[CCY]` is the USD value of ONE unit of that local
 * currency, so that `priceUsd = round(price * rates[currency], 2)`.
 *
 * Upstream feeds quote 1 USD = X local, so every rate is inverted here.
 * No key is required. If every feed fails we keep the previous file and mark
 * `stale: true`; callers must then leave `priceUsd` null rather than guess.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TRACKED_CURRENCIES = ["TRY", "SAR", "AED", "QAR", "OMR", "JOD", "KWD"];
export const FX_PATH = resolve(fileURLToPath(new URL("..", import.meta.url)), "public/data/fx.json");

const FEEDS = [
  {
    id: "fawazahmed0/currency-api",
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    extract: (payload) => ({
      asOf: payload?.date ?? null,
      // payload.usd = { try: 49.21, sar: 3.75, ... }  => 1 USD = X local
      perUsd: Object.fromEntries(
        Object.entries(payload?.usd ?? {}).map(([k, v]) => [k.toUpperCase(), Number(v)]),
      ),
    }),
  },
  {
    id: "open.er-api.com",
    url: "https://open.er-api.com/v6/latest/USD",
    extract: (payload) => ({
      asOf: payload?.time_last_update_utc
        ? new Date(payload.time_last_update_utc).toISOString().slice(0, 10)
        : null,
      perUsd: Object.fromEntries(
        Object.entries(payload?.rates ?? payload?.conversion_rates ?? {}).map(([k, v]) => [
          k.toUpperCase(),
          Number(v),
        ]),
      ),
    }),
  },
];

const invert = (perUsd) =>
  Object.fromEntries(
    Object.entries(perUsd)
      .filter(([, v]) => Number.isFinite(v) && v > 0)
      .map(([k, v]) => [k, Number((1 / v).toFixed(10))]),
  );

export async function readFx() {
  try {
    return JSON.parse(await readFile(FX_PATH, "utf8"));
  } catch {
    return null;
  }
}

/** Fetch the freshest rates we can. Throws only if every feed fails. */
export async function fetchFx({ timeoutMs = 20000 } = {}) {
  const attempts = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { "user-agent": "MarketLensFX/1.1 (+https://github.com/alvinsun071228-del/market-lens-matrix)" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { asOf, perUsd } = feed.extract(await res.json());
      const allRates = invert(perUsd);
      // Keep the payload small: only the currencies this tracker converts.
      const rates = Object.fromEntries(
        TRACKED_CURRENCIES.filter((c) => Number.isFinite(allRates[c])).map((c) => [c, allRates[c]]),
      );
      const covered = TRACKED_CURRENCIES.filter((c) => Number.isFinite(rates[c]));
      attempts.push({ feed: feed.id, asOf, rates, covered });
      if (covered.length === TRACKED_CURRENCIES.length) {
        return { asOf, source: feed.url, sourceId: feed.id, rates, covered, partial: false };
      }
    } catch (error) {
      attempts.push({ feed: feed.id, error: String(error.message || error) });
    }
  }
  const best = attempts
    .filter((a) => a.rates)
    .sort((a, b) => b.covered.length - a.covered.length)[0];
  if (!best) {
    const detail = attempts.map((a) => `${a.feed}: ${a.error}`).join("; ");
    throw new Error(`all FX feeds failed (${detail})`);
  }
  return {
    asOf: best.asOf,
    source: FEEDS.find((f) => f.id === best.feed)?.url ?? best.feed,
    sourceId: best.feed,
    rates: best.rates,
    covered: best.covered,
    partial: true,
  };
}

/** Refresh public/data/fx.json. Returns the object that was written (or reused). */
export async function refreshFx({ timeoutMs = 20000 } = {}) {
  const previous = await readFx();
  try {
    const fresh = await fetchFx({ timeoutMs });
    const payload = {
      base: "USD",
      asOf: fresh.asOf,
      fetchedAt: new Date().toISOString(),
      source: fresh.source,
      sourceId: fresh.sourceId,
      unit: "USD per 1 unit of local currency",
      partial: fresh.partial,
      stale: false,
      rates: fresh.rates,
    };
    await mkdir(dirname(FX_PATH), { recursive: true });
    await writeFile(FX_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  } catch (error) {
    if (previous?.rates && Object.keys(previous.rates).length) {
      const reused = { ...previous, stale: true, error: String(error.message || error) };
      await writeFile(FX_PATH, `${JSON.stringify(reused, null, 2)}\n`);
      return reused;
    }
    const empty = {
      base: "USD",
      asOf: null,
      fetchedAt: new Date().toISOString(),
      source: null,
      unit: "USD per 1 unit of local currency",
      stale: true,
      error: String(error.message || error),
      rates: {},
    };
    await mkdir(dirname(FX_PATH), { recursive: true });
    await writeFile(FX_PATH, `${JSON.stringify(empty, null, 2)}\n`);
    return empty;
  }
}

/** The `fx` block embedded in latest.json. */
export function fxBlock(fx) {
  if (!fx) return { base: "USD", asOf: null, source: null, stale: true, rates: {} };
  return { base: "USD", asOf: fx.asOf ?? null, source: fx.source ?? null, stale: fx.stale === true, rates: fx.rates ?? {} };
}

export function toUsd(price, currency, fx) {
  const rate = fx?.rates?.[currency];
  if (!Number.isFinite(price) || !Number.isFinite(rate)) return null;
  return Math.round(price * rate * 100) / 100;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const fx = await refreshFx();
  const covered = TRACKED_CURRENCIES.filter((c) => Number.isFinite(fx.rates?.[c]));
  console.log(`fx source: ${fx.sourceId ?? "none"} asOf=${fx.asOf ?? "n/a"} stale=${fx.stale === true}`);
  console.log(`covered ${covered.length}/${TRACKED_CURRENCIES.length}: ${covered.join(", ")}`);
  console.log(JSON.stringify(fx.rates, null, 2));
}
