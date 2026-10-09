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
| 阿联酋 UAE (`ae`) | AED د.إ | Samsung UAE official store, Amazon.ae, Jumbo Electronics |
| 卡塔尔 Qatar (`qa`) | QAR ر.ق | Jarir Qatar (smartphones catalog + product pages) |
| 阿曼 Oman (`om`) | OMR ر.ع | eXtra Oman (Unbxd search API + product-page JSON-LD) |
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

## 更新频率与时效性

这里提供的是 **timely（尽量及时）**，不是实时行情。价格来自公开零售商页面，采集需要
Playwright，随后还要提交静态 JSON 并等待 GitHub Pages 重建，因此无法承诺交易式实时更新。

- `Collect Market Prices` 每小时在第 23 分运行（`23 * * * *`），也支持
  `workflow_dispatch` 手动触发；并发运行会被串行化。
- 单次采集通常需要约 2–4 分钟（包含 Playwright），提交约 1 分钟，Pages 重建约 1–3 分钟。
- GitHub Actions cron 是 best-effort，在 GitHub 负载高时可能延迟。因此“每小时”应理解为
  **最多约 1 小时等待 + 几分钟处理时间**，不是实时。
- CI 会在提交前检查新写入的 `latest.json`：必须是 `mode: "live"`、至少有一个已验证产品，
  `collectedAt` 不得超过 6 小时，FX 的 `asOf` 不得超过 7 天。失败会让工作流失败并通知维护者。
- 单个市场被拦截或没有可达零售商不会使工作流失败；它会进入 `failedSources`，页面显示该市场
  不可用或沿用旧值。只有整批为空或整体过期才触发 CI 告警。页面本身也显示采集时间、FX 日期、
  失败源和过期提示。

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
