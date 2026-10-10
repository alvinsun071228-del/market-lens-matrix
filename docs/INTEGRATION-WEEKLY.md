# Weekly Workstream — Integration Freeze Record (task-6)

Owner: `06-integrator-openscale-ds-v4-1-flash` (shared task **task-6**, claimed at revision 2 → completed at the revision recorded on the board).
Thinking level: **high** — the frozen numbers in `docs/WEEKLY-CONTRACT.md` §3.5 had to be re-derived from the shipped data rather than trusted from the builders' tests.
Date of record: 2026-10-11 (Asia/Shanghai).

Authority: [`docs/WEEKLY-CONTRACT.md`](WEEKLY-CONTRACT.md) (frozen, Lead-owned, **not edited by this task**) and [`docs/PLAN-WEEKLY.md`](PLAN-WEEKLY.md).

---

## 1. Freeze record

| Item | Value |
| --- | --- |
| HEAD at freeze | `4e95129 fix(collect): carry a blocked source's last verified price instead of losing the week` |
| Working tree | 7 modified + 7 untracked files, all intended by task-1…task-5 |
| Tracked diff | **1842 insertions · 103 deletions** |
| Branch / commits added by this task | none — the release candidate is the working tree, uncommitted, by design |
| Frozen contract edited? | **No.** `docs/WEEKLY-CONTRACT.md` untouched (mtime 2026-10-11 01:20, before this task started). |
| `public/data/history.json` regenerated? | **Yes, by the gate itself** (WC requires `node scripts/history.mjs` in the gate). Data content is byte-identical; only `generatedAt` advances. See §3.1. |
| Cross-cutting source edits made by this task | **None.** See §6. |
| Late changes from thread 05 during this task | **None.** `git diff --numstat` before the first gate run and after the last gate run are identical (§2). |

Requirement → artefact map (all five builder deliverables are present on the shared tree):

| Req | Frozen decision | Where it lives |
| --- | --- | --- |
| R1 每周一固定时间刷新 | cron `17 3 * * 1`, `COLLECT_CADENCE_MINUTES=10080`, `STALE_AFTER_MINUTES=11520`, `FX_STALE_AFTER_DAYS=7` | [`.github/workflows/collect.yml`](../.github/workflows/collect.yml), [`src/data.js`](../src/data.js), [`README.md`](../README.md) |
| R2 首行型号点击显示规格 | `<button aria-label="<model> 产品规格">` → `Drawer` titled `<model> · 产品规格` | [`src/main.jsx`](../src/main.jsx), [`public/data/specs.json`](../public/data/specs.json) |
| R3 七项筛选 | 市场/渠道/品牌/系列/屏幕尺寸/容量/电池 (7 distinct; 屏幕尺寸 interpreted once per WC §6) | [`src/main.jsx`](../src/main.jsx), [`src/data.js`](../src/data.js) |
| R4 本周价格变化趋势 + 趋势分析总结 | pure `weeklyTrend(scope)`, `connectNulls={false}`, A2 suspects, A3 可比样本不足 | [`src/data.js`](../src/data.js), [`src/main.jsx`](../src/main.jsx) |
| Pipeline (feeds R1/R4) | weekly real-observation aggregator | [`scripts/history.mjs`](../scripts/history.mjs), [`public/data/history.json`](../public/data/history.json) |
| Contract enforcement | additive validator checks for `history.json` + `specs.json` | [`scripts/validate.mjs`](../scripts/validate.mjs) |
| Tests | 22 tests, incl. 6 new UI tests | [`tests/matrix.spec.js`](../tests/matrix.spec.js), [`tests/ui-weekly.spec.js`](../tests/ui-weekly.spec.js) |

---

## 2. Per-file diff summary

`git diff --numstat` **before** the first gate run and **after** the last gate run (identical, so nothing was edited during integration):

```
8	4	.github/workflows/collect.yml
24	8	README.md
102	1	scripts/validate.mjs
507	32	src/data.js
536	43	src/main.jsx
280	11	src/styles.css
385	4	tests/matrix.spec.js
```

