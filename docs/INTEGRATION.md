# INTEGRATION — release-candidate reconciliation (role 06)

Owner: integrator (role 06). This file records the freeze, the cross-cutting fixes, the full gate
run and its real numbers, and the residual uncertainty for the lead who commits.

Harness note: thinkingLevel=high (harness-pinned). Justification: the job required reconciling a
data-taxonomy regression that spanned a collector script, three generated JSON trees and a
frontend test, plus a six-stage build/test gate whose failures had to be attributed to the right
owner rather than papered over.

## 1. Freeze (wait for the three builders)

Three builders wrote into this same tree: `03-collector` (`scripts/**`, `config/**`, `data/**`,
`public/**`, `docs/PRICE-AUDIT.md`), `04-frontend` (`src/**`, `tests/**`), `05-automation`
(`.github/**`, `README.md`, `docs/RUNBOOK.md`, `scripts/validate.mjs`).

Poll loop used (as specified): `git status --porcelain | sort | md5`, 90 s apart, break after 3
identical checks.

- The literal rule first tripped at **00:49**, but only 8 files had landed and `03-collector` was
  still `working`. Starting then would have frozen a half-written collector.
- Kept polling. `04-frontend` and `05-automation` finished; `03-collector` completed at
  **17:01:50Z** (`latestTurnState: completed`). Final quiet confirmation then reached 3 stable
  checks at **01:06**, with 17 changed/untracked paths.
- **Wait succeeded.** All three builder threads were `completed`/`idle` before any integrator edit.

Frozen tree at freeze time:

```
 M .github/workflows/collect.yml   M README.md            M config/sources.json
 M data/discovery-report.json      M data/history/2026-10-09.json
 M docs/RUNBOOK.md                 M public/api/prices.json    M public/data/fx.json
 M public/data/latest.json         M public/data/models.json
 M scripts/collect.mjs             M scripts/validate.mjs
 M src/data.js                     M src/main.jsx          M src/styles.css
 M tests/matrix.spec.js            ?? docs/PRICE-AUDIT.md
```

## 2. Cross-cutting reconciliation

### 2.1 Model-identity regression: SA `A57` vs `A57 5G` (fixed)

The collector deliberately changed `deriveModel()` to keep connectivity/sub-model in the model id
(`A17` vs `A17 5G`, `S26` vs `S26+`/`S26 FE`/…). That is correct for genuinely distinct listings
(the official Samsung pages really list both `Galaxy A17` and `Galaxy A17 5G`). But the taxonomy
change also renamed **existing history** without migrating it, because seeded history rows are
carried through untouched:

- `sa | jarir-sa-a57-256 | 256GB | retail` had weeks `2026-09-07 … 2026-10-01` under the legacy id
  `A57`, and the new `2026-10-05` row under `A57 5G`.
- Result: the Saudi retail `Galaxy A57 256GB` trend split into two series — `A57` ending at
  1,549 SAR and a one-point `A57 5G` at 1,429.96 SAR. The required `1,549 → 1,429.96` movement was
  no longer visible.

Evidence that this is the *same product*, so the fix is a label normalization and not fabrication:
the legacy rows and the new row share the **same `sourceId` and the same product `sourceUrl`**
(`https://www.jarir.com/sa-en/samsung-galaxy-a57-5g-smartphones-679663.html`). The collector's own
reason for not migrating was that historical `rawEvidence` has no `title`/`text` — true, but the
product identity does not depend on the title.

Fix (`scripts/collect.mjs`): an explicit, documented `LEGACY_MODEL_IDS` migration applied while
seeding prior records, keyed on `sourceId`:

```js
const LEGACY_MODEL_IDS = {
  // Same product page (.../samsung-galaxy-a57-5g-smartphones-679663.html).
  "jarir-sa-a57-256": { A57: "A57 5G" },
};
```

Only the label changes. Price, currency, `week`, `effectiveDate`, `collectSourceUrl` and evidence
are untouched, and the old label is preserved as `rawEvidence.modelMigratedFrom: "A57"` (25 rows
migrated). No other `sourceId` carries legacy history under a second id (checked exhaustively), so
this is the only migration needed.

