# REVIEW-WEEKLY — independent review of the integrated weekly result (task-7)

Reviewer: `07-reviewer-openscale-ds-v4-1-flash` (shared task **task-7**, claimed at revision 2 → completed).
Thinking level: **medium-high** — the verdict gates delivery and the WC §3.5 numbers had to be re-derived by hand
plus four gates re-run independently, so a low level would rubber-stamp and a higher one would burn budget on a
frozen, well-scoped spec.
Date: 2026-10-11 (Asia/Shanghai). Reviewed tree: working tree, HEAD `4e95129`, uncommitted (14 paths).
Spec reviewed against: [`docs/WEEKLY-CONTRACT.md`](WEEKLY-CONTRACT.md) (frozen; **not edited by me**).

Method: every claim below was reproduced from the working tree and the served site by this thread. Nothing is
copied from [`docs/INTEGRATION-WEEKLY.md`](INTEGRATION-WEEKLY.md) or from the builders' summaries except where I
explicitly say "compare with".

---

VERDICT: PASS

No blocking defect. All four requirements are implemented and independently reproduced; the full gate is green on
my own re-runs; no fabricated price or spec was found; WC §7 anti-fabrication holds; the two disclosures are honest.
The findings below are non-blocking (one of them is a real documentation defect in the freeze record).

---

## 1. Gates — my own re-run output

### 1.1 `node scripts/history.mjs --dry-run`

```
history: 34 snapshots read · 0 skipped · 6908 records scanned
  real observations: 1259 · merged duplicates: 1121
  dropped: 5420 non-real state · 229 non-positive price · 0 without identity/evidence
  weeks: 5 (2026-09-07 … 2026-10-05) · points: 138
  dry run: /Users/alvin/.../public/data/history.json not written
EXIT=0
```

`--dry-run` is honoured at `scripts/history.mjs:200`; `writeFileSync` (`:203`) is unreachable in that branch. The
file was **not** written: `shasum -a 256 public/data/history.json` = `b4feffa4…1d728e`, byte-identical before and
after my run (and identical to the hash the freeze record claims at §3.1). My write scope was respected.

### 1.2 `node scripts/validate.mjs`

```
OK: contract v1.1 valid · 152 records · 127 live this week · 7 markets · 22 models · fx 2026-10-10 · history 5 weeks / 138 points · specs present
EXIT=0
```

### 1.3 `npm run build`

```
vite v6.4.3 building for production...
✓ 2168 modules transformed.
dist/index.html                   0.66 kB │ gzip:   0.39 kB
dist/assets/index-Boj82mEp.css   18.10 kB │ gzip:   4.46 kB
dist/assets/index-BnFOU4Es.js    55.09 kB │ gzip:  18.68 kB
dist/assets/motion-CkYCjtGE.js   78.95 kB │ gzip:  30.96 kB
dist/assets/charts-JqDKf28v.js  521.41 kB │ gzip: 155.75 kB
(!) Some chunks are larger than 500 kB after minification. …   ← pre-existing recharts chunk warning
✓ built in 5.07s
BUILD_EXIT=0
```

