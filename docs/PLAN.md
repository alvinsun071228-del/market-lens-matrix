# PLAN — Market Lens Matrix v2 (weekly retail price tracking + USD equivalent)

Owner: planner (role 01). This is the ONLY file this role writes.
Harness note: thinkingLevel=medium (repo is small and already mapped; deep deliberation not required).

## 1. Goal, Scope, Out of Scope

**Goal.** A static site that tracks weekly retail prices of one phone brand (config-driven) across
TR, SA, AE, QA, OM, JO (KW optional/kept), with: a selectable brand/country matrix, a model list
refreshed from what is actually on sale in each market, every price shown in local currency AND a USD
equivalent from a dated FX rate, automatic scheduled updates, and unavailable/blocked sources shown
as unavailable — never fabricated.

**In scope**
- Config-driven brand + country + retailer lists (no hardcoded country/model lists in `src/`).
- Collector produces normalized records for multiple countries with `priceUsd`.
- Static `latest.json` / `markets.json` / `models.json` / `fx.json` consumed by the browser.
- Weekly trend charts + table driven by real collected history.
- Scheduled updates via GitHub Actions, deploy to GitHub Pages.

**Out of scope**
- Any paid/proxy scraping service, credentialed APIs, or browser-farm infrastructure.
- Guaranteed multi-retailer coverage per market: where no verified source exists, the cell is `unavailable`.
- Currency hedging, tax/duty modeling, per-store shipping, or price prediction.
- Backfilling fabricated history: only real collected points appear; gaps stay gaps.

## 2. DATA CONTRACT v1.1 (verbatim; all implementation roles MUST honor)

- `public/data/latest.json` = { apiVersion: "1.1", mode: "live"|"empty", collectedAt, week, sourceCount, verifiedProductCount, fx: { base:"USD", asOf, source, rates: { SAR, AED, TRY, QAR, OMR, JOD, KWD } }, failedSources: [{id,name,error}], records: [{ country, brand, series, model, variant, channel, sourceId, sourceUrl, productId, title, price, currency, priceUsd, availability, state, week, collectedAt, effectiveDate, rawEvidence }] }
- `public/data/markets.json` = { generatedAt, brands:[{id,name}], countries:[{id,name,nameEn,currency,symbol,retailers:[{id,name,url}]}] }
- `public/data/models.json` = { generatedAt, brandId, models:[{id,name,series,variants:[...],countries:{sa:{available:true},...}}] }
- `public/data/fx.json` = { base:"USD", asOf, source, rates:{...} }
- Price math: `priceUsd = round(price * rates[currency], 2)`. If a rate is missing set priceUsd null — never guess.
- state values: live | missing | invalid | unavailable (unavailable => price null).

Mirror `public/api/prices.json` = byte-identical copy of `latest.json`. `data/history/YYYY-MM-DD.json`
= daily snapshot in the same shape.

## 3. FILE OWNERSHIP MAP (exclusive paths — no two roles edit the same file)

| Role | Exclusive paths (create/edit) | Must NOT edit |
|---|---|---|
| **collector** | `config/sources.json`, `scripts/collect.mjs`, `scripts/discover.mjs`, `scripts/fx.mjs` (new), `data/**`, `public/data/**`, `public/api/**`, `public/data/markets.json`, `public/data/models.json`, `public/data/fx.json` | `src/**`, `index.html`, `tests/**`, `.github/**` |
| **frontend** | `src/**`, `index.html`, `tests/**`, `package.json` | `scripts/**`, `config/**`, `data/**`, `public/data/**`, `public/api/**`, `.github/**` |
| **automation** | `.github/workflows/**`, `README.md`, `docs/RUNBOOK.md`, `scripts/validate.mjs` (new) | `src/**`, `scripts/collect.mjs`, `scripts/discover.mjs`, `scripts/fx.mjs`, `config/sources.json` |
| **integrator** | any path — but ONLY after collector/frontend/automation have stopped and reported done | — |

**Boundary hazard to fix (collector owns the fix):** `scripts/discover.mjs` currently
`import { countries, models } from "../src/data.js"` — a collector script reaching into a
frontend-owned file. Change it to read `public/data/markets.json` (brands/countries) and the model
list from `public/data/models.json`, or from `config/sources.json`. Frontend must stop exporting
runtime lists and read the same JSON at runtime.

## 4. Country / Currency Matrix

FX key = the ISO currency code that multiplies a local price into USD (`priceUsd = price * rate`).

| Country | Currency | Symbol | Candidate retailers (verify they exist + are reachable before enabling) |
|---|---|---|---|
| TR | TRY | ₺ | Samsung.com/tr (official), Trendyol, Hepsiburada, Vatan Bilgisayar, Teknosa, MediaMarkt TR |
| SA | SAR | SR | Jarir (already working), Extra, Amazon.sa, Samsung.com/sa_en |
| AE | AED | د.إ | Jarir AE, Extra AE, Amazon.ae, Samsung.com/ae |
| QA | QAR | QR | Jarir QA, Amazon.qa, Carrefour QA, Lulu Hypermarket QA, Samsung.com/qa |
| OM | OMR | ﷼ | Lulu Oman, Sharaf DG Oman, Khimji, Emax Oman, Samsung.com/om (if present) |
| JO | JOD | د.ا | Orange JO, Zain JO, SmartBuy JO, Samsung.com/jo |
| KW (optional, keep) | KWD | د.ك | Jarir KW, Extra KW, X-cite, Best Al-Yousifi |

**unavailable vs blocked rule**
- `unavailable` = the source loaded and returned a result set, but no listing matched the exact
  model + variant (accessory/case/wrong storage excluded). Emit `state:"unavailable"`, `price:null`;
  `models.json` marks that model/country `available:false`. This is a real "not on sale" signal.