Post-fix SA `A57 5G` retail 256GB series (via the app's own `history()`):

```
2026-09-07..09-20  1599 SAR  ($426.40)
2026-09-21..10-01  1549 SAR  ($413.07)   <- expected 1,549
2026-10-05         1429.96 SAR ($381.32) <- expected 1,429.96, delta -119.04 (-7.7%)
```

`cell("sa","A57 5G","retail","256GB")` now reports `previous: 1549`, `value: 1429.96`,
`priceUsd: 381.32`, source `amazon-sa-a57-256`. `models.json` collapsed from 21 → 20 entries (the
split `A57` merged into `A57 5G`, available in `sa` on official + retail).

### 2.2 Stale test premise: Oman is now live (fixed)

`tests/matrix.spec.js` asserted that selecting Oman produced **zero** `.cell-button`s. `03-collector`
enabled eXtra Oman (real OMR prices), so Oman now has 2 priced cells and the assertion failed
(`Received: 2`).

Fix: the "no reachable source ⇒ blank cells, never zeros" check now targets **Kuwait** (`kw`), which
genuinely still has no source, and a new positive assertion covers Oman's real OMR prices. The
honesty assertion is preserved, not weakened — a no-source market must still render 0 priced cells:

```js
// A market still without a reachable source (Kuwait) renders blank cells, not zeros.
await market.selectOption("kw");
await expect(page.locator(".empty-cell").first()).toBeVisible();
await expect(page.locator(".cell-button")).toHaveCount(0);

// Oman was enabled with real eXtra OMR prices, so it now shows priced cells + USD.
await market.selectOption("om");
await expect(page.locator(".cell-button").first()).toBeVisible();
await expect(page.locator(".usd-cell").first()).toContainText("$");
```

`科威特` was also added to the data-driven market-dropdown assertion.

### 2.3 Stale docs (fixed)

- `README.md`: Oman row said *"no reachable source yet — shown as unavailable"*. Replaced with the
  real source: `eXtra Oman (Unbxd search API + product-page JSON-LD)`.
- `docs/RUNBOOK.md` §4 was titled *"Blocked or unavailable markets (currently QA, OM, KW)"* and
  claimed Qatar/Oman had no reachable source. Retitled to `(currently KW)`; recorded that Qatar is
  live via Jarir Qatar and Oman via eXtra's Unbxd API + product JSON-LD.
- `docs/RUNBOOK.md` §7 heading was **"Weekly semantics"** but its body was the **troubleshooting
  table**, and the actual weekly-semantics text had been deleted. Restored the weekly-semantics
  section and renumbered troubleshooting to §8 (file ownership → §9).
- `src/data.js`: the cadence comment cited `17 * * * *` while the workflow is `23 * * * *`. Comment
  corrected to match the real cron.

### 2.4 Checked and cleared (no action needed)

- **No schema drift.** `scripts/validate.mjs` passes; `public/api/prices.json` is byte-identical to
  `public/data/latest.json`.
- **PLAN §3 boundary hazard already resolved**: `scripts/discover.mjs` reads `public/data/markets.json`
  + `config/sources.json`; `grep -rn "src/data" scripts/` returns nothing.
- **`A26` disappearance is intentional**: the only HEAD `A26` row was
  `Galaxy A26 5G Bundle` — a bundle the new `BUNDLE` guard correctly rejects.
- The 19 other current-week model renames (`A27→A27 5G`, `S26→S26 FE`, …) are pure relabels within
  the same week; none split a multi-week series.
- `docs/PRICE-AUDIT.md` retained as delivered.

## 3. Full gate (run in order, real numbers)

Run twice end-to-end; final sequence logged to `work/integration-gate.log` (gitignored). All exit 0.

| # | Command | Result |
|---|---|---|
| 1 | `node scripts/fx.mjs` | `fx source: fawazahmed0/currency-api asOf=2026-10-08 stale=false`; `covered 7/7: TRY, SAR, AED, QAR, OMR, JOD, KWD` |
| 2 | `node scripts/collect.mjs` | `week=2026-10-05 activeSources=18 live=60 totalRecords=85`; `fx asOf=2026-10-08 stale=false` |
| 3 | `node scripts/discover.mjs` | `models=20 countries=7` (tr 14, sa 16, ae 14, qa 6, om 2, jo 3, kw 0/sources 0) |
| 4 | `node scripts/validate.mjs` | `OK: contract v1.1 valid · 85 records · 60 live this week · 7 markets · 20 models · fx 2026-10-08` |
| 5 | `npm run build` | vite v6.4.3, 2168 modules, `dist/assets/index-*.js 34.64 kB`, `charts-*.js 497.53 kB`; built in 2.33 s |
| 6 | `npx playwright test` | `6 passed (2.6s)` — 0 failed (standalone re-run: `6 passed (3.0s)`) |

Port handling: the Playwright config has `reuseExistingServer: !CI`, and port 5173 was already held
by another agent's vite dev server **for this same repo** (confirmed by `lsof` cwd and by it serving
my freshly collected `latest.json`). It was reused and **not killed**. For the manual UI checks I
started my own vite on a free port (**5174**) and killed only my own PID afterwards; 5173 was left
running.