Totals: 1842 insertions, 103 deletions. New files (`wc -l`): `docs/PLAN-WEEKLY.md` 148, `docs/SPECS.md` 216, `docs/WEEKLY-CONTRACT.md` 343, `public/data/history.json` 2359, `public/data/specs.json` 442, `scripts/history.mjs` 205, `tests/ui-weekly.spec.js` 641.

| File | Δ | What the diff does | Verified by |
| --- | --- | --- | --- |
| `.github/workflows/collect.yml` | +8 −4 | cron `23 * * * *` → `17 3 * * 1` (+ weekly comment); new step `- name: Aggregate the weekly price history` / `run: node scripts/history.mjs` inserted **before** `Validate the data contract before committing`; collectedAt alarm `6h → 8×24h`, fx.asOf alarm `7×24h → 8×24h`; `mode !== "live"` and `verifiedProductCount === 0` failure guards kept. | Read of the diff; matches WC §1. |
| `README.md` | +24 −8 | Adds the `public/data/history.json` row + `data/history/<date>.json` row, a paragraph on the history rules, adds `node scripts/history.mjs` to the command list; §更新频率与时效性 rewritten hourly → weekly Monday 03:17 UTC (weekly snapshot, not real-time, no interpolation/backfill, 8-day CI alarm). | Diff read; no remaining "hourly" collection claim. |
| `scripts/validate.mjs` | +102 −1 | **Purely additive.** `isoWeekStart` plus a full `history.json` block (apiVersion `1.1`, ISO-Monday weeks, ascending + unique, one point per `country\|model\|channel\|variant\|week`, `state ∈ {live,promo}`, finite `price > 0`, `sourceId` + http(s) `sourceUrl` + ISO `collectedAt`, `brand`/`series` keys required but `null` allowed and never inferred) and a `specs.json` block (keys must be real model ids, typed fields, `confidence ∈ {official,retailer,unverified}`, `sources` http(s), a non-null field requires a source, unknown `missing` field names rejected). Only removed line is the old `OK:` message, replaced by an extended one. | `git diff -U0` reviewed line by line — **no existing check weakened or deleted** (WC §7). |
| `src/data.js` | +507 −32 | Cadence/schedule/staleness constants and `nextRefresh()`; `normalizeWeek`/`weekStart`/`weekBefore`/`isRealObservation`/`CARRIED_STATES`; `mergedRows()` + `preferRow()`; `applyHistoryPoints()` (live/promo, finite, `>0`; `brand`/`series` copied verbatim); `history()` per-week rows that keep the price and mark carried; `specOf`/`specValues`/`specsLoaded`; `inTrendScope`, `specVerdict`, `weeklyTrend()` with `TREND_FLAT_THRESHOLD=0.005`, `TREND_SUSPECT_THRESHOLD=0.5`, `TREND_DEFAULT_LIMIT=12`; per-file `.catch` into `dataInfo.errors` so a missing `specs.json` is non-fatal. | Full read (990 lines) + independent Node probe + §3.4. |
| `src/main.jsx` | +536 −43 | Seven `Select`s in one `section.filters`; header `<button aria-label="<model> 产品规格">`; spec `Drawer`; `section.trend` (`本周价格变化趋势` chart + `趋势分析总结`); recharts `connectNulls={false}` at lines 400 and 697; `trendScope.until = week`; `specFilterOn` line 1214 with the exclusion count line. | Read + §5 served-page verification. |
| `src/styles.css` | +280 −11 | Styling for the filter bar, model button, spec drawer, trend section, suspects list, chart legend. | Visual render via Playwright (chart `lines: 1`, `bars: 6`, non-empty text). |
| `tests/matrix.spec.js` | +385 −4 | Adds weekly-cadence, `weeklyTrend` median/index/up-down, variant-ALL collapse, brand-filter survival, mixed-case brand/series, thin-sample gaps, carried-rows-never-trend-points, A2 suspects, spec accessors/exclusions tests. Replaces the pre-existing red invariant `pricedCellCount >= ceil(liveRecords.length * 0.6)` (failing at HEAD: 76 real pairs vs 77 required) with *every live current-week country\|model pair renders a priced cell* — the Lead-approved fix recorded in WC. | `npx playwright test` — 22/22 pass. |
| `tests/ui-weekly.spec.js` | +641 (new) | 6 UI tests: seven filters visible + narrowing; R2 header button → drawer + Escape focus return; R4 index/sample/A2/A3; R3 missing `specs.json` degrades honestly; 本周可比样本不足; active brand scope keeps history-only ids. | Part of the 22/22 run. |
| `scripts/history.mjs` | +205 (new) | Standalone aggregator over `data/history/*.json` → `public/data/history.json`. `REAL_STATES = new Set(["live","promo"])`; drops non-real state, non-positive price and rows without identity/evidence; skips malformed snapshots with a warning. Has its **own local `weekStart` (line 43)** and does not import `src/data.js`, so it stays a dependency-free CI entrypoint. | Dry-run + real run + determinism proof (§3.1). |
| `public/data/history.json` | +2359 (new) | 5 weeks / 138 real points, apiVersion `1.1`, every point carrying `brand`/`series` verbatim. | Independent Python read (§4) + validator + probe. |
| `public/data/specs.json` | +442 (new) | 22 spec entries, exactly the 22 `models.json` ids; `confidence` 21 `official` + 1 `retailer`; every stated value backed by ≥1 source URL; no unknown `missing` field names. | Independent Python audit (§4.3) + validator. |
| `docs/*` | new | `WEEKLY-CONTRACT.md` (frozen), `PLAN-WEEKLY.md`, `SPECS.md` — builder/Lead documents, not edited here. | — |

