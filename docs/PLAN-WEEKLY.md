# PLAN-WEEKLY — weekly cadence, spec drawer, seven filters, weekly trend + summary

Owner: **01-planner** (light). This is the ONLY file this role writes.
Source of truth: `docs/WEEKLY-CONTRACT.md` (WC, frozen) **including amendment §3.3 A1–A3 and the §3.4 final rulings** (mirrored in §9 below). Where this plan and WC disagree, WC wins and the disagreement goes to the Lead; no open question remains (§8).
Harness note: thinkingLevel=**medium** — small, already-mapped repo, but R4's feasibility depended on numbers only the snapshots could supply, so I verified them read-only first (§0). No build/test gate was run here; the builders own those gates.

## 0. Evidence this plan is built on (read-only, reproducible, independently reproduced by the Lead)

- `data/history/*.json` = **34 snapshots**, **6,908** rows; **1,259** real observations (`price` finite > 0 **and** `state ∈ {live, promo}`); **5,420** `missing` carried rows (78%). Zero malformed files.
- Those snapshots normalize (`weekStart`) to exactly **5 ISO weeks**: `2026-09-07 … 2026-10-05`.
- **123** series (`country|model|channel|variant`) have ≥1 real point; only **4** have adjacent-week points — `sa|A57|retail|256GB`, `sa|A16|retail|128GB`, `sa|A06|retail|128GB`, `sa|A57 5G|retail|256GB`, all **Saudi retail**. `matched = 3, 4, 4, 4` for `2026-09-14 → 2026-10-05`; collapsing `variant=ALL` or `channel=ALL` changes nothing. **Every market except `sa` has matched = 0 in every week.**
- Expected `public/data/history.json`: **138** deduped points (3/5/4/4/122 per week), ≈150 KB.
- Merged with `latest.json`, the deterministic first-run trend is `medianPct = 0.00%, 0.00%, 0.00%, −3.87%`, `index = 100, 100, 100, 96.13`, `sample = 3, 4, 4, 4`, `insufficient = false`; `suspects` appear only in the last two weeks (A2 numbers confirmed: `sa|A06` −99.3% then **+11731.8%**; `sa|A16` −66.2%). A reviewer can use this as the expected baseline — valid only if the dedupe rule is implemented exactly as specified.
- `public/data/latest.json`: 152 records = **127** current-run (`week = 2026-10-05`) + **25** retained single rows stamped with *daily* dates `2026-09-07 … 2026-10-01` that are **not** ISO week starts.
- `public/data/models.json`: **22** ids; snapshots carry **24** model strings, the extras being `A06` and `A57` (865 real rows) — the ids that make A1 load-bearing.

## 1. R1–R4 → workstream mapping

| Req | Deliverable | Primary (task) | Supporting |
|---|---|---|---|
| **R1** weekly Monday refresh | cron + cadence constants + banner + README | **pipeline** (5): `collect.yml`, `README.md` | **data-layer** (3): `COLLECT_CADENCE_MINUTES`/`COLLECT_SCHEDULE`/`STALE_AFTER_MINUTES`/`cadenceShort`/`cadenceLabel`/`nextRefresh` |
| **R2** model name → specs | spec view in the existing `Drawer` | **ui** (4): `main.jsx`, `styles.css` | **data-layer** (3): `specs`/`specOf`/`specValues`/`specsLoaded` + fetch; **researcher** (2): `specs.json` |
| **R3** seven filters | one visible bar, spec buckets, exclusion count | **ui** (4) | **data-layer** (3): `specValues`; **researcher** (2): bucket population |
| **R4** weekly trend + summary | `history.json` → merge → `weeklyTrend` → chart + 趋势分析总结 | **pipeline** (5) → **data-layer** (3) → **ui** (4) | **researcher** (2): spec-filter values |

## 2. Ordered waves + exclusive file ownership (one writer per file)