### Counts before → after integration

| Metric | Before (frozen agent output, `collectedAt 17:00:41`) | After (`collectedAt 17:10:27`) |
|---|---|---|
| `latest.json.records` | 85 | 85 |
| `live` records this week (`verifiedProductCount`) | 60 | 60 |
| `sourceCount` | 18 | 18 |
| `failedSources` | 0 | 0 |
| `models.json` total models | 21 (`A57` + `A57 5G` split) | 20 (`A57 5G` only) |
| `fx.asOf` / base | 2026-10-08 / USD | 2026-10-08 / USD |
| `public/api/prices.json` | mirror | byte-identical mirror |
| `data/history/2026-10-09.json` | 85 records | 85 records |

## 4. Weekly-trend proof (task 3)

- Data level: `history("sa","A57 5G","retail","256GB")` yields 26 points, 1,599 → 1,549 → 1,429.96,
  every point `state:live` with a non-null `priceUsd` (413.07 → 381.32).
- UI level (dev server 5174): filtering to `沙特阿拉伯` / `256GB` / `零售渠道`, the A57 5G cell reads
  `1,429.96 SAR · $381.32 · −119.04 SAR · -7.7% · 上周 1,549 SAR · 正常`. Opening the drawer
  (`detail-price`: `当前价格 · USD $381.32`, `1,429.96 SAR`, `历史最低 1,429.96 SAR`,
  `历史最高 1,599 SAR`) renders the `周度趋势` chart; the `显示美元` toggle is checked and the chart's
  SVG axis is denominated in `$` (ticks 378–414). USD is therefore available on the chart.

Proof screenshot: `/Users/alvin/.synara/codex-home-overlay/generated_images/browser-proof/2ee3d1ad24497618e7acbd3b/9951b04f-281c-4201-9f20-089dc28869c2.png`

## 5. Timeliness proof (task 4)

- Workflow `.github/workflows/collect.yml`: `on.schedule` = `cron: "23 * * * *"` (hourly) plus
  `workflow_dispatch`; `concurrency: collect-market-prices, cancel-in-progress: false`; a
  `Fail on unusable or overdue feed` step fails when `mode !== "live"`, `verifiedProductCount === 0`,
  `collectedAt` older than 6 h, or `fx.asOf` older than 7 days. A single blocked market stays
  non-fatal (`failedSources`).
- UI banner (`.freshness`, level `fresh`):
  `数据有效 · 18 个来源 · 60 条本周价格 / 采集于 2026/10/10 01:10:27 · 每 1 小时自动采集 · 预计下次刷新 2026/10/10 02:10:27 · 汇率 2026-10-08 · 有效 · cdn.jsdelivr.net`.
  Cadence, next-refresh estimate and FX date are all shown. `cadenceLabel()` is `每 1 小时自动采集`,
  consistent with the hourly cron and with `COLLECT_CADENCE_MINUTES = 60`.

## 6. Residual uncertainty

1. **`PLAN.md` §5 still says `17 */6 * * *`.** PLAN is the planner-owned authoritative contract and
   was not in the named reconciliation scope (README/RUNBOOK). The live workflow, README and RUNBOOK
   all agree on hourly `23 * * * *`; PLAN is the lone stale reference. Left unedited deliberately —
   flagging for the lead.
2. **The `A57`→`A57 5G` migration is an identity alias, not a re-fetch.** It is justified by shared
   `sourceId` + product `sourceUrl` and is recorded per row (`rawEvidence.modelMigratedFrom`), but a
   reviewer who rejects source-anchored relabeling should re-open that decision.
3. **Banner next-refresh is `collectedAt + 1 h`,** an approximation of the `:23` cron; once the feed
   is older than the cadence the UI honestly switches to `刷新已延迟` instead of projecting a missed
   future time.
4. **The gate depends on live retailers and one FX CDN.** A future run may legitimately change prices
   or block a market (`failedSources` non-fatal); the `fx.mjs` feed is a single free source
   (`cdn.jsdelivr.net`), already cached-staleness-guarded per contract.
5. **Playwright ran against a reused dev server** (5173, this repo, another agent's process). It
   reflected current disk state, but that server was not started by this role.
6. **`models.json` 21 → 20** is a consequence of the A57 merge, not data loss: no priced record was
   dropped (`records` stayed 85, `live` stayed 60).
