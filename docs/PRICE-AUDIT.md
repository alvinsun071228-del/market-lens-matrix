# PRICE AUDIT — independent re-verification of live records

Owner: collector (role 03). Scope: every current-week `state:"live"` record in
`public/data/latest.json`, plus the parser/idempotency/Oman work for this role.
This document is evidence, not a source of truth: the only source of truth is a
fresh fetch of the record's own `sourceUrl`.

- Audit run: **2026-10-09** (same UTC day as the audited collection, week `2026-10-05`).
- Audited set: the 46 live records committed at `HEAD` (`00b58cf`), captured to
  `/tmp/original-latest.json` via `git show HEAD:public/data/latest.json`.
- Method per record: re-fetch `sourceUrl` with `curl`-equivalent Node `fetch`
  (UA `Chrome/126`) and parse every `application/ld+json` Product/Offer; for
  JavaScript-only pages and Amazon, render with headless Playwright (Chromium
  1228) and read the product page's own price token (`#productTitle`,
  `span.a-price span.a-offscreen`). Amazon session URLs were canonicalised to
  `https://www.amazon.<tld>/dp/<ASIN>` before re-fetch.
- Nothing in this table was estimated or invented. No price was silently
  "corrected"; every discrepancy is reported below and the fixes only change
  *future* collection.

---

## 1. Re-verification table (46 pre-fix live records)

Legend: ✅ price re-resolved from `sourceUrl` · ⚠️ `sourceUrl` exposes no
machine-readable price (verified against the source's listing ItemList instead)
· ❌ mismatch · 🧩 price resolved but the record is semantically invalid.

| # | sourceId | Ctry | Model + variant | Recorded | Re-fetched from `sourceUrl` | Verdict | Evidence snippet |
|---|---|---|---|---|---|---|---|
| 1 | jumbo-ae-a07-128 | ae | A07 128GB | 579 AED | 579 | ✅ | `"Samsung Galaxy A07 4GB 4G Smartphone, Black, 128 GB"` → `"price":579` |
| 2 | samsung-ae-a-official | ae | A07S 64GB | 589 AED | 589 | ✅ | `"Galaxy A07s"` → `589` |
| 3 | samsung-ae-a-official | ae | A08 64GB | 659 AED | 659 | ✅ | `"Galaxy A08"` → `659` |
| 4 | amazon-ae-a16-128 | ae | A16 128GB | 561 AED | **494** | ❌ | dp `B0DM1S54MZ` → `span.a-price .a-offscreen = "AED494.00"`; that ASIN's grid card now has no price |
| 5 | samsung-ae-a-official | ae | A17 256GB | 1509 AED | — (JS-only page) | ⚠️ | product URL has no LD price; listing `galaxy-a` → `"Galaxy A17" = 1509` |
| 6 | samsung-ae-a-official | ae | A26 N/A | 1277 AED | 1277 | 🧩 | product page `"Galaxy A26 5G Bundle"` → `1277`; bundle = phone + Buds Core + 25W adapter |
| 7 | samsung-ae-a-official | ae | A27 5G 256GB | 1889 AED | 1889 | ✅ | `"Galaxy A27 5G"` → `1889` |
| 8 | samsung-ae-a-official | ae | A36 N/A | 1771.5 AED | 1771.5 | 🧩 | `"Galaxy A36 5G Bundle"` → `1771.5`; bundle includes Buds Core + SmartTag2 + adapter |
| 9 | samsung-ae-a-official | ae | A37 128GB | 1559 AED | — (JS-only page) | ⚠️ | listing `galaxy-a` → `"Galaxy A37 5G" = 1559` |
| 10 | samsung-ae-a-official | ae | A57 512GB | 3199 AED | 3199 | ✅ | `"Galaxy A57 5G"` → `3199` |
| 11 | samsung-ae-s-official | ae | S25 N/A (S25 Ultra) | 5499 AED | 3449 / 3849 | ❌ | buy page `SM-S938BZBOMEA` → `S25 Ultra 256GB=3449, 512GB=3849`; listing showed `5499` |
| 12 | samsung-ae-s-official | ae | S26 256GB (S26 FE) | 3059 AED | 3059 | ✅ | `"Galaxy S26 FE"` → `3059` |
| 13 | samsung-ae-s-official | ae | S26 N/A | 4799 AED | 4799 | ✅ | buy page `SM-S942BZDPMEA` → `"Galaxy S26 512 GB" = 4799` (variant not pinned) |
| 14 | samsung-levant-a-official | jo | A07 128GB | 149 JOD | 149 | ✅ | `"Galaxy A07"` → `149` |
| 15 | samsung-levant-a-official | jo | A17 128GB | 190 JOD | 190 | ✅ | `"Galaxy A17"` → `190` |
| 16 | samsung-levant-a-official | jo | A27 5G 128GB | 239 JOD | 239 | ✅ | `"Galaxy A27 5G"` → `239` |
| 17 | jarir-qa-catalog | qa | A57 N/A | 1379 QAR | 1379 | ✅ | `"Samsung Galaxy A57 5G 128 GB … Qatar"` → `1379` (variant not derived from listing title) |
| 18 | jarir-qa-a57-128 | qa | A57 128GB | 1379 QAR | 1379 | ✅ | same product page JSON-LD `1379` |
| 19 | jarir-qa-catalog | qa | S25 N/A | 2260 QAR | 2260 | ✅ | offer URL is `galaxy-s25-fe…`; page `"Samsung Galaxy S25 FE 5G …"` → `2260` |
| 20 | jarir-qa-catalog | qa | S26 N/A | 3399 QAR | 3399 | ✅ | offer URL is `galaxy-s26…`; page `"Samsung Galaxy S26+ 256 GB …"` → `3399` |
| 21 | samsung-sa-a-official | sa | A07 64GB | 599 SAR | 599 | ✅ | `"Galaxy A07"` → `599` |
| 22 | samsung-sa-a-official | sa | A16 128GB | 619 SAR | 619 | ✅ | `"Galaxy A16"` → `619` |
| 23 | amazon-sa-a16-128 | sa | A16 128GB | 585 SAR | 585 | ✅ | dp `B0DM1S54MZ` → `"SAR585.00"` |
| 24 | samsung-sa-a-official | sa | A17 128GB | 789 SAR | 789 | ✅ | `"Galaxy A17"` → `789` |
| 25 | samsung-sa-a-official | sa | A27 5G 128GB | 1249 SAR | 1249 | ✅ | `"Galaxy A27 5G"` → `1249` |
| 26 | samsung-sa-a-official | sa | A36 5G 128GB | 1349 SAR | 1349 | ✅ | `"Galaxy A36 5G"` → `1349` |
| 27 | samsung-sa-a-official | sa | A37 5G 256GB | 1899 SAR | 1899 | ✅ | `"Galaxy A37 5G"` → `1899` |
| 28 | samsung-sa-a-official | sa | A57 5G 128GB | 1799 SAR | 1799 | ✅ | `"Galaxy A57 5G"` → `1799` |
| 29 | jarir-sa-a57-256 | sa | A57 256GB | 1599 SAR | 1599 | ✅ | `"Samsung Galaxy A57 5G 256 GB … KSA"` → `1599` |
| 30 | amazon-sa-a57-256 | sa | A57 256GB | 1429.96 SAR | 1429.96 | ✅ | dp `B0GSVQMB9P` → `"SAR1,429.96"` |
| 31 | samsung-sa-s-official | sa | S25 N/A (base S25) | 3799 SAR | 2299 / 1999 / 3349 | ❌ | buy page `SM-S931BLBOMEA` → `S25 256=2299, S25 FE 256=1999, FE 512=3349`; listing showed `3799` |
| 32 | samsung-sa-s-official | sa | S25 256GB (S25 FE) | 2999 SAR | 1999 | ❌ | product page `galaxy-s25-fe-navy-256gb…` → `1999`; listing showed `2999` |
| 33 | samsung-sa-s-official | sa | S26 128GB (S26 FE) | 2799 SAR | 2599 | ❌ | product page `galaxy-s26-fe-pistachio-128gb…` → `2599`; listing showed `2799` |
| 34 | samsung-sa-s-official | sa | S26 N/A | 5299 SAR | 5299 | ✅ | buy page `SM-S942BZVPMEA` → `"Galaxy S26 512 GB" = 5299` |
| 35 | samsung-tr-a-official | tr | A07 5G 128GB | 15499 TRY | 15499 | ✅ | `"Galaxy A07 5G"` → `15499` |
| 36 | samsung-tr-a-official | tr | A08 128GB | 12999 TRY | 12999 | ✅ | `"Galaxy A08"` → `12999` |
| 37 | amazon-tr-a16-128 | tr | A16 128GB | 13300 TRY | 13300 | ✅ | dp `B0DRCMZJPG` → `"13.300,00TL"` |
| 38 | samsung-tr-a-official | tr | A17 128GB | 16999 TRY | 16999 | ✅ | `"Galaxy A17"` → `16999` |
| 39 | samsung-tr-a-official | tr | A17 5G 256GB | 20499 TRY | 20499 | ✅ | `"Galaxy A17 5G"` → `20499` |
| 40 | samsung-tr-a-official | tr | A27 5G 128GB | 20499 TRY | 20499 | ✅ | `"Galaxy A27 5G"` → `20499` |
| 41 | samsung-tr-a-official | tr | A37 5G 256GB | 30499 TRY | 30499 | ✅ | `"Galaxy A37 5G"` → `30499` |
| 42 | samsung-tr-a-official | tr | A57 5G 128GB | 33499 TRY | 33499 | ✅ | `"Galaxy A57 5G"` → `33499` |
| 43 | samsung-tr-s-official | tr | S25 N/A (S25+) | 73499 TRY | 73499 | ✅ | buy page `SM-S936BDBDTUR` → `"Galaxy S25+ 256 GB" = 73499` |
| 44 | samsung-tr-s-official | tr | S25 256GB (S25 FE) | 46999 TRY | 46999 | ✅ | `"Galaxy S25 FE"` → `46999` |
| 45 | samsung-tr-s-official | tr | S26 256GB (S26 FE) | 54999 TRY | 54999 | ✅ | `"Galaxy S26 FE"` → `54999` |
| 46 | samsung-tr-s-official | tr | S26 N/A (S26+) | 103999 TRY | 103999 | ✅ | buy page `SM-S947BLBDTUR` → `"Galaxy S26+ 256 GB" = 103999` |

### Verdict tally (pre-fix)

| Verdict | Count |
|---|---|
| ✅ price re-resolved from `sourceUrl` | **37** |
| ⚠️ verified via the source's listing ItemList (product URL is JS-only) | **2** |
| 🧩 price resolved but record is invalid (accessory bundle) | **2** |
| ❌ mismatch | **5** (`amazon-ae` live move; 4 Samsung S provenance) |
| **Total** | **46** |

The 4 Samsung "provenance" mismatches are **not fabrications**: the recorded
number *was* the price printed on the listing page the parser reads, but
`sourceUrl` pointed at a `/buy/?modelCode=…` deep link whose own price is a
different (lower) promo. Re-fetching the deep link therefore returns a different
number. The audit reports them rather than "fixing" the number.

---

## 2. Findings and fixes

### 2.1 Accessory-bundle contamination (fixed)
`samsung-ae-a-official` recorded `Galaxy A26 5G Bundle` (1277 AED) and
`Galaxy A36 5G Bundle` (1771.5 AED) as if they were phone prices. Both prices
include Buds Core / SmartTag2 / a 25W adapter, so they overstate the phone and
let accessories decide the cell (there is no standalone A26/A36 listing in UAE).
`parseSamsungOfficialList` now rejects titles matching
`/\b(?:bundle|combo)\b|with\s+buds|\+\s*buds/i` (the `ACCESSORY`/`NOT_NEW`
guards already ran for Amazon).

### 2.2 Model identity collapsed different phones (fixed)
`deriveModel` previously captured only `[ASZMF]\d{2}`, so `Galaxy A17` and
`Galaxy A17 5G` shared id `A17`, and `Galaxy S26`, `S26+`, `S26 Ultra`, `S26 FE`
all shared id `S26`. The parser keeps the **lowest** price per model|variant, so
a cheaper *different* phone silently won the cell (e.g. AE `A17 256GB` recorded
the 4G 1509 while the 5G 1659 was dropped; QA `S25` actually meant `S25 FE`).
`deriveModel` now keeps connectivity and the S-series sub-model, normalises
`Plus`→`+`, and accepts a comma separator used by eXtra titles
(`Galaxy A57, 5G, …`). Config model matching uses `modelMatches()` (family
prefix), so a source configured as `A57` still matches an observed `A57 5G` and
the record is stored with the observed, precise id.

Effect after re-collection: SA/AE/TR now surface real `A17 5G` rows, and the
S-series rows are `S25`, `S25+`, `S25 ULTRA`, `S25 EDGE`, `S25 FE`,
`S26`, `S26+`, `S26 ULTRA`, `S26 FE` instead of two merged buckets.

### 2.3 `sourceUrl` did not carry the price it proved (fixed)
For `jsonld-itemlist` sources the record's `sourceUrl` was the per-product
`/buy/?modelCode=…` link while the price came from the listing ItemList. The
record now stores the **listing page** as `sourceUrl` (the page actually
fetched/parsed) and keeps the deep product link in
`rawEvidence.productUrl`. This is why the 4 provenance mismatches above
disappear after the fix.

### 2.4 Amazon records were not reproducible (fixed)
Amazon records used the whole search-card `innerText` as the title/evidence
(ratings, "50+ bought in past month", delivery date — all volatile) and the
session-tagged `ref=…&dib=…` URL as `sourceUrl`. Fixes:
- product title read from `[data-cy="title-recipe"]`;
- `sourceUrl` canonicalised to `https://www.amazon.<tld>/dp/<ASIN>`;
- candidates ordered deterministically by `(card price, ASIN)` — the search
  grid order must not choose the product;
- the product page's own `span.a-price .a-offscreen` price is recorded and the
  evidence is a small deterministic object (`method`, `productId`, `priceText`,
  `title`), not raw card text.
`rawEvidence.method` is now `amazon-detail` when the product page verified the
price, else `amazon-search-card`.

### 2.5 Deterministic output order (fixed)
`deduped.sort` now breaks ties on `variant` and `sourceId` as well, so the
serialized record order is a pure function of the fetched data.

---

## 3. Idempotency proof

Two consecutive `node scripts/collect.mjs` runs in the same ISO week, run 36
seconds apart:

```
$ node scripts/collect.mjs   # run A -> copied to /tmp/runA.json
$ node scripts/collect.mjs   # run B -> copied to /tmp/runB.json
$ diff /tmp/runA.json /tmp/runB.json | grep '^[<>]' | wc -l
     122
$ diff /tmp/runA.json /tmp/runB.json | grep '^[<>]' | grep -v collectedAt
  (none)
```

Every changed line is a `collectedAt` value (1 top-level + 60 current-week
records × 2 diff lines = 122). After scrubbing `collectedAt`, the files are
byte-identical:

```
$ diff /tmp/A.norm /tmp/B.norm && echo IDENTICAL
IDENTICAL
```

What had to change to make this true: §2.4 canonical URL + deterministic card
selection + deterministic Amazon evidence; §2.5 explicit tie-break sort; and the
Oman `extra-search` parser picks its product deterministically (in-stock, then
lowest price, then `modelNumber`). Historical (non-current-week) records keep
their original `collectedAt`, so they are genuinely untouched.

---

## 4. Collector CLI usage

```bash
# normal run: refresh FX, collect all enabled sources, write
# public/data/latest.json, public/api/prices.json, data/history/<date>.json
node scripts/collect.mjs

# debug a single source or a subset (non-selected sources keep their
# current-week records from the previous latest.json)
node scripts/collect.mjs --only=samsung-sa-a-official,extra-om-a57-256

# fetch + build the payload but write nothing at all (not even fx.json)
node scripts/collect.mjs --dry-run
node scripts/collect.mjs --dry-run --only=extra-om-a16-128
```

- `--only=<id[,id]>` filters the enabled sources to the listed `sourceId`s. A
  source id that is disabled or unknown is simply not collected; ids are matched
  exactly (trimmed, comma-separated).
- `--dry-run` performs all real fetches and prints the resulting counts, but
  writes no files. It reuses the cached `public/data/fx.json` when present (or
  fetches FX in memory only), so it never touches disk.
- Both flags are also the intended entry points for future parser debugging; see
  `--only` + `--dry-run` combinations above.

---

## 5. Oman outcome

**Enabled.** eXtra Oman (`extra.com/en-om`) is reachable and OMR-denominated.
The storefront search page is a JS/Unbxd shell, but its HTML embeds the public
Unbxd credentials (`"apiKey":"0196…778f"`, `"siteKey":"ss-unbxd-auk-extra-oman-en-prod11541714990855"`),
the public search API returns real OMR prices, and **product pages expose static
JSON-LD** (`{"name":"Samsung Galaxy A16, 4G, 128 GB, Gray","price":"57.000","currency":"OMR"}`).

New parser `extra-search`: read the Unbxd key from the search page → query
`https://search.unbxd.io/{apiKey}/{siteKey}/search?q=…` → match model/variant →
prefer in-stock, then lowest price, then `modelNumber` → **confirm the price on
the chosen product page's own JSON-LD** (so `sourceUrl` really carries the
price). `availability` is taken from the live `inStockFlag`.

Three sources enabled (re-collected after the fix):

| sourceId | model + variant | price | availability | Unbxd `modelNumber` | evidence |
|---|---|---|---|---|---|
| `extra-om-a16-128` | A16 128GB (4G) | 57 OMR | out_of_stock | `SM-A165FLGDMEA` | product page JSON-LD `57.000 OMR`; Unbxd `inStockFlag=false` in all Omani cities |
| `extra-om-a57-128` | A57 5G 128GB | 139.9 OMR | in_stock | `SM-A576BDBMMEA-O` | product page JSON-LD `139.9 OMR`; Unbxd `inStockFlag=true` |
| `extra-om-a57-256` | A57 5G 256GB | 159.9 OMR | in_stock | `SM-A576BDBPMEA` | product page JSON-LD `159.9 OMR`; Unbxd `inStockFlag=true` |

The A16 price is real and listed, but eXtra's own index marks it out of stock in
every Omani city, so it is recorded with `availability:"out_of_stock"` rather
than presented as purchasable.

Attempts that failed and were **not** proxied or converted:
`oman.sharafdg.com` → Cloudflare `403` (challenge page);
`luluhypermarket.com/en-om` → Cloudflare `403`;
`noon.com/oman-en` → Akamai `403`;
`emax.om` → DNS failure;
`khimji.com` → homepage `200` but contains **0** Galaxy names and **0** OMR
price tokens (not a phone-price source).
`amazon.ae` is AED-only and was deliberately **not** used as an OMR column.

---

## 6. Sources changed / disabled

- **Replaced** the previously disabled `extra-om-search` (`browser-text`) with
  the `extra-search` sources above. Its old `disabledReason` ("eXtra Oman
  answers automated clients with 'Server Error' and its prices load client-side
  from Unbxd; no OMR price is exposed") was **inaccurate for product pages**:
  the search shell is blocked/JS-only, but the product pages return static
  JSON-LD, and the public Unbxd API can be queried for discovery.
- **No source was newly disabled.** All 18 enabled sources collected with
  `failedSources: []` in the final run.
- Lulu/Sharaf DG Oman remain unreachable (Cloudflare 403) and are not
  configured as sources.

## 7. Post-fix re-verification

Re-ran the same re-fetch harness against the new `latest.json`: **60/60
current-week live records re-resolved on their own `sourceUrl`** (0 mismatches,
0 unverifiable). The 4 provenance mismatches and the 2 bundle records are gone;
the `amazon-ae` record now points at the ASIN whose product page actually shows
the recorded price.

## 8. Limitations

- The historical record `jarir-sa-a57-256` (weeks 2026-09-07 … 2026-10-01) is
  stored under the old model id `A57`; new records use `A57 5G`. The old rows'
  `rawEvidence` is only `{method:"browser-text"}` (no text/title), so there is no
  non-fabricated way to re-derive connectivity for them; they are left as
  collected. The matrix will show a historical-only `A57` row for Saudi Arabia.
- Samsung's `/buy/?modelCode=…` deep links can show a different promo than the
  listing ItemList. The collector follows the listing (the page it parses) and
  now stores that listing as `sourceUrl`; the deep link remains in
  `rawEvidence.productUrl` for manual inspection.