**Wave 0 — contract (done, Lead).** WC frozen, including §3.3 A1–A3 and §3.4 (all OQs resolved; see §9).
**Wave 1 — parallel builders**, no shared file: `02-researcher` (2) ‖ `03-data-layer` (3) ‖ `04-pipeline` (5).
**Wave 2 — ui** (4), `blocked_by: 3` only. It consumes frozen WC §3 *names* and must render honestly while `specs.json`/`history.json` are still absent (non-fatal fetch), so it is **not** blocked by 2 or 5.
**Wave 3 — integrator** (6), `blocked_by: 1..5`, after every builder stops. **Wave 4 — reviewer** (7), `blocked_by: 6`; Lead loops back on FAIL.

| Thread (owner) | Exclusive write paths | Must NOT write |
|---|---|---|
| `02-researcher` | `public/data/specs.json`, `docs/SPECS.md` | `src/**`, `scripts/**`, `tests/**`, `.github/**`, other `public/data/*` |
| `03-data-layer` | `src/data.js`, `tests/matrix.spec.js` | `src/main.jsx`, `src/styles.css`, `tests/ui-weekly.spec.js`, `scripts/**`, `.github/**`, `public/**`, `README.md` |
| `04-pipeline` | `scripts/history.mjs` (new), `scripts/validate.mjs`, `.github/workflows/collect.yml`, `README.md`, `public/data/history.json` (generated only) | `src/**`, `tests/**`, `config/**`, `scripts/{collect,discover,fx,coverage}.mjs`, other `public/data/*`, `public/api/**` |
| `06-integrator` | `docs/INTEGRATION-WEEKLY.md` + smallest correct cross-file fixes, documented | `docs/WEEKLY-CONTRACT.md` |
| `07-reviewer` | `docs/REVIEW-WEEKLY.md`; read-only everywhere else | all source/data files |

**One-writer flags (settle before writing, not during):**
1. `public/data/history.json` is a **generated artifact**: `scripts/history.mjs` is its only writer. Nobody hand-edits it; the integrator regenerates it rather than patching it.
2. `scripts/history.mjs` and `scripts/validate.mjs` must **not** import `weekStart` from `src/data.js` — scripts do not depend on `src/**` here (only `tests/matrix.spec.js` does). Keep the ISO-week helper local; a shared helper module would create a second writer.
3. `src/data.js` is the only client-side reader of `specs.json`/`history.json`; `main.jsx` imports the frozen WC §3 names and never fetches those files itself.
4. `README.md` and both pipeline files belong to one writer (thread 5) — that is one writer, not an overlap.

## 3. Per-file change list

- **`src/data.js`** (3, WC C1+C3): `COLLECT_CADENCE_MINUTES = 10080`; new `COLLECT_SCHEDULE` (`{weekday:1, hourUtc:3, minuteUtc:17, label:"每周一 03:17 UTC"}`); `STALE_AFTER_MINUTES = 11520`; `cadenceShort()` → `"每周一"`; `cadenceLabel()` → `"每周一 03:17 UTC 自动采集"`; `nextRefresh()` derived from `COLLECT_SCHEDULE` (next Monday 03:17 UTC after `collectedAt`) with honest late text `刷新已延迟 · 距上次采集已超过 1 周`; `freshness()` levels and `FX_STALE_AFTER_DAYS = 7` unchanged. `loadRemoteRecords()` also fetches `data/specs.json` + `data/history.json`, failures recorded in `dataInfo.errors`, never fatal. New exports `specs`, `specOf`, `specValues`, `specsLoaded`. `history()` → one point per normalized ISO week from `latest.json` + `history.json`, dedupe by `country|model|channel|variant|week` with the §3.4 precedence (a **real** observation always beats a carried row; among real points the current week prefers `latest.json`, else newest `collectedAt`, then lowest price); a carried row **keeps its price with `carried: true`** (never nulled), may fill only a week with no real point, and never feeds a delta. `cell()` `delta`/`percent` only when the current and immediately preceding priced points are **both** real, else `null`. New pure `weeklyTrend(scope)` per WC §3.2 **and §3.3 A1–A3** (all real points, no `models.json` restriction; `summary.suspects`; concentration detail) plus `excluded.{missingSpec,noSpec}`. No `window`/`import.meta.env` at module scope.
- **`src/main.jsx`** (4, WC C5): model name in the matrix **first (header) row** becomes a keyboard-reachable `<button>` (`aria-label` `Galaxy <model> 产品规格`) opening the existing `Drawer`; one visible filter bar with all seven selects (国家/渠道/品牌/系列/屏幕尺寸/容量/电池) + search + reset — the 更多筛选 toggle that hides 品牌/系列 must go; spec buckets from `specValues`; the `N 个型号因缺少规格数据被排除` line; new `本周价格变化趋势` section after matrix/signals calling `weeklyTrend(scope)`, stating scope + sample size, `本周可比样本不足` / `样本仅来自<市场> · <渠道>` when A3 trips, and `疑似异常，需核对来源` for A2 suspects. Regressions preserved: matrix, cell drawer, CSV export, freshness banner, week picker, `本周变动`, flag fallback, reduced motion.
- **`src/styles.css`** (4): filter bar fitting seven controls (wrap/scroll; no clipping at 375 px), spec field list, trend section, chart gap styling.
- **`scripts/history.mjs`** (5, **new**, WC C2): read every `data/history/*.json`, normalize `week` via a **local** `weekStart`, keep only real observations, dedupe per `(country, model, channel, variant, week)` preferring newest `collectedAt` then lowest price, emit deterministic `{apiVersion:"1.1", generatedAt, weeks, points}`, warn+skip a malformed snapshot, invent nothing, support `--dry-run`.
- **`scripts/validate.mjs`** (5, WC C2): strict `history.json` checks (apiVersion `1.1`; `weeks` sorted ISO; every `point.week ∈ weeks` and `=== weekStart(point.week)`; `price` finite > 0; `state ∈ {live,promo}`; `sourceId`/`sourceUrl`/`collectedAt` present; one point per key) + a `specs.json` shape check (malformed ⇒ fail, absent ⇒ warn). **No existing check may be weakened**, including the byte-identical `public/api/prices.json` mirror.
- **`.github/workflows/collect.yml`** (5, WC C1): `cron: "17 3 * * 1"`; keep `workflow_dispatch`, `concurrency`, step order; insert the history step **before** validation; alarm becomes **8 days** for `collectedAt` and `fx.asOf`; keep `mode !== "live"` / `verifiedProductCount === 0` failures. The existing `git add public/data …` already stages the artifact.
- **`README.md`** (5, WC C1): rewrite §更新频率与时效性 (now "每小时…`23 * * * *`" plus a 6-hour claim) to the weekly Monday 03:17 UTC snapshot, its real latency (cron is best-effort; collection + commit + Pages rebuild), and rebuild-only-after-successful-collection.
- **`public/data/history.json`** (5, generated): the WC C2 artifact, ≈138 points; `public/` is copied into `dist/` by Vite, so no build-config change is needed.
- **`public/data/specs.json`** (2, WC C4): exactly the 22 `models.json` ids as keys; unverifiable fields `null` and named in `missing`; every non-null value traced to a URL actually fetched.
- **`tests/matrix.spec.js`** (3): keep every existing test green; add `weeklyTrend` units (multi-week fixture ⇒ expected index/median/up/down; thin sample ⇒ `insufficient` + null index; a carried row never becomes a point; a model **absent from `models.json`** still contributes a matched pair per A1) and cadence units (`nextRefresh` across a Monday boundary, new stale threshold).
- **`tests/ui-weekly.spec.js`** (4, **new**): fixture-driven, must not depend on the researched `specs.json`; asserts no `pageerror`, all seven filters visible and narrowing, drawer open/Escape/focus return, trend section rendering, and the A2/A3 copy.

## 4. Risk register