`dist/data/` contains all seven artefacts including `history.json` (75816 B) and `specs.json` (15229 B), so the new
artefacts do ship. (My JS chunk hash differs from the freeze record's `index-DOUNtuke.js`; expected — see F1.)

### 1.4 `npx playwright test` — run twice, deliberately

**Run A — reused the integrator's dev server.** Port 5173 was already LISTENing (PID 3982, `vite --host 127.0.0.1
--port 5173 --strictPort`), so `playwright.config.js`'s `reuseExistingServer: !process.env.CI` took effect:

```
Running 22 tests using 2 workers
… ✓ 22 tests …
22 passed (14.8s)   PW_EXIT=0
```

**Run B — I killed PID 3982 first, to prove the suite is self-contained.** `PORT_5173_FREE` confirmed, then
Playwright started its own webServer:

```
[WebServer] (node:9138) Warning: 'NO_COLOR' env is ignored …
Running 22 tests using 2 workers
… ✓ 22 tests (same 22) …
22 passed (15.8s)   PW_EXIT=0
after run: PORT_5173_FREE_AFTER
```

Both runs green, so the result does not depend on a pre-existing server. I then started my own dev server for §2.
For the record: all 22 tests pass, and the two runs agree on the test set.

---

## 2. R1–R4 against code and served site

Served-site evidence was collected by this thread with Playwright against `127.0.0.1:5173` serving the **real**
`public/data`. `pageerror`, `console.error` and `requestfailed` were **empty** across every interaction below.

### R1 — 每周一固定时间刷新 ✅

| Check | Result |
|---|---|
| `cron` | `.github/workflows/collect.yml:7` = `"17 3 * * 1"`; `workflow_dispatch` and `concurrency` kept |
| history step before validation | `collect.yml:41` `Aggregate the weekly price history` precedes `Validate the data contract` |
| 8-day thresholds | `collect.yml:58` collectedAt, `:59` fx.asOf, both `> 8 * 24 * 60 * 60 * 1000`; `mode !== live` and `verifiedProductCount === 0` guards kept |
| client constants | `COLLECT_CADENCE_MINUTES` 10080 · `STALE_AFTER_MINUTES` 11520 · `FX_STALE_AFTER_DAYS` 7 |
| `COLLECT_SCHEDULE` | `{"weekday":1,"hourUtc":3,"minuteUtc":17,"label":"每周一 03:17 UTC"}` |
| `cadenceShort()` / `cadenceLabel()` | `"每周一"` / `"每周一 03:17 UTC 自动采集"` |
| `nextRefresh()` (real feed) | `{"at":"2026-10-12T03:17:00.000Z","late":false,"text":"预计下次刷新 2026/10/12 11:17:00"}` |
| served banner | contains `每周一 03:17 UTC 自动采集`; `每小时` appears **nowhere** on the page |
| README | `README.md:70-77` weekly snapshot, `:88` 8-day alarms; no remaining hourly collection claim |

Late-aware copy (`刷新已延迟 · 距上次采集已超过 1 周`) is unreachable on today's feed (not yet late) and is covered
by `tests/matrix.spec.js:141`-area assertions; I read the branch at `src/data.js:931-938` and it is honest — it
compares against the next scheduled run, not a projected future.

### R2 — 首行点击产品型号显示产品规格 ✅

- `src/main.jsx:1264-1272` — the matrix header model name is a real `<button aria-label="<model> 产品规格">`.
- Served: `aria-label` = `"Galaxy A07 产品规格"`; **Enter** and **Space** both open the drawer; Escape closes it and
  focus returns to that exact button (`document.activeElement.aria-label` === the button's label).
- Drawer title = `Galaxy A07 · 产品规格` (`src/main.jsx:236`); all seven contract fields render
  (`屏幕尺寸 / 电池容量 / 容量（存储）/ 运行内存 / 芯片 / 发布时间 / 来源链接`); the unknown field shows `暂无数据`
  (`发布时间` for A07).
- No-spec-entry branch exists and is honest, with no invented rows: `src/main.jsx:240-242`
  (`… 暂无已核实的规格数据（specs.json 中没有该型号的条目）。为避免编造，本页不显示任何推测值。`).

### R3 — seven filters in one bar ✅

One `section.filters` (`src/main.jsx:1149-1221`) exposes exactly seven selects — `市场(8) 渠道(3) 品牌(2)
系列(3) 屏幕尺寸(5) 容量(7) 电池(7)` options — plus search and reset. Baseline `cols=22 rows=7 priced=76`.
Each filter applied alone from reset:

| Filter | Value | Cols | Priced | Narrowed |
|---|---|---|---|---|
| 市场 | `sa` | 22 → 22 | 76 → 16 | rows 7 → 1 |
| 渠道 | `official` | 22 → 22 | 76 → 44 | yes |
| 系列 | `Galaxy S` | 22 → 10 | 76 → 29 | yes |
| 屏幕尺寸 | `6.7"` | 22 → 17 | 76 → 62 | yes |
| 容量 | `256GB` | 22 → 17 | 76 → 35 | yes |
| 电池 | `5000 mAh` | 22 → 12 | 76 → 53 | yes |
| 品牌 | `samsung` | 22 → 22 | 76 → 76 | **no-op — settled, see §6** |

This is a deliberate reproduction of the integrator's §5.2 table; **every cell matches exactly**, so that table is
not fabricated. Spec-filter options come only from `specValues()`; I verified programmatically that every offered
`screenInches` / `batteryMah` / `storage` value exists in `specs.json` — no invented options.

Exclusion count is honest. With a spec filter active the page says
`0 个型号因缺少规格数据被排除，另有 2 个型号尚无规格条目（按当前筛选范围统计）。其余未显示的型号是规格值与筛选不符，不是缺数据。`
(`src/main.jsx:1222-1228`) and the trend section repeats it (`:1224`). `0` is truthful — no in-scope model has a
spec entry that *lacks* the filtered field — and `2` is the real count of spec-less history-only ids (A06/A57).
The line explicitly distinguishes "no data" from "value does not match", which is exactly the honesty WC §5 asks for.

### R4 — 本周价格变化趋势 + 趋势分析总结 ✅

- Section exists after matrix/signals: served DOM order `["filters","matrix-summary","signals","trend"]`.
- Heading `本周价格变化趋势`, badge `截至 2026-10-05`, scope line naming every filter + cadence + `非实时行情 · 缺口不插值`.
- Chart: `1` `path.recharts-line-curve` + `6` bar rectangles; `connectNulls={false}` at `src/main.jsx:408` and `:705`.
- `趋势分析总结`: 可比样本 4 项 · 上涨 2 · 下跌 2 · 持平 0 · 中位周变动 -7.5% · 最近一周指数 91.06 · 基准 2026-09-14 的 100.
- A2 suspects rendered as `疑似异常，需核对来源（4 项，仍计入中位数，未删除也未平滑）`, including the two A06 moves.
- A3 concentration `样本仅来自沙特阿拉伯 · 零售渠道` when tripped.
- FX honesty: `指数由各系列「同币种」的周环比中位数链式生成，不跨币种换算` — the index is unitless, so no currency
  can be mixed; the only currency tokens in the section are inside same-series same-currency suspect pairs.
- **`可比样本不足` state reproduced**: selecting `屏幕尺寸 = 6.2"` yields `0` line curves and the copy
  `本周可比样本不足，暂不判断趋势。… 中位数与价格指数均为缺口（不插值、不推测）` — the chart does not fake a line.
- OQ-1 verified on the served page: changing the 周次 picker to `2026-09-28` moves the trend badge to `截至 2026-09-28`
  and the section no longer mentions `2026-10-05` (`trendScope.until = week`, `src/main.jsx:892-907`).
- Regressions preserved: matrix, `section.signals`, freshness banner, week picker, CSV export, search, reset all present.

---

## 3. WC §3.5 re-derivation (my own numbers, not the doc's)

I imported the shipped `src/data.js` into plain Node against the published `public/data/*.json`:

| quantity | expected (§3.5) | mine | |
|---|---|---|---|
| `sample` | 3 / 4 / 4 / 4 | `3/4/4/4` | MATCH |
| `medianPct` | 0 / −1.5635% / 0 / −7.4923% | `0 / -1.5635% / 0 / -7.4923%` | MATCH |
| `index` | 100 / 98.4365 / 98.4365 / 91.0614 | `100 / 98.4365 / 98.4365 / 91.0614` | MATCH |
| `suspects` | 4 | 4 | MATCH |
| `insufficient` | false | false | MATCH |

Also reproduced: `weeks = 2026-09-14/21/28, 2026-10-05`; `seriesCount 97`; `excluded {missingSpec:0,noSpec:0}`;
`markets [{sa,4}]`; `channels [{retail,4}]`; `weeklyTrend({country:'sa',channel:'retail'})` → identical points with
`seriesCount 10`. **`sa|A57 5G` −18.2124% is NOT a suspect**, confirming A2 uses the fraction threshold
`|pct| > 0.5` and not a percentage threshold. I did not fail on the superseded PLAN-WEEKLY §5 baseline.

---

## 4. Fabrication audit (WC §7)

- **No invented price.** `public/data/history.json` is a pure function of the frozen snapshots: I wrote an
  **independent** aggregator (my own `weekStart`, dedupe and evidence rules; it does **not** import
  `scripts/history.mjs`) and diffed it against the published file — `138` points, `0` points only in mine,
  `0` only in the published file, `0` price mismatches, identical 5 weeks. Top-level keys are exactly
  `apiVersion, generatedAt, weeks, points`, so **only `generatedAt` is time-dependent** (disclosure (a) confirmed).
- **No invented spec.** `specs.json` has exactly the 22 `models.json` ids; 56 source entries / 52 distinct, every
  entry ≥1 `http(s)` source; `confidence` = 21 `official` + 1 `retailer`; `missing` names are real field names only.
  I independently reproduced [`docs/SPECS.md`](SPECS.md)'s coverage arithmetic **exactly**: 154 slots, 136 filled
  (88.3%), 12/22 models complete, 52 distinct URLs (50 samsung/news.samsung + 2 collected-record URLs).
- **No interpolation.** `connectNulls={false}` at `src/main.jsx:408` and `:705`; `medianPct`/`index` are `null` when
  a week has `< 3` comparables (`src/data.js:768`); the insufficient copy states it explicitly.
- **Gaps stay gaps.** Verified live: `path.recharts-line-curve` count is `0` in the 6.2" insufficient state.
- **Carried rows never seed trend points or deltas.** Conclusive injection test: I pushed a `state:"missing"`,
  `price:1` (deliberately the lowest price) row for **every** existing series/week — 143 rows — into the live feed
  and called `weeklyTrend`: the payload was **bit-identical** to the un-injected run. `cell()` computes `delta`
  only when the current and immediately-preceding week are both `isRealObservation` (`src/data.js:520-522`).
- **Nothing hardcoded per country/model in `src/`.** Greps for bare country-id and model-name literals return
  nothing; markets/models/brands/channels all come from `public/data/*.json`. The one country-keyed map,
  `FLAG_EMOJI` (`src/data.js:411-413`), is a display fallback containing no prices or specs.
- **`validate.mjs` only added, never weakened.** `git diff -U0 scripts/validate.mjs` has exactly **one** removed
  line — the old `OK:` summary string (`scripts/validate.mjs:253`) — plus additive `history.json` (`:143-191`) and
  `specs.json` (`:193-247`) blocks.
- **Anti-fabrication copy.** `涨跌榜中有 2 项属于疑似异常（见下），请先核对来源再解读。` and the A2 list header state
  the outliers stay in the median.

### 4.1 The kept implausible point — disclosure (b) confirmed

An independent read of `public/data/history.json`:

| week | price | state | sourceId |
|---|---|---|---|
| 2026-09-14 | 500 SAR | live | amazon-sa-a06-128 |
| 2026-09-21 | 591.85 SAR | live | amazon-sa-a06-128 |
| **2026-09-28** | **4.2259 SAR** | **live** | **amazon-sa-a06-128** |
| 2026-10-05 | 500 SAR | live | amazon-sa-a06-128 |

`brand: "Samsung"` and `series: "Galaxy A"` copied verbatim. The value is raw `4.2259`, not rounded or clamped;
the served page renders it inside `疑似异常，需核对来源（4 项，仍计入中位数，未删除也未平滑）` and `cell()` propagates
it into the delta (`percent 11731.799…`) rather than hiding it. It is **kept and labelled**, not dropped or smoothed.
Points below 100 in the whole file are this one plus genuine low-denomination KWD/JOD/OMR listings (verified).

---

## 5. Single-writer discipline

Declared scopes (task board): task-1 `docs/PLAN-WEEKLY.md`; task-2 `public/data/specs.json` + `docs/SPECS.md`;
task-3 `src/data.js` + `tests/matrix.spec.js`; task-4 `src/main.jsx` + `src/styles.css` + `tests/ui-weekly.spec.js`;
task-5 `scripts/history.mjs` + `scripts/validate.mjs` + `.github/workflows/collect.yml` + `README.md` +
`public/data/history.json`; task-6 `docs/INTEGRATION-WEEKLY.md`; task-7 `docs/REVIEW-WEEKLY.md`.

**Every file I inspected sits inside a declared scope. I found no write by a thread outside its own scope.**
The task-6 "any path" authority was exercised only to the extent of rewriting `public/data/history.json` via the
gate (disclosed in its own §3.1; I confirmed the data is unchanged apart from `generatedAt`).

One write is **unattributed and post-freeze** (F1): `src/main.jsx` and `tests/ui-weekly.spec.js` were modified
*after* `docs/INTEGRATION-WEEKLY.md` was written. Both files belong to task-4's scope and are also within task-6's
"any path" authority, so the tree alone **cannot** distinguish who wrote them; I am not inventing an attribution.
`git status --short` still lists exactly the 14 expected paths, so no new file appeared.

---

## 6. Lead decisions treated as settled (NOT findings)

WC §3.3 A1–A3; §3.4 rulings (A2 fraction form, OQ-1 `until`, OQ-3 carried-row correction, OQ-4 no channel collapse,
OQ-5 week extent, OQ-6 variant vs storage, merge precedence); §3.5 baseline/suspects/test-fix rulings; WC §6 (R3
lists 屏幕尺寸 twice → seven distinct filters, **no** invented replacement field — restated at
`docs/PLAN-WEEKLY.md:119-121` and recorded at `docs/INTEGRATION-WEEKLY.md:30`, so it is disclosed, not silently
guessed); and the accepted limitation that 品牌 cannot narrow with exactly one configured brand
(`src/main.jsx:1178` maps the single `brands` entry; inventing a second brand would violate §7). The
`pricedCellCount >= pricedPairs.size` replacement at `tests/matrix.spec.js:596-599` is the approved fix, not a
weakening — the only other removed assertions there are the contract-mandated cadence-threshold updates.

---

## 7. Findings, by severity

### Blocking
**None.**

### F1 — MEDIUM (non-blocking, documentation): the freeze record is contradicted by the shipped tree

`docs/INTEGRATION-WEEKLY.md` describes a tree that no longer exists.

1. **§7.5 is factually inverted.** `docs/INTEGRATION-WEEKLY.md:332` states the R2 drawer 屏幕尺寸 duplication is
   `deliberately **not** fixed`. It **is** fixed on the shipped tree: `src/main.jsx:187-192` adds a `note` that
   strips the duplicated leading size token.
   *Repro:* `sed -n '332p' docs/INTEGRATION-WEEKLY.md` vs `sed -n '187,192p' src/main.jsx`; on the served page the
   屏幕尺寸 row now reads `6.7"` + `PLS LCD HD+` (one size), not `6.7" 6.7" PLS LCD HD+`.
2. **§5.1 quotes the pre-fix rendering as served-page evidence.** `docs/INTEGRATION-WEEKLY.md:246` records
   `屏幕尺寸 6.7" 6.7" PLS LCD HD+`.
3. **The headline diff arithmetic understates the tree.** `docs/INTEGRATION-WEEKLY.md:17` says
   `1842 insertions · 103 deletions`; `:47` records `536 43 src/main.jsx`; `:52`/`:63` record
   `tests/ui-weekly.spec.js` as 641 lines. Current `git diff --numstat` gives **1850/103**, with `src/main.jsx`
   **544/43** (+8) and `tests/ui-weekly.spec.js` **650** lines (+9). Consequently `:309-311` ("Cross-cutting edits made
   by this task: **None**") and `:313` ("`git diff --numstat` is byte-for-byte the same before the first gate run
   and after the last one") do not hold for the reviewed tree. (The 14-path `git status` claim does still hold.)
   *Repro:* `git diff --numstat` vs the block quoted at `docs/INTEGRATION-WEEKLY.md:42-50`.

**Why this does not block:** the underlying change is a **correct improvement**, verified independently —
I replicated the shipped strip over all 22 real `display` strings and every one begins with
`${screenInches}"`, the strip leaves the panel detail intact (`6.7" PLS LCD HD+` → value `6.7"`, note
`PLS LCD HD+`), and **0** cases were lossy or suspicious. The new assertions
`tests/ui-weekly.spec.js:432` and `:453` prove the size appears exactly once, on fixtures, and all 22 tests pass on
the post-fix tree. So the product is good; the **record** is stale and must be corrected or annotated before it is
cited as freeze evidence. **Required:** amend §1/§2/§5.1/§6/§7.5 of `docs/INTEGRATION-WEEKLY.md`, and have the Lead
attribute the post-freeze write.

### F2 — LOW (non-blocking, board metadata): task-5 scope is self-contradictory

`task-5`'s description says `MUST NOT EDIT: … public/data/**`, while its structured `writeScopes` includes
`public/data/history.json` — which is that task's own required deliverable. The `writeScopes` reading is correct;
the prose line is wrong. Board hygiene only, no code impact.

### F3 — LOW (non-blocking, forward-looking): index re-bases to the window start once history exceeds `limit`

`src/data.js:777` slices `points` to the last `limit` (12) **before** `:786` bases the index at 100, so with more
than 12 weeks the index anchor moves to the window start rather than staying at the first week with a computable
median (OQ-5's wording). This is inert today (4 weeks < 12) and is a defensible rolling-window reading, but it will
become visible when the weekly history grows past 12 weeks. Flagging for the Lead so it is a decision, not a
surprise. *Not reproducible on today's data* — stated as an interpretation question, not a defect.

### F4 — INFO: carried-row honesty is fixture-covered only on today's feed

`public/data/latest.json` currently contains **0** rows with `state ∈ {missing, invalid, unavailable}`, so on the
shipped data the "carried rows never seed a trend point/delta" rule has no live instance. I verified the code path
conclusively by injection (see §4), and it is covered by `tests/matrix.spec.js` fixtures. No action needed; recorded
so the rule is not assumed to be exercised by real data.

### F5 — INFO: review limitation on `specs.json` source URLs

I could not re-fetch the recorded source URLs to confirm HTTP 200: `web_fetch` refused
`www.samsung.com` ("resolves to a non-public IP address"), the same limitation
[`docs/SPECS.md`](SPECS.md) §2.2 documents. I verified everything structurally verifiable (key set, per-field typing,
**every** non-null entry having ≥1 `http(s)` source, confidence enum, `missing` names, and SPECS.md's coverage
arithmetic to the digit). Per-value URL resolution is therefore attested by the researcher's record, not re-proven
by me.

---

## 8. Disclosures — both honest

- **(a) `public/data/history.json` regenerated by the gate, data unchanged apart from `generatedAt`** — CONFIRMED.
  My independent aggregator reproduces the published 138 points / 5 weeks with 0 discrepancies, the key set is
  `{apiVersion, generatedAt, weeks, points}`, `data/` is clean in `git status --short`, and `--dry-run` writes
  nothing (`b4feffa4…` before and after).
- **(b) the implausible `sa/A06/retail/128GB` week `2026-09-28` = `4.2259 SAR` (sourceId `amazon-sa-a06-128`) is
  kept and labelled `疑似异常，需核对来源`** — CONFIRMED. See §4.1.

---

## 9. Verdict restated

VERDICT: PASS

All four requirements are implemented and independently reproduced on the served site; my own re-runs of
`history.mjs --dry-run`, `validate.mjs`, `npm run build` and `npx playwright test` (twice, once with and once
without a pre-existing server) are all green; the WC §3.5 numbers match my independent re-derivation exactly; no
fabricated price or spec exists; WC §7 holds; both disclosures are honest; single-writer scopes were respected. The
only substantive issue is F1 — the freeze record is stale with respect to the post-freeze cosmetic fix — which is a
documentation correction for the Lead, not a product defect, and therefore does not gate delivery.

---

# Delta re-review (post-merge + USD-normalisation fix)

Reviewer: `07-reviewer-openscale-ds-v4-1-flash`. Shared task **task-7 reopened at revision 5**, claimed at 5.
Thinking level: **medium-high** — this delta verifies a subtle numeric fix whose main failure mode is a
plausible-but-wrong implementation that still passes its own tests, so every check was designed to falsify the fix
rather than confirm it.
Date: 2026-10-11 (Asia/Shanghai). Reviewed revision: commit **`5830a29`** (`fix(usd): derive displayed USD from the
published fx rate; refresh weekly history`), on top of merge **`1d25294`**. Working tree **clean** (`git status
--porcelain` → 0 entries) before and after my runs, so all results below describe the committed content.
Spec: [`docs/WEEKLY-CONTRACT.md`](WEEKLY-CONTRACT.md) §3.1 **Lead addendum** (`:145`) — treated as settled, not
reviewed for correctness of intent, only for faithful implementation.

---

## D1. What changed since the first-pass PASS

| Change | Evidence |
|---|---|
| `origin/main` merged (2 upstream bot commits) | `1d25294` touches only upstream data: `data/discovery-report.json`, `data/history/2026-10-10.json`, `docs/COVERAGE.md`, `public/api/prices.json`, `public/data/{fx,latest,models}.json`. **No overlap** with our `src/`, `tests/`, `docs/*WEEKLY*`, so the clean merge is confirmed, not assumed. |
| `public/data/history.json` regenerated → **126 points / 5 weeks** (was 138) | `validate.mjs` reports `history 5 weeks / 126 points`. Legitimate: see D4. |
| `fx.json` now `asOf 2026-10-09`, TRY `0.0202774207` | `public/data/fx.json`; `latest.fx` is byte-identical to it |
| The reported TRY USD defect + fix | `5830a29`: `docs/WEEKLY-CONTRACT.md` +14, `src/data.js` +22, `tests/matrix.spec.js` +29, `public/data/history.json` regenerated |
| Retained 21 real carried rows in `latest.json` | merge artifact; makes my first-pass F4 moot (D5) |

**Fix scope is exactly as described.** `git show 5830a29 -- src/data.js` contains **only** `normalizePriceUsd`
(`src/data.js:327`) plus its two calls (`:411`, `:412`) — no other behaviour changed. That matters: every first-pass
finding about `cell()`, `history()` and `weeklyTrend` therefore carries over unchanged.

The two new tests are at [`tests/matrix.spec.js:555`](../tests/matrix.spec.js#L555) (published rate wins) and
[`:571`](../tests/matrix.spec.js#L571) (no-rate currency keeps its stored value). They are **not vacuous**: each puts
its record and its history point on a *different* model (`M1`/`M2`, `M3`/`M4`), so neither row is masked by the
same-series collapse, and I reproduced both assertions independently (D2/D3).

## D2. Gates — my own re-run output

**`node scripts/validate.mjs`** → `EXIT=0`:

```
OK: contract v1.1 valid · 151 records · 105 live this week · 7 markets · 22 models · fx 2026-10-09 · history 5 weeks / 126 points · specs present
```

**`npm run build`** → `BUILD_EXIT=0`, 2168 modules transformed, built in 16.13s; the only warning is the
pre-existing >500 kB recharts chunk.

**`npx playwright test`** → **24 passed (24.7s), 0 failed, `PW_EXIT=0`** — the expected 22 → 24 regression count.
**No dev server was listening on 127.0.0.1:5173** when I started, so I **did not reuse a server**: the log shows
`[WebServer] …`, i.e. Playwright started its own vite instance. Both new tests passed:

```
✓ 14 tests/matrix.spec.js:555:1 › USD display: the published fx rate wins over a stale stored priceUsd (7ms)
✓ 15 tests/matrix.spec.js:571:1 › USD display: a currency without a published rate keeps its stored priceUsd (11ms)
✓ 23 tests/matrix.spec.js:749:1 › every visible cell's USD equals round(local × fx.rates[currency], 2) (3.2s)
  24 passed (24.7s)
```

## D3. Adversarial verification of the fix

All numbers below are mine, from `node` probes importing the shipped `src/data.js` plus a Playwright pass against
`127.0.0.1:5173` serving the real `public/data`.

**(a) The published rate wins over a stale stored `priceUsd` — CONFIRMED, on real data.** The three affected cells,
via **both** accessors:

| cell | local | stored in `history.json` (stale) | `round(price × TRY, 2)` | `history()` | `cell()` |
|---|---|---|---|---|---|
| `tr/A16/retail/128GB` | 13,300 TRY | 270.25 | **269.69** | 269.69 | 269.69 |
| `tr/A37 5G/official/256GB` | 30,499 TRY | 619.72 | **618.44** | 618.44 | 618.44 |
| `tr/A57 5G/official/128GB` | 33,499 TRY | 680.68 | **679.27** | 679.27 | 679.27 |

Synthetic isolation as well: a record with stored `priceUsd: 999` and price 100 SAR under a published
`SAR: 0.27` → `cell().priceUsd === 27`. *(My first probe reported spurious "bad" rows here because it compared a
cell against an arbitrary record of the same series; the correct invariant — `cell().priceUsd === round(cell().value
× rate(cell().currency))`, i.e. what `tests/matrix.spec.js:749` asserts — is what is reported above.)*

**(b) A currency with NO published rate keeps its stored value — CONFIRMED, fixtures are not nulled.**
`300 XYZ` with stored `priceUsd: 42` → `cell()` 42 (kept); an isolated `400 XYZ` with stored `7` → `history()` 7
(kept). Also the converse, which the addendum implies: a row with a **finite rate** but a stored **`null`** now
gains the correct value (`100 SAR`, stored `null` → `27`) — never left null when a rate exists.
**0** rows were forced from a value to `null` (14 went `null` → value).

**(c) `weeklyTrend` is untouched — CONFIRMED by independent recomputation.** I recomputed the whole trend with my
own implementation using **local prices only** (no USD anywhere) and compared point-by-point:
`weeklyTrend({})` points match exactly — weeks, `sample`, `medianPct`, `index`, up/down all identical. The
`weeklyTrend` payload contains **no `priceUsd` field at all**. Separately, poisoning `priceUsd` on every row whose
currency has no published rate left `weeklyTrend` bit-identical. So the normalisation cannot leak into the trend.

**(d) Exhaustive invariant on the real published data:** **151/151** `cell()` values and **126/126** `history()`
rows satisfy `priceUsd === round(value × rate, 2)`; **0** violations.

**(e) Idempotent and rounding-consistent.** `hydrate()` ×3 on the same payload object yields the same
`priceUsd` every time (recomputed from `price`, never from the previous `priceUsd`). The fix's
`Math.round(price * rate * 100) / 100` is character-for-character the same rule as `validate.mjs:21`
(`round2`) and the displayed-USD test, so the client and the validator cannot disagree about what "correct" means.

**(f) Served page — CONFIRMED.** All **15** `tr` cells render `$X` equal to `round(local × TRY, 2)`; forcing the
trio through the 渠道/容量 filters shows `$269.69 / $618.44 / $679.27` where the stale values would have been
`$270.25 / $619.72 / $680.68`. `pageerror`, `console.error` and `requestfailed` were all empty.

## D4. The 138 → 126 point change is legitimate

My independent re-implementation of the aggregator (not importing `scripts/history.mjs`) over the **merged**
snapshots: 34 snapshots, 0 skipped, 6907 records scanned, **126** points — **0** points only in mine, **0** only in
the published file, **0** price mismatches, same 5 weeks. So the smaller file is the correct output of the frozen
C2 rules over the new snapshot set, not lost data. The `A06` implausible point survived the merge intact
(`2026-09-28 = 4.2259 SAR`, `state: live`, `sourceId amazon-sa-a06-128`, `brand`/`series` verbatim), so disclosure
(b) still holds.

## D5. First-pass findings re-confirmed or resolved

- **Anti-fabrication and scope findings still hold.** `scripts/validate.mjs` remains **purely additive** vs the
  pre-workstream baseline `4e95129`: **102 insertions / 1 deletion** (the `OK:` summary string). `public/data/specs.json`
  is untouched since my first pass (only in `5b76e24`), and `src/main.jsx` is untouched by the delta — so all
  first-pass R2/R3/R4 served findings, `connectNulls={false}` and the spec-source audit carry over unchanged.
- **F1/F2/F3/F5 — settled by the Lead's §9 addendum** ([`docs/INTEGRATION-WEEKLY.md:343`](INTEGRATION-WEEKLY.md#L343));
  I verified §9 exists and does correct §7.5 and the arithmetic, and attributes the post-freeze write to thread
  `05-ui`. Not re-litigated.
- **F4 (carried-row honesty was fixture-only) — RESOLVED by the merge.** `latest.json` now carries **21 real
  `missing` rows**, so the rule is exercised by real data: **0** of them surface a non-null `delta`/`percent`, and
  setting every carried row's price to 1 leaves `weeklyTrend` bit-identical. Where a real row and a carried row cover
  the same (series, week), `cell()` shows the real row — the WC §3.4 "a real observation always beats a carried row"
  precedence, pre-existing and unchanged.

## D6. Delta findings (all non-blocking)

### Blocking
**None.**

### D6.1 — LOW (documentation): WC §3.5's pinned literals are stale after the merge

The §3.5 *rules* all still hold and I re-verified them, but the pinned numbers are data-dependent and the last point
moved:

| quantity | WC §3.5 (pre-merge) | after the merge (mine) |
|---|---|---|
| `sample` | 3 / 4 / 4 / 4 | 3 / 4 / 4 / 4 (unchanged) |
| `medianPct` | 0 / −1.5635% / 0 / **−7.4923%** | 0 / −1.5635% / 0 / **−2.2285%** |
| `index` | 100 / 98.4365 / 98.4365 / **91.0614** | 100 / 98.4365 / 98.4365 / **96.2428** |
| `suspects` / `insufficient` | 4 / false | 4 / false (same four series, same weeks) |

My independent local-price recomputation produces the new values, so this is correct behaviour on changed data, not
a regression. Per WC §3.4's "Baseline caution" a mismatch is a question for the Lead, not a FAIL. **Requested:** add
a §3.5 addendum pinning the post-merge values (or marking the table as data-dependent).
*Repro:* import `src/data.js` in plain Node against the published `public/data` and print `weeklyTrend({})` — the last
point is `index 96.2428`, `medianPct −0.022285` (`−2.2285%`), where §3.5 pins `91.0614` / `−7.4923%`. On the served
page the trend section's last week reads `指数 96.24`.

### D6.2 — INFO: the client normalises from `latest.fx.rates`, not literally `fx.json.rates`

`hydrate()` resolves `fx = latest?.fx ?? fxFile`, and `normalizePriceUsd` reads `dataInfo.fx.rates`, while the
addendum says "the rates in the published `fx.json`". Today these are **byte-identical**, and
`validate.mjs:60-61` pins `latest.fx.base`/`asOf` to `fx.json` while `:96` cross-checks every record's `priceUsd`
against `fx.json.rates`, so a divergence cannot pass silently. Recorded as a latent coupling, not a defect.

### D6.3 — INFO (probe note, not a defect): `cell()` vs `history()` for a `price: null` row

For a row with `price: null` and a known currency, `cell()` returns `priceUsd: null` (the pre-existing
`unavailable()` branch) while `history()` preserves the stored value. The delta touched only `normalizePriceUsd`, so
this is unchanged pre-existing behaviour — recorded so a future reviewer does not mistake it for the fix nulling
values.

---

VERDICT: PASS

The merged + fixed revision is verified: all four requirements still hold, the full gate is green on my own runs
(**24/24 Playwright with no reused server**, `validate.mjs` EXIT 0, `npm run build` EXIT 0), the USD fix is correct
under adversarial testing (published rate wins for 151/151 cells and 126/126 history rows; a no-rate currency keeps
its stored value; `weeklyTrend` provably unaffected), the 126-point `history.json` is the legitimate aggregation of
the merged snapshots, and first-pass F4 is resolved by real carried-row data. The only new item is **D6.1**, a
non-blocking documentation addendum for WC §3.5. Nothing here blocks a push.