---

## 3. Gate — exact commands and real results

The full WC §7 gate was run on the frozen tree, in order, after killing the manual dev server so Playwright had to start its own (proving the suite is self-contained).

### 3.1 `node scripts/history.mjs`

```
########## GATE 1/4: node scripts/history.mjs ##########
history: 34 snapshots read · 0 skipped · 6908 records scanned
  real observations: 1259 · merged duplicates: 1121
  dropped: 5420 non-real state · 229 non-positive price · 0 without identity/evidence
  weeks: 5 (2026-09-07 … 2026-10-05) · points: 138
  wrote /Users/alvin/.../public/data/history.json (74.0 KB)
EXIT=0
```

Regeneration is **expected** — the gate command is the generator. What matters is that it changed no data. Two consecutive runs on the same tree:

```
7034854aca2435e4a14218c36541262205147da5b297154a2d7ce8fd6540dbf9  /tmp/h_run1.json
b4feffa4577bcbc5a176d550795dd9d82f53b9e7bbfccd07a5076dc3181d728e  /tmp/h_run2.json
run1 generatedAt 2026-10-10T17:43:29.797Z | run2 generatedAt 2026-10-10T17:43:30.496Z
DATA IDENTICAL (weeks+points+apiVersion): True
```

The hashes differ and the data does not: the only moving part is `generatedAt`. The generator writes exactly one path (`OUTPUT_PATH = public/data/history.json`, line 36) and only reads `data/history` (lines 78/87), so the published weekly history is a pure function of the untouched snapshots — `git status --short data/` is empty.

Final `shasum -a 256 public/data/history.json`:
`b4feffa4577bcbc5a176d550795dd9d82f53b9e7bbfccd07a5076dc3181d728e` (138 points, 5 weeks).

**Disclosure: `public/data/history.json` was rewritten by the gate** — no real defect required it, and no data value changed. Hashes observed across this task: `b745fd24…` (before any run) → `8de022b9…` (first run) → `89ecefa0…` (after a determinism re-run) → `573ae676…` (gate run) → `b4feffa4…` (final). Every transition was `generatedAt` only.

### 3.2 `node scripts/validate.mjs`

```
########## GATE 2/4: node scripts/validate.mjs ##########
OK: contract v1.1 valid · 152 records · 127 live this week · 7 markets · 22 models · fx 2026-10-10 · history 5 weeks / 138 points · specs present
EXIT=0
```

