# RUNBOOK — Market Lens Matrix

Operational guide for the collection pipeline and the published site.

## 1. Local run (full cycle)

```bash
npm ci
npx playwright install chromium          # required for amazon-search / browser-text sources

node scripts/fx.mjs        # refresh USD rates -> public/data/fx.json
node scripts/collect.mjs   # collect all enabled sources -> latest.json, api mirror, history
node scripts/discover.mjs  # rebuild models.json from observed listings
node scripts/validate.mjs  # enforce contract v1.1 (exit 1 on any violation)

npm run dev                # http://localhost:5173
npm run build              # production bundle
npx playwright test        # contract + helper + UI tests
```

`collect.mjs` always refreshes FX first. If every FX feed is unreachable it reuses the
previous `fx.json` with `stale: true` and leaves `priceUsd` null, so USD columns go blank
rather than wrong.

## 2. Parsers

| `parser` | Works on | Notes |
|---|---|---|
| `samsung-official-list` | Brand regional Galaxy listing pages | Reads the JSON-LD `ItemList`; emits **one record per model+variant** (lowest listed price). This is what keeps the model list in sync with each market. |
| `amazon-search` | Local Amazon storefronts | Renders the search page with Playwright, matches model + storage in a result card, verifies with the product page when reachable, otherwise falls back to the card price (`amazon-search-card`). |
| `browser-text` | A single retailer product page | Renders with Playwright and extracts a localized price token. |
| `jsonld` | Any page exposing a schema.org Product/Offer | Plain fetch, no browser. |

Localized price tokens are handled per currency: `SAR/SR/ريال`, `AED/د.إ/درهم`,
`TRY/₺/TL`, `QAR/ر.ق`, `OMR/ر.ع`, `JOD/د.ا`. Turkish formatting (`13.299 TL` =
13,299) and Gulf formatting (`1,429.96`) are both parsed correctly.

Guard rails against bad rows: marketing copy mentioning an accessory
(`case/cover/kılıf/حافظة…`), used/refurbished listings, prices below the phone floor
(`< $30` equivalent, or the per-currency floor in `LOCAL_FLOOR`), and a strict
model-equality check so a search card for another model is rejected.

## 3. Adding a source

1. Verify the price is reachable **from a runner**, not just your browser:
   `curl -sL -A "<desktop UA>" "<url>" | grep -o '<currency token>'`.
   A 200 with the price in HTML/JSON-LD → use `jsonld`/`samsung-official-list`.
   A 403/Cloudflare page or a JS-only price → it needs Playwright (`browser-text`/
   `amazon-search`) and may still fail on CI.
2. Add an entry to `config/sources.json` with a unique `id`, `country`, `channel`,
   `currency`, `url`, `parser`, and `enabled: true` only after step 1 succeeded.
3. `node scripts/collect.mjs && node scripts/validate.mjs`.
4. Confirm `public/data/latest.json` gained records for the expected
   `(country, model, variant)` with a `sourceUrl` you can open.

## 4. Blocked or unavailable markets (currently QA, OM, KW)

- `unavailable` = source loaded, but no listing matched the exact model+variant →
  `state:"unavailable"`, `price:null`, and CI stays green.
- `blocked` = fetch error / 4xx / captcha / JS wall → the source lands in
  `failedSources`, its previous value (if any) is carried as `missing`, and the UI shows
  the reason. **Do not** enable a source that has never returned a live price.
- Qatar (`qa`) and Oman (`om`) currently have no reachable source: Jarir Qatar renders an
  empty shell, Extra Oman returns a server error, Lulu/noon/Sharaf DG answer 403
  (Cloudflare). They stay disabled with a `disabledReason`; the matrix renders blank
  cells. To fix: repeat §3 against a source you can reach from CI, or accept the blank.

## 5. FX staleness

`public/data/fx.json` carries `asOf` (rate date) and `stale`. The UI shows
`汇率 <asOf> · 有效|已过期` and warns when the rate is older than 7 days or
`latest.json` older than 24 h. If the feeds are down for a long period, either switch the
feed URL in `scripts/fx.mjs` (`FEEDS` array) or accept `priceUsd: null` — never hardcode
a rate.

## 6. Weekly semantics

`latest.json.week` is the ISO week start (Monday, UTC). Every collect run rewrites the
current week's rows; older weeks are immutable history. The trend chart takes one point
per ISO week from real records and leaves missing weeks as gaps
(`connectNulls: false`). Carried rows (`missing`/`invalid`) are labelled and keep their
original `effectiveDate`; they are never presented as a fresh price and never seed a new
trend point.

## 7. Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| `validate.mjs` fails on `priceUsd` | FX rate missing for that currency | check `public/data/fx.json`, re-run `node scripts/fx.mjs` |
| `api mirror is not byte-identical` | `latest.json` edited by hand | re-run `node scripts/collect.mjs` |
| A market suddenly blank | retailer changed markup / bot wall | check `failedSources` in `latest.json`, re-verify §3 |
| Turkish prices look 1000× too small | locale separator regression | see `parseLocalizedNumber` in `scripts/collect.mjs` |
| `cell-button` shows a stale value | source failed; value carried | expected; badge `缺价 · 沿用` + original date |

## 8. File ownership

`config/sources.json`, `scripts/{collect,discover,fx}.mjs`, `data/**`, `public/data/**`,
`public/api/**` → collection. `src/**`, `index.html`, `tests/**` → frontend.
`.github/workflows/**`, `README.md`, `docs/**`, `scripts/validate.mjs` → automation.