- `blocked` = fetch error, non-2xx, timeout, captcha/JS wall, or a parser that cannot read a price.
  Push `{id,name,error}` into `failedSources`. Do **not** emit a fresh price.
  - If a previously verified record exists for the source, carry it with `state:"missing"` (or
    `"invalid"`), keep `effectiveDate` from the original, and set `rawEvidence.carried=true`.
  - If nothing was ever verified, emit nothing (the cell renders `unavailable`).
- A carried `missing`/`invalid` value is never presented as current, never counted as `live`, and
  never seeds a new `effectiveDate`. `verifiedProductCount` counts only records collected this run.

## 5. Update Design

- **Cadence.** Keep `collect.yml` cron `23 * * * *` (hourly — tightened from 6-hourly for timeliness; see docs/INTEGRATION.md §5) (+ `workflow_dispatch`). Each run: `fx.mjs` →
  `collect.mjs` → commit `public/data`, `public/api`, `data/history`. Weekly is a *view* over daily
  snapshots; no separate weekly job is required.
- **Week key.** Use the ISO-8601 week-start date (Monday, `YYYY-MM-DD`, UTC) as `week`. `latest.json.week`
  is the current week; history filenames stay daily (`YYYY-MM-DD`).
- **Weekly aggregation rule.** A trend point for (country, model, channel, variant, week) = the latest
  record in that ISO week that has a real `price` and `state` in {live, promo}, preferring the newest
  `collectedAt`. Ties → lowest price. If the week has only carried/unavailable records, the week is a
  gap (`null` point, `connectNulls:false`) — never interpolate.
- **FX refresh.** `scripts/fx.mjs` fetches dated rates from one free source (e.g. Frankfurter/ECB or
  exchangerate.host), writes `public/data/fx.json` and embeds `fx` in `latest.json`. `asOf` must be the
  rate's own date. On fetch failure: reuse the existing `fx.json` only if `asOf` is ≤ 7 days old,
  otherwise set `priceUsd:null` for affected records (never invent a rate).
- **UI freshness indicator.** Header shows `collectedAt` and `fx.asOf`; a stale banner appears when
  `latest.json` is older than 24h, when `mode:"empty"`, when `failedSources` is non-empty, or when
  `fx.asOf` is older than 7 days. Carried cells keep the existing warning badge plus original
  `effectiveDate`.

## 6. Risks & Anti-Fabrication Rules

**Anti-fabrication (hard rules)**
1. No price without `sourceId` + `sourceUrl` + `collectedAt` + `rawEvidence` from a real fetch.
2. `priceUsd` is `null` whenever the FX rate is missing/stale — never approximate.
3. Blocked/empty sources produce `unavailable` or a marked carry; never a fresh value.
4. Model/country coverage comes from observed listings (`markets.json`/`models.json`), not a static wishlist.
5. `unavailable` ⇒ `price:null`; a null price never becomes a charted point.

**Top risks**
1. **Bot walls (Amazon/Walmart-style) + geo-blocks** on the runner → most markets `blocked`. Mitigate:
   prefer official brand stores / regional chains, stagger requests, keep per-retailer failure isolated.
2. **No free, license-clean FX source** → USD column blank. Mitigate: single documented source,
   dated `asOf`, cache ≤ 7 days, degrade to `null` with a visible banner.
3. **Boundary violation** in `discover.mjs` importing `src/data.js` (see §3) → cross-role edits.
4. **History contamination**: carried `missing` rows re-seeding weekly points would look like real
   trends. Mitigate with the §5 aggregation rule + explicit test.
5. **Layout/flag assets** missing for `tr`, `om`, `jo` (`public/flags/` has only ae/kw/qa/sa) →
   broken images. Mitigate: frontend renders a currency-code fallback when a flag 404s; add stable
   SVG/PNG flags.

## 7. Acceptance Criteria (reviewer checks)

- [ ] `src/` has zero hardcoded country/model/brand lists; all come from `markets.json`/`models.json`.
- [ ] Matrix + charts render for TR/SA/AE/QA/OM/JO from real records; unfetched cells show `unavailable`.
- [ ] Every priced row shows local currency AND `priceUsd` (or explicit "FX unavailable"), with `fx.asOf`.
- [ ] `latest.json` is `apiVersion:"1.1"` and validates against §2; `public/api/prices.json` is identical.
- [ ] `fx.json` present with dated `asOf`; missing rate ⇒ `priceUsd:null`.
- [ ] `failedSources` entries render as unavailable/blocked, not as prices.
- [ ] Scheduled workflow updates data unattended; deploy publishes the site.
- [ ] No fabricated/hardcoded prices anywhere in `src/` or data.

## 8. Verification Checklist

1. `npm run build` — succeeds, no missing-import errors.
2. `npx playwright test` — existing `tests/matrix.spec.js` updated by frontend for 6+ countries; passes
   headless with no `pageerror`.
3. `node scripts/validate.mjs` — schema-checks `public/data/latest.json`, `markets.json`, `models.json`,
   `fx.json` (required keys, `apiVersion:"1.1"`, state enum, `unavailable ⇒ price===null`,
   `priceUsd === round(price*rate,2)` when rate present).
4. `grep -R "Samsung\|A06\|A57" src/` returns no hardcoded country/model runtime list (config only).
5. `diff public/data/latest.json public/api/prices.json` is empty.
6. Spot-check one cell against its `sourceUrl`; confirm `rawEvidence` and `priceUsd` arithmetic.
7. Confirm `data/history/` gains a daily snapshot per run and aggregation yields one point per ISO week.