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