| # | Risk | Evidence | Mitigation (who) |
|---|---|---|---|
| **R-1** | **Thin, single-market sample**: the trend rests on 4 series, `matched = 3/4/4/4`, all Saudi retail; it only becomes statistically meaningful as consecutive weekly collections accumulate | §0; A1/A3 | Report `sample` per week and `summary.insufficient`; name the contributing market/channel when concentrated; keep `connectNulls:false`; an honest gap/insufficient state is a **PASS** outcome (ui, data-layer, reviewer) |
| **R-2** | **Carried rows as the historical norm**: 78% of snapshot rows are `missing` because the old hourly runs mostly carried; a naive aggregate would report carried data as a trend | §0: 5,420/6,908 | `history.mjs` keeps only real observations; `weeklyTrend` uses only real adjacent weeks; carried rows may still render in `cell()` as `缺价 · 沿用` but never as a delta or a point; a test feeds a `missing` row and asserts no point (3, 5) |
| **R-3** | **Threshold unit trap (100×)**: `suspects` uses `\|pct\| > 0.5` as a **fraction** (>50% WoW, per A2's parenthetical), while `changedUp/Down` use ±0.5% (`0.005`). Implementing suspects at 0.5% would flag every small move | §3.3 A2; §3.2 | Implement `Math.abs(pct) > 0.5` on the fraction; assert on real data that `sa\|A06` (+11731.8%, −99.3%) and `sa\|A16` (−66.2%) are suspects while `sa\|A57 5G` (−3.1%, −7.7%) is **not** (3, 7) |
| **R-4** | **Suspects dominate a small sample**: A2 keeps extremes in the median, and at `matched = 3` one outlier moves it | §3.3 A2; matched = 3 for `2026-09-14` | Never delete suspects, but always label them `疑似异常，需核对来源` and show `sample` next to `medianPct`; the summary must not state a trend the 3-point median cannot support (data-layer, ui) |
| **R-5** | **Specs coverage gaps for 2026-generation ids** (`A17`, `A17 5G`, `A27 5G`, `A37 5G`, `A57 5G`, `A07S`, `A08`, `S26*`): official pages may not exist, so `screenInches`/`batteryMah` stay `null` and those models drop out under an active spec filter | WC §4 permits documented partial coverage | `specs.json` still carries all 22 keys with `null` + `missing`; the excluded-count line makes the loss visible; `specValues` offers only real buckets (2, 4) |
| **R-6** | **Weekly cron vs Pages rebuild coupling**: a `GITHUB_TOKEN` data commit does not trigger `push` workflows, and a weekly cron freezes the site for ~7 days after one failed run | `deploy.yml` already uses `workflow_run` + `conclusion == 'success'` | Keep `workflow_run` and the success guard; `collect.yml` fails loudly on an unusable feed; verify `dist/data/history.json` exists after `npm run build` (5, 6) |
| **R-7** | **Backward-compatible exports across waves**: `main.jsx` (wave 2) compiles against `src/data.js` (wave 1) while `tests/matrix.spec.js` already asserts `COLLECT_CADENCE_MINUTES` as hourly | `tests/matrix.spec.js` refresh-promise test | `src/data.js` lands first (`task-4` hard-blocked by `task-3`); every new export is additive; the changed constant is updated in the same commit as the test that reads it; no export renamed or removed (3, 4) |
| **R-8** | **Non-ISO week stamps**: 25 retained `latest.json` rows and most older snapshots use daily dates, so one week can fragment into 8 | §0 | Normalize with `weekStart` on both sides of the merge and inside `history.mjs`; `validate.mjs` asserts `point.week === weekStart(point.week)`; a fixture with two daily stamps in one ISO week collapses to one point (3, 5) |
| **R-9** | **Gate ordering**: the history step must run after collection and before validation; `specs.json` is researcher-authored, so its absence must not break CI | WC C1/C2 | Assert the exact step order in review; `validate.mjs` warns (not fails) when `specs.json` is absent, fails when malformed (5) |
| **R-10** | **Per-cell deltas stay mostly empty**: 119/123 series have one week, so `本周变动` stays near 0 and looks like a bug | §0 histogram `{1:119, 4:1, 5:3}` | Gate the **aggregate** trend, not per-cell deltas; the UI must not imply per-cell movement that does not exist (4, 7) |

## 5. Acceptance criteria (reviewer-checkable)

**R1 — weekly cadence**
- [ ] `collect.yml` cron is exactly `"17 3 * * 1"`; `workflow_dispatch` and `concurrency` still present.
- [ ] Alarm fails at **8 days** for `collectedAt` and `fx.asOf`, and still on `mode !== "live"` / `verifiedProductCount === 0`.
- [ ] `src/data.js` exports `COLLECT_CADENCE_MINUTES === 10080`, the WC `COLLECT_SCHEDULE`, `STALE_AFTER_MINUTES === 11520`.
- [ ] `cadenceShort() === "每周一"`, `cadenceLabel() === "每周一 03:17 UTC 自动采集"`, and the rendered banner says 每周一, not 每小时.
- [ ] `nextRefresh()` returns the next Monday 03:17 UTC after `collectedAt`, and reports the delay once that instant has passed.
- [ ] `README.md` keeps no hourly claim; it states weekly Monday 03:17 UTC, non-real-time snapshots, rebuild-after-success.

**R2 — spec view**
- [ ] Model name in the matrix first (header) row is a Tab-reachable `<button>` activatable by Enter/Space, `aria-label` `Galaxy <model> 产品规格`.
- [ ] It opens the existing `Drawer` titled `<model> · 产品规格` with 屏幕尺寸 / 电池容量 / 容量（存储）/ 运行内存 / 芯片 / 发布时间 / 来源链接.
- [ ] A field absent from `specs.json` renders `暂无数据`; a model with no entry renders one honest line and no invented rows.
- [ ] Drawer source links are the `sources` URLs from `specs.json`; no `null` value is displayed as a number.

**R3 — seven filters**
- [ ] All seven controls plus search and reset are visible in one bar **without opening a secondary toggle**.
- [ ] 屏幕尺寸 offers only `${screenInches}"` values present in `specs.json`; 电池 only `${batteryMah} mAh` present there; no invented option.
- [ ] 容量 matches the model's variants **or** `specs.storage`.
- [ ] Each of the seven filters independently narrows the matrix and no stale model remains a match after narrowing.
- [ ] With an active spec filter the page prints `N 个型号因缺少规格数据被排除`, where N equals `weeklyTrend(...).excluded.missingSpec` for the same scope; filtering never silently hides models.
- [ ] With `specs.json` absent (failed fetch) the bar degrades honestly — no crash, no invented options — and `dataInfo.errors` records it.

**R4 — weekly trend + summary**
- [ ] `public/data/history.json` exists, `apiVersion === "1.1"`, and `node scripts/validate.mjs` exits 0 while enforcing every WC C2 history check.
- [ ] `history()` yields at most one point per ISO week; two daily-stamped rows in one ISO week collapse to one.
- [ ] `weeklyTrend()` is importable in plain Node; `index` is `100` at the first week with a non-null `medianPct`, then chained; `matched < 3` ⇒ `medianPct: null` and `index: null` (gap, no interpolation).
- [ ] `summary.insufficient` is `true` exactly when fewer than 2 weeks have a non-null `medianPct`.
- [ ] **A1**: `weeklyTrend` computes over all real merged weekly points and is not restricted to `models.json` ids; a test proves `A06`/`A57` (absent from `models.json`) still contribute matched pairs; the section states its scope and sample size.
- [ ] **A2**: `summary.suspects` holds matched series with `|pct| > 0.5` **fraction** (>50% WoW), suspects **remain in the median**, and the summary names them `疑似异常，需核对来源`; on current data `sa|A06` (+11731.8%, −99.3%) and `sa|A16` (−66.2%) are suspects while `sa|A57 5G` (−3.1%, −7.7%) is not.
- [ ] **A3**: when the latest week's matched sample is `< 3` the section says `本周可比样本不足`; when the sample is concentrated in one market/channel it names it (current data: `样本仅来自沙特阿拉伯 · 零售渠道`).
- [ ] First-run baseline, **derived not authoritative** (only if the dedupe is implemented exactly as specified): `sample = 3, 4, 4, 4`, `medianPct = 0.00%, 0.00%, 0.00%, −3.87%`, `index = 100, 100, 100, 96.13`, `insufficient = false`. Integrator and reviewer must derive their own; a mismatch is a Lead question, not an automatic FAIL.
- [ ] The `本周价格变化趋势` section renders after matrix/signals with an index line (`connectNulls:false`), up/down counts, and sample size; 趋势分析总结 uses only `summary` — no narrative the numbers cannot support.
- [ ] A carried (`missing`/`invalid`) row keeps its price with `carried: true` in `history()` — it is **not** nulled — but it is never a trend point and never produces a `delta`/`percent` (fixture test shows both).

**Regression & process**
- [ ] `npm run build` succeeds; `npx playwright test` passes `tests/matrix.spec.js` and `tests/ui-weekly.spec.js`.
- [ ] `dist/data/history.json` and `dist/data/specs.json` exist in the build output.
- [ ] `tests/ui-weekly.spec.js` passes on fixtures alone — deleting `public/data/specs.json` does not fail it.
- [ ] Matrix, cell drawer, CSV export, freshness banner, week picker, `本周变动`, flag fallback, reduced motion and mobile layout still work.
- [ ] No writer other than the owner touched a file in §2; `public/data/history.json` was produced only by `scripts/history.mjs`.

## 6. R3 duplicate 屏幕尺寸 — interpretation note (WC §6, restated)

R3's requirement string lists **屏幕尺寸 twice**: `国家 / 渠道 / 品牌 / 系列 / 屏幕尺寸 / 容量 / 电池 / 屏幕尺寸`. Two readings are possible: a typo, or a dropped seventh field (e.g. 价格区间). Per WC §6 we implement the **seven distinct filters** above and **do not invent a replacement field**. The final summary must report this decision back to the requester so the missing field can be supplied.

## 7. Anti-fabrication (hard rules — every thread, unchanged)

1. No price or spec value without a real, recorded source (`sourceId` + `sourceUrl` + `collectedAt` + `rawEvidence`; specs: a URL actually fetched).
2. No interpolation or extrapolation; a gap stays a gap (`connectNulls: false`).
3. Carried rows stay visibly marked (`缺价 · 沿用`) and never seed a trend point or a delta.
4. Missing data renders blank / `暂无数据` / an explicit note — never a placeholder number.
5. Nothing in `src/` or the data may be hardcoded per country/model except config.
6. A thin sample is reported as thin (`insufficient`, `sample`); suspects are labelled, never deleted or smoothed.
7. The trend is a statement about the weeks actually observed; it is explicitly **not** statistically meaningful until consecutive weekly collections accumulate (today: 4 comparable series, one market — a direct consequence of the old hourly runs being 78% carried rows).

## 8. Open questions — ALL RESOLVED (Lead rulings, WC §3.3 A1–A3 + §3.4)

Nothing in this plan remains a live question. OQ-2 was resolved by A1 (§3.3); OQ-1, OQ-3, OQ-4, OQ-5 and OQ-6 were resolved by §3.4 and are mirrored below in §9. Implement §9; do not re-litigate these here.

## 9. Lead rulings (final)

Mirror of WC §3.4 (authoritative there). These are decisions, not options.

1. **A2 threshold.** `|pct| > 0.5` is the **fraction** form — >50% WoW. `0.005` (±0.5%) remains the up/down bucket boundary; do not conflate them. Only 3 moves qualify on current data.
2. **OQ-1 — `until`.** `weeklyTrend` defaults to the week currently selected in the 周次 picker, and the section is labelled with that week so the trend agrees with the matrix.
3. **OQ-3 — carried points (correction to my draft default).** `history()` KEEPS a carried row's price with `carried: true`; it must **not** be nulled. Only `cell().delta`/`percent` require the current and the immediately preceding priced point to be **both** real; `weeklyTrend` uses real points only.
4. **OQ-4 — channels.** No channel collapse; scope fields are filters (`variant: ALL` keeps the §3.2 lowest-real-price-per-week collapse).
5. **OQ-5 — week extent.** `weeks` and `points` cover the same list, starting at the first week with a computable median (current data: `2026-09-14`).
6. **OQ-6 — variant vs storage.** `variant` filters the record's variant; `storage` matches `specs.storage` and only drives spec-coverage exclusion (`excluded.missingSpec`).
7. **Merge precedence (pins §3.1).** Per `(country, model, channel, variant, week)`: real always beats carried; among real points the current week prefers `latest.json`, otherwise newest `collectedAt`, then lowest price; a carried row fills only a week with no real point and never feeds a delta or trend point.
8. **Baseline caution.** §5's pinned first-run trend numbers are a derived expectation — integrator and reviewer derive their own; a mismatch is a question for the Lead, not an automatic FAIL.
