# Market Lens Matrix

Weekly retail-price tracking for a phone brand across Middle East markets, with a
price matrix, weekly trend charts, and every price shown in **both local currency and
USD**. Brand, countries, models and FX are configuration/data — not code.

Live site (GitHub Pages): `https://alvinsun071228-del.github.io/market-lens-matrix/`

## What it tracks

| Country | Currency | Verified sources today |
|---|---|---|
| 土耳其 Türkiye (`tr`) | TRY ₺ | Samsung Türkiye official store, Amazon.com.tr |
| 沙特阿拉伯 Saudi Arabia (`sa`) | SAR SR | Samsung Saudi official store, Jarir, Amazon.sa |
| 阿联酋 UAE (`ae`) | AED د.إ | Samsung UAE official store, Amazon.ae |
| 卡塔尔 Qatar (`qa`) | QAR ر.ق | *no reachable source yet — shown as unavailable* |
| 阿曼 Oman (`om`) | OMR ر.ع | *no reachable source yet — shown as unavailable* |
| 约旦 Jordan (`jo`) | JOD د.ا | Samsung Levant (Jordan) official store |
| 科威特 Kuwait (`kw`) | KWD د.ك | *not yet verified* |

A market with no reachable source renders **blank cells** (`暂无该型号`), never a guessed
or zero price. `config/sources.json` and `public/data/markets.json` carry the reason.

## Guarantees

- **No fabricated prices.** A price only exists if a real fetch produced a
  `sourceId` + `sourceUrl` + `collectedAt` + `rawEvidence`. `scripts/validate.mjs`
  enforces this and fails CI before bad data is committed.
- **Honest degradation.** When a source fails, its last verified value is carried
  forward marked `缺价 · 沿用` with the original `effectiveDate`; when there is nothing
  to carry, the cell is blank.
- **Dual currency.** `priceUsd = round(price × fx.rates[currency], 2)` where the rate is
  **USD per one local unit**, dated by `fx.asOf`. No rate ⇒ `priceUsd: null` and the UI
  shows “FX 不可用”.
- **Market-driven models.** `public/data/models.json` is generated from what was actually
  observed on sale per market, not a hardcoded list.

## Data contract v1.1

| File | Contents |
|---|---|
| `public/data/latest.json` | `apiVersion`, `mode`, `collectedAt`, `week`, `sourceCount`, `verifiedProductCount`, `fx`, `failedSources`, `records[]` |
| `public/api/prices.json` | byte-identical mirror of `latest.json` (API endpoint) |
| `public/data/markets.json` | brands, countries (currency/symbol/retailers) |
| `public/data/models.json` | models observed per market with variants + availability |
| `public/data/fx.json` | `base`, `asOf`, `source`, `rates` (USD per 1 local unit) |
| `data/history/<date>.json` | daily snapshot of `latest.json` |

Each record: `country, brand, series, model, variant, channel, sourceId, sourceUrl,
productId, title, price, currency, priceUsd, availability, state, week, collectedAt,
effectiveDate, rawEvidence`. `state ∈ {live, missing, invalid, unavailable}`.

`week` is the ISO week start (Monday, UTC). The weekly trend for a
(country, model, channel, variant) is one point per ISO week taken from real records;
weeks with no real record stay gaps (`connectNulls: false`) and are never interpolated.

## Update cadence

`Collect Market Prices` runs every six hours (`17 */6 * * *`) and on demand:
refresh FX → collect retailers → discover models → validate → commit. `Deploy to GitHub
Pages` rebuilds the site on every push to `main`, so the published site reflects the
latest collection without manual steps.

## Local development

```bash
npm ci
npx playwright install chromium
node scripts/fx.mjs         # refresh USD rates
node scripts/collect.mjs    # collect real prices
node scripts/discover.mjs   # rebuild models.json
node scripts/validate.mjs   # enforce the contract
npm run dev                 # http://localhost:5173
npm run build
npx playwright test
```

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for adding a source, responding to a blocked
market, and FX-staleness handling. [docs/PLAN.md](docs/PLAN.md) holds the ownership map
and acceptance criteria.

## Deployment

The site ships through GitHub Pages (`.github/workflows/deploy.yml`). There is **no
Vercel project for this repository**, so no Vercel deployment is configured or performed.