### 3.3 `npm run build`

```
########## GATE 3/4: npm run build ##########
vite v6.4.3 building for production...
✓ 2168 modules transformed.
dist/index.html                   0.66 kB │ gzip:   0.39 kB
dist/assets/index-Boj82mEp.css   18.10 kB │ gzip:   4.46 kB
dist/assets/index-DOUNtuke.js    55.01 kB │ gzip:  18.64 kB
dist/assets/motion-CkYCjtGE.js   78.95 kB │ gzip:  30.96 kB
dist/assets/charts-JqDKf28v.js  521.41 kB │ gzip: 155.75 kB
(!) Some chunks are larger than 500 kB after minification. ...
✓ built in 10.61s
BUILD_EXIT=0
```

The only warning is the **pre-existing** >500 kB recharts chunk. `dist/data/` contains all seven artefacts, including the two new ones — `history.json` (75816 B) and `specs.json` (15229 B) — satisfying the PLAN §5 "the new artefacts must ship in the bundle" regression criterion.

### 3.4 `npx playwright test` (whole suite)

```
########## GATE 4/4: npx playwright test ##########
Running 22 tests using 2 workers
  ✓  1 tests/matrix.spec.js:38:1 › data contract v1.1 holds across the published files
  ✓  3 ... cell/history helpers carry forward honestly and keep gaps as gaps
  ✓  4 ... refresh promise: cadence constant, honest next-refresh clamping, staleness thresholds
  ✓  5 ... weekly cadence: Monday 03:17 UTC schedule, Monday-aware next refresh, 8-day staleness
  ✓  6 ... weeklyTrend: median, chained index and up/down counts over real ISO weeks
  ✓  7 ... weeklyTrend: variant ALL collapses by lowest real price; variant filters records
  ✓  8 ... weeklyTrend: an explicit brand filter does not silently kill the trend
  ✓  9 ... weeklyTrend: brand/series survive the history merge verbatim (mixed case)
  ✓ 10 ... weeklyTrend: thin samples stay gaps (null index) and set insufficient
  ✓ 11 ... weeklyTrend: carried rows are preserved by history() but never become trend points
  ✓ 12 ... weeklyTrend: extreme moves stay in the median and are surfaced as suspects (A2)
  ✓ 13 ... spec accessors and spec-filter exclusions
  ✓  2 tests/ui-weekly.spec.js:322:1 › seven filters are visible in one bar and each narrows the matrix
  ✓ 15 ... R2: header model button opens the spec drawer and Escape returns focus
  ✓ 14 ... dashboard renders config-driven markets, USD prices and freshness
  ✓ 16 ... R4: trend section renders index, per-week sample, A2 suspects and A3 concentration
  ✓ 17 ... alternate variant or channel availability is explicit
  ✓ 18 ... R3: missing specs.json degrades honestly with no invented options
  ✓ 20 ... R4: a thin sample says 本周可比样本不足 instead of inventing a trend
  ✓ 21 ... R4: an active brand scope keeps history-only ids in the trend
  ✓ 19 ... refresh button re-fetches in place and updates the last-checked timestamp
  ✓ 22 ... every visible cell's USD equals round(local × fx.rates[currency], 2)

  22 passed (18.9s)
PW_EXIT=0
```

### 3.5 Independent re-derivation of the frozen WC §3.5 numbers

Trusting the builders' tests would not be integration; the numbers were re-derived by importing `src/data.js` into plain Node against the real `public/data/*.json`. Result, matching WC §3.5 **exactly**:

```
COLLECT_CADENCE_MINUTES 10080 · STALE_AFTER_MINUTES 11520
COLLECT_SCHEDULE {"weekday":1,"hourUtc":3,"minuteUtc":17,"label":"每周一 03:17 UTC"}
cadenceShort "每周一" · cadenceLabel "每周一 03:17 UTC 自动采集"
nextRefresh {"at":"2026-10-12T03:17:00.000Z","late":false,"text":"预计下次刷新 2026/10/12 11:17:00"}

weeklyTrend({}) weeks: 2026-09-14 / 2026-09-21 / 2026-09-28 / 2026-10-05
  sample  3    4    4    4
  medianPct  0  -1.5635%  0  -7.4923%
  index  100.00  98.4365  98.4365  91.0614
  excluded {missingSpec:0,noSpec:0} · insufficient false · seriesCount 97
  markets [{id:"sa",sample:4}] · channels [{id:"retail",sample:4}]
summary.suspects (4):
  sa|A06|retail|all  4.2259 → 500      +11731.80%  (2026-10-05)
  sa|A06|retail|all  591.85 → 4.2259  -99.29%     (2026-09-28)
  sa|A16|retail|all  1715   → 579     -66.24%     (2026-10-05)
  sa|A57|retail|all  1000   → 1599    +59.90%     (2026-09-14)
```

`weeklyTrend({country:'sa',channel:'retail'})` returns the identical points and suspects with `seriesCount 10`, so the market/channel restriction is real, not cosmetic. `sa|A57 5G` (−18.2% WoW) is correctly **not** a suspect, confirming A2's `|pct| > 0.5` (fraction) threshold rather than a percentage threshold.

---

## 4. The kept implausible point (R4 honesty check)

The real data contains one implausible observation that must be **kept and labelled**, not removed:

`sa / A06 / retail / 128GB`, week `2026-09-28`, `4.2259 SAR`, `state: live`, `sourceId: amazon-sa-a06-128`.

### 4.1 It is present, unaltered, in the published file

An independent Python read of `public/data/history.json` (no `src/data.js` involved) shows the full series:

| week | price | state | sourceId |
| --- | --- | --- | --- |
| 2026-09-14 | 500 SAR | live | amazon-sa-a06-128 |
| 2026-09-21 | 591.85 SAR | live | amazon-sa-a06-128 |
| **2026-09-28** | **4.2259 SAR** | **live** | **amazon-sa-a06-128** |
| 2026-10-05 | 500 SAR | live | amazon-sa-a06-128 |

`brand` "Samsung" and `series` "Galaxy A" are copied verbatim. Nothing was dropped, interpolated, clamped or smoothed: `history("sa","A06","retail","128GB")` returns the row as
`{week:"2026-09-28", value:4.2259, state:"live", carried:false, effectiveDate:"2026-10-01", currency:"SAR", sourceId:"amazon-sa-a06-128", collectedAt:"2026-10-01T22:40:58.190Z"}`, and `cell("sa","A06","retail","128GB","2026-10-05")` propagates it into the delta rather than hiding it: `{value:500, previous:4.2259, delta:495.7741, percent:11731.79914337774}`.

The points below 100 in the whole file are only this one plus genuine low-denomination currencies (KWD/JOD/OMR, e.g. `kw A07S retail 64GB 42.9 KWD`, `jo A07 retail 128GB 70 JOD`) — no other kept outlier.

### 4.2 It is labelled 疑似异常，需核对来源 on the served page

`A06` and `A57` are **history-only ids**: they exist in `history.json` but not in `models.json` (22 ids, neither present), so they can never appear as matrix columns. Their only surface is the trend section, where the point is surfaced with the required label. Verbatim from the served page:

```
疑似异常，需核对来源（4 项，仍计入中位数，未删除也未平滑）：
  A06（4.23 SAR → 500 SAR，+11731.8%，2026-10-05）
  A06（591.85 SAR → 4.23 SAR，-99.3%，2026-09-28）
  A16（1,715 SAR → 579 SAR，-66.2%，2026-10-05）
  A57（1,000 SAR → 1,599 SAR，+59.9%，2026-09-14）
```

and in the summary body: `涨跌榜中有 2 项属于疑似异常（见下），请先核对来源再解读。` The label states the outliers **remain in the median**, which is the A2 rule — no silent trimming.

`4.23 SAR` is the UI's 2-decimal rendering of the real `4.2259`; the raw value is what is stored and what `validate.mjs` checks (`price` finite `> 0`), so no precision was traded away to make the number look better.

---

## 5. Served-page verification (`npm run dev`, 127.0.0.1:5173, real `public/data`)

Driven with Playwright against the running dev server, independent of the test suite. Full run after the final gate:

```
{"headerBtn":"Galaxy A07 产品规格",
 "filters":"市场/渠道/品牌/系列/屏幕尺寸/容量/电池",
 "weeks":4,"suspect":true,"a06":true,"conc":true}
PROBLEMS: (none)
```

### 5.1 R2 — header model click opens the spec drawer

```
clicked aria-label: Galaxy A07 产品规格
drawer.open: true
drawer.title: Galaxy A07 · 产品规格
drawer.body: Galaxy A07 · 产品规格 型号 A07 · Samsung · 数据置信度：官方 · 未核实字段显示「暂无数据」。
  屏幕尺寸 6.7" 6.7" PLS LCD HD+   电池容量 5000 mAh   容量（存储） 64GB / 128GB
  运行内存 4 GB   芯片 MediaTek G99   发布时间 暂无数据
  来源链接 www.samsung.com/sa_en/.../galaxy-a07-black-64gb-sm-a075fzkdmea/ (×3)
focus returned to the model button: Galaxy A07 产品规格
```

All contract fields (屏幕尺寸/电池容量/容量（存储）/运行内存/芯片/发布时间/来源链接) render; the unknown field shows `暂无数据`; the element is a real `<button>` with a keyboard-reachable `aria-label`, and Escape returns focus to it.

### 5.2 R3 — the filter bar

Seven `select`s render in one bar (`市场` 8 options · `渠道` 3 · `品牌` 2 · `系列` 3 · `屏幕尺寸` 5 · `容量` 7 · `电池` 7), plus a search box and a reset button. Each filter applied alone from reset (baseline: `th=22 tr=7 td=76 priced=76`):

| Filter | Value | Columns | Priced cells | Narrowed |
| --- | --- | --- | --- | --- |
| 市场 | `sa` | 22 → 22 | 76 → 16 | rows 7 → 1 |
| 渠道 | `official` | 22 → 22 | 76 → 44 | yes |
| 系列 | `Galaxy S` | 22 → 10 | 76 → 29 | yes |
| 屏幕尺寸 | `6.7"` | 22 → 17 | 76 → 62 | yes |
| 容量 | `256GB` | 22 → 17 | 76 → 35 | yes |
| 电池 | `5000 mAh` | 22 → 12 | 76 → 53 | yes |
| 品牌 | `samsung` | 22 → 22 | 76 → 76 | **not demonstrable — see §7.1** |

Spec-filter value sets come only from `specValues()`, i.e. only values actually present in `specs.json` — no invented options. With a spec filter active, the exclusion line renders:

```
规格筛选排除了 0 个缺少规格数据的型号，另有 2 个型号尚无规格条目。
```

(the 2 are the history-only ids A06/A57, which legitimately have no spec entry.)

### 5.3 R4 — 本周价格变化趋势 + 趋势分析总结

```
heading: 本周价格变化趋势          badge: 截至 2026-10-05
scope:   范围：全部市场 · 全部渠道 · 品牌：Samsung · 全部系列 · 全部容量 · 全部屏幕尺寸 · 全部电池容量
         · 数据为每周快照（每周一 03:17 UTC 自动采集）· 非实时行情 · 缺口不插值
weeks:   2026-09-14 指数 100.00 上涨 1 · 下跌 0 可比样本 3
         2026-09-21 指数 98.44  上涨 1 · 下跌 2 可比样本 4
         2026-09-28 指数 98.44  上涨 0 · 下跌 1 可比样本 4
         2026-10-05 指数 91.06  上涨 2 · 下跌 2 可比样本 4
legend:  价格指数（左轴，基准 100） 上涨家数（右轴） 下跌家数（右轴）
         指数缺口表示该周可比样本不足，均不连线、不插值
svg:     1 line curve, 6 bar rectangles
```

Four real ISO weeks, the frozen index path 100 / 98.44 / 98.44 / 91.06, per-week comparable sample counts, the A2 suspect list, and the A3 concentration note `样本仅来自沙特阿拉伯 · 零售渠道。可比样本越集中，结论越不具代表性。` The summary also states plainly that the data is a weekly snapshot, not a live quote, and that gaps are not interpolated.

**Honest insufficient state** (verified by selecting the first non-`all` screen size, `6.2"`), where a spec bucket leaves fewer than 3 comparable series:

```
当前筛选范围内没有可比的两周真实记录，因此不显示价格指数（不插值、不推测）。
本周可比样本不足，暂不判断趋势。当前范围内没有任何一周达到 3 个可比系列，中位数与价格指数均为缺口（不插值、不推测）。
规格筛选排除了 0 个缺少规格数据的型号，另有 2 个型号尚无规格条目。
```

`path.recharts-line-curve` count is 0 in that state — the chart does not fake a line across gaps, consistent with `connectNulls={false}` at `src/main.jsx:400` and `src/main.jsx:697`.

### 5.4 Page health

Across every interaction above (filters, drawer open/Escape, trend scoping, matrix drill-down) the captured `pageerror`, `console.error` and `requestfailed` lists were **empty** — `(none)` in every run.

---

## 6. Cross-cutting edits made by this task

**None.** No source, test, workflow, config or data file was edited by task-6. The only filesystem write was the gate-mandated `node scripts/history.mjs` rewriting `public/data/history.json`, disclosed in §3.1, with data content proven identical.

`git diff --numstat` is byte-for-byte the same before the first gate run and after the last one, and `git status --short` lists exactly the 14 expected paths — so the late finish of thread 05 introduced no additional change, and nothing regressed during integration.

WC §7 compliance, checked directly rather than assumed:

- **No invented price or spec** — `specs.json` audit: 22/22 entries keyed to real model ids, every stated value carries ≥1 http(s) source, `confidence` limited to `official`/`retailer`/`unverified`; the one non-official entry is marked `retailer`.
- **No interpolation** — `connectNulls={false}` at lines 400 and 697; `index`/`medianPct` are `null` when a week has fewer than 3 comparable series; the insufficient copy says so explicitly.
- **Gaps stay gaps** — an under-threshold week renders as a gap and the chart breaks rather than bridges.
- **Carried rows never seed trend points** — `weeklyTrend` consumes only `isRealObservation` rows; `REAL_STATES = new Set(["live","promo"])` in `scripts/history.mjs` and `CARRIED_STATES` in `src/data.js:208`. Covered by `tests/matrix.spec.js:434`.
- **No hardcoded per-country/model runtime lists** — grepping `src/` for country/model/city literals returns nothing; markets, models, channels and brands all come from `public/data/*.json`. (`scripts/collect.mjs` and `scripts/coverage.mjs` contain Amazon/retailer-specific parser code, but that is pre-existing source-adapter logic, untouched by this workstream.)
- **No validator check weakened** — `scripts/validate.mjs` is purely additive (§2); the only changed line is the `OK:` summary string.

---

## 7. Residual uncertainty and open items for the Lead

1. **R3 品牌 is a no-op on the current configuration.** `models.json` configures exactly one brand (`brandId: "samsung"`), so the 品牌 select offers `全部品牌 / Samsung` and selecting either yields the same 22 columns — narrowing is not demonstrable with real data, though the control renders, is wired through `visibleModels`, and has test coverage. This is a **data-configuration** consequence, not a code defect, and no fix was made because inventing a second brand would violate WC §7. *Lead decision requested:* accept as-is, or expand `models.json`/`markets.json` with real multi-brand data (out of this task's scope).
2. **Spec-filtered views of R4 fall back to the insufficient state.** On the shipped 4-series comparison set, any spec bucket (`6.2"`, `5000 mAh`, `128GB`, …) leaves fewer than 3 comparable series, so the trend chart is empty and the section honestly says 本周可比样本不足. That is contract-correct but means the R4 chart only populates for non-spec scopes on today's data. It will self-resolve as the weekly history accumulates comparable series; flagging it so it is not mistaken for a bug.
3. **The implausible point's only surface is the trend list.** Because A06/A57 are absent from `models.json`, the 4.2259 SAR observation can never be rendered as a matrix cell or a matrix drill-down — the trend suspects list is the single place a user can see it. It *is* there, labelled 疑似异常，需核对来源, and it stays in the median. Whether the customer wants an additional per-point venue is a product question, not an integration defect.
4. **`public/data/history.json` is not run-stable byte-wise.** Its `generatedAt` advances on every gate run, so any commit of this file will show a one-line diff. Data is deterministic (proven in §3.1); only the timestamp moves.
5. **Cosmetic nit in the R2 drawer.** The 屏幕尺寸 row renders the bucket and the display note side by side, producing `6.7" 6.7" PLS LCD HD+`. It is redundant but not wrong, and not contract-breaking — deliberately **not** fixed, to avoid an unrequested edit inside the UI thread's file after its gate had passed.
6. **Wall-clock coupling in the 周次 default.** The matrix week defaults to the last of the locally generated week list, which today coincides with the feed's current week (`2026-10-05`). This is pre-existing behaviour, unchanged by this workstream; noted only because it is the kind of thing that would surface as an odd default week in a future run.

---

## 8. Verdict

Release candidate **GO** for the weekly workstream: all four requirements are implemented, the full WC §7 gate passes on the frozen tree (1842/103 diff, `EXIT=0` on `history.mjs` + `validate.mjs` + `npm run build`, 22/22 Playwright), the three user-facing behaviours were verified on the served site against the real `public/data`, no pageerror was observed, the frozen contract was not edited, no validator check was weakened, and the sanctioned implausible observation is kept and labelled 疑似异常，需核对来源 rather than hidden. Item **§7.1 (single-brand configuration)** is the one point that needs a Lead decision before this can be called fully closed against R3's 品牌 filter.

---

## 9. Lead addendum (post-review, final assembly)

Author: **Lead**. Amends §7.5 and §8's arithmetic after the reviewer flagged them as stale (finding F1 in docs/REVIEW-WEEKLY.md).

1. **Post-freeze write — attributed.** The R2 屏幕尺寸 duplication in §7.5 **was** subsequently fixed, at the Lead's instruction, by the file's owner: thread `05-ui` (task-4, reopened to revision 10), in `src/main.jsx:184-192` (the `display` note now strips a leading size token) plus matching assertions in `tests/ui-weekly.spec.js`. The reviewer confirmed every other file sits inside a declared scope; this was the only unattributed change, and it is attributed here.
2. **Corrected arithmetic.** The frozen tree is **1850 insertions / 103 deletions** (not 1842/103), with `src/main.jsx` **544/43** and `tests/ui-weekly.spec.js` **650 lines**. §6's per-file counts and §8's "(1842/103 diff)" are superseded by this line. The gates were re-run after the fix and still pass: 22/22 Playwright, `validate.mjs` EXIT=0, `npm run build` EXIT=0 — plus the Lead's own independent gate run.
3. **§7.1 (品牌 no-op) — ACCEPT AS-IS.** The filter is implemented, visible, wired and tested; the configuration ships exactly one brand, so narrowing is not observable. Populating a second brand would require fabricated data, which WC §7 forbids. R3 is satisfied by a working, honest filter over the configured data.
4. **§7.3 — ACCEPT.** Keeping the 4.2259 SAR observation inside the median while labelling it 疑似异常，需核对来源 is the contract-correct behaviour; no extra per-point surface is in scope.
5. **§7.5 — SUPERSEDED** by item 1.
6. **Reviewer F3 (12-week window) — no change.** WC §3.2 fixes `limit = 12` as the default window, so anchoring the index at 100 on the window's first computable week is the faithful reading. Revisit only if a longer window is requested.
7. **Reviewer F2 (board hygiene) — acknowledged.** task-5's board text and write scope disagreed about `public/data/history.json`; that artifact is generated only by its own script and was never hand-edited.

Closing state: reviewer verdict **PASS**, Lead gate **PASS**, deployment **not performed** (no prior Vercel deployment exists).
