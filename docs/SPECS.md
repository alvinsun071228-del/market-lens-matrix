# SPECS — researched device specifications for the 22 tracked models

**Owner:** researcher thread (task-2) · **Deliverable:** [public/data/specs.json](public/data/specs.json) + this document
**Contract:** [docs/WEEKLY-CONTRACT.md](docs/WEEKLY-CONTRACT.md) §4 (frozen schema) and §7 (anti-fabrication)
**Generated:** 2026-10-10T17:02:57.000Z (UTC)

---

## 1. What this file contains

`public/data/specs.json` carries hardware specs for **exactly the 22 model ids in
[public/data/models.json](public/data/models.json)**, using the frozen §4 schema
(`display, screenInches, batteryMah, storage, ramGb, chipset, releaseYear, sources, confidence, missing`).

| metric | value |
|---|---|
| model keys | 22 / 22 (no missing ids) |
| field slots | 154 (22 models × 7 fields) |
| slots filled with a sourced value | 136 (88.3%) |
| models with all 7 fields non-null | 12 / 22 |
| distinct source URLs | 52 |

**Nothing in this file is inferred, interpolated or copied from a sibling model.**
Every non-null value was read in a page that was actually fetched during this task
(HTTP 200, HTML saved to `/tmp/pages2/*.html` / `/tmp/press/*.html`), with one
explicitly flagged exception (the `A07 5G` chipset, §5.1).

## 2. Method

1. **Target list** — read `public/data/models.json` for the 22 ids (never guessed).
2. **Official storefront discovery** — the search tool available in this session was
   unusable (web_search returned an auth error; web_fetch refused non-public IPs), so
   discovery used `curl` against the public **Samsung regional sitemaps**
   (`https://www.samsung.com/<region>/im-sitemap.xml`, 26 regions: `ae, sa_en, levant, tr,
   us, uk, in, au, sg, africa_en, ca, ie, de, fr, es, it, pl, nl, my, th, id, ph, hk_en, tw, nz, mx`)
   to enumerate real product/SKU URLs per model. This avoids guessing URL slugs.
3. **Official spec pages fetched** — 33 Samsung product/SKU pages, preferring the tracked
   Middle-East regions (`sa_en, ae, levant, tr`) and falling back to `us, uk, in, de, nl, africa_en`
   only when a model has no MEA SKU page. Spec tables are server-rendered and were parsed
   from `Size (Main_Display)`, `Resolution`, `Technology`, `Max Refresh Rate`,
   `Memory_(GB)`, `Storage (GB)`, `Battery Capacity (mAh, Typical)`, `CPU Name`
   (German pages: `Displaygröße`, `Displaytechnologie`, `Arbeitsspeicher`).
4. **Official newsroom announcements fetched** — 12 posts from `news.samsung.com/global`
   (discovered through `wp-sitemap-posts-post-{1..4}.xml`) for chipset/display/battery
   statements and for the announcement date used as `releaseYear`.
5. **Collected record titles** — `public/data/latest.json` `title` fields (real collector
   output, each with its own `sourceUrl`, `sourceId`, `collectedAt`) were cross-checked
   for storage/RAM/display/battery claims. They were used as *confirmation*, and as the sole
   source for exactly one field (§5.1).
6. **Cross-checking** — where two fetched SKUs of the same model disagree, the field is
   **null** and listed in `missing` (see §5.2 RAM).

### 2.1 Definitions used

- **`confidence`** = the *weakest* source class supporting a non-null value for that model:
  `official` (samsung.com product/SKU page or news.samsung.com announcement) or
  `retailer` (a retrieved retailer product listing/title). No model needed `unverified`.
  Per-field provenance is in §4; a model-level downgrade never means an official field is wrong.
- **`releaseYear`** = calendar year of **Samsung's official announcement** for that model
  (not the shelf date in each of the 7 markets, which varies and was not verified). Evidence =
  the newsroom post date; for models with no announcement found the field is `null`.
- **`storage`** = every storage option actually seen on a fetched official page (not the
  models.json variant list, and not an inference from the URL of one SKU).
- **`display`** = inches + panel technology (+ refresh rate when the fetched spec table or the
  official announcement states it). Nothing else was added.

## 3. Coverage by field

| field | non-null | coverage |
|---|---|---|
| `display` | 22/22 | 100.0% |
| `screenInches` | 22/22 | 100.0% |
| `batteryMah` | 22/22 | 100.0% |
| `storage` | 22/22 | 100.0% |
| `ramGb` | 16/22 | 72.7% |
| `chipset` | 16/22 | 72.7% |
| `releaseYear` | 16/22 | 72.7% |
| **all fields** | **136/154** | **88.3%** |

## 4. Per-model evidence table

`—` means the field is verifiably **not** established and is therefore `null` (and named in
`missing`). `src #` is the number of URLs recorded for that model (full list in §6).

| model id | display | screenInches | batteryMah | storage | ramGb | chipset | releaseYear | confidence | src # | missing |
|---|---|---|---|---|---|---|---|---|---|---|
| `A07` | 6.7" PLS LCD HD+ | 6.7 | 5000 | 64GB / 128GB | 4 | MediaTek G99 | — | official | 3 | releaseYear |
| `A07 5G` | 6.7" PLS LCD HD+ 120Hz | 6.7 | 6000 | 128GB | 4 | MediaTek Dimensity 6300 | 2026 | retailer | 3 | — |
| `A07S` | 6.7" PLS LCD HD+ | 6.7 | 5000 | 64GB | 4 | MediaTek G99+ | — | official | 1 | releaseYear |
| `A08` | 6.7" PLS LCD HD+ | 6.7 | 6000 | 64GB / 128GB | 4 | — | — | official | 2 | chipset, releaseYear |
| `A16` | 6.7" Super AMOLED FHD+ | 6.7 | 5000 | 128GB | 4 | — | — | official | 2 | chipset, releaseYear |
| `A17` | 6.7" Super AMOLED FHD+ 90Hz | 6.7 | 5000 | 128GB / 256GB | — | — | — | official | 2 | ramGb, chipset, releaseYear |
| `A17 5G` | 6.7" Super AMOLED FHD+ 90Hz | 6.7 | 5000 | 128GB / 256GB | — | — | — | official | 2 | ramGb, chipset, releaseYear |
| `A27 5G` | 6.7" Super AMOLED FHD+ 120Hz | 6.7 | 5000 | 128GB / 256GB | — | Snapdragon 6 Gen 3 | 2026 | official | 3 | ramGb |
| `A36 5G` | 6.7" Super AMOLED FHD+ 120Hz | 6.7 | 5000 | 128GB / 256GB | — | Snapdragon 6 Gen 3 | 2025 | official | 3 | ramGb |
| `A37 5G` | 6.7" Super AMOLED FHD+ 120Hz | 6.7 | 5000 | 128GB / 256GB | — | — | 2026 | official | 3 | ramGb, chipset |
| `A56 5G` | 6.7" Super AMOLED FHD+ 120Hz | 6.7 | 5000 | 128GB / 256GB | 8 | Exynos 1580 | 2025 | official | 3 | — |
| `A57 5G` | 6.7" Super AMOLED Plus FHD+ 120Hz | 6.7 | 5000 | 128GB / 256GB / 512GB | — | — | 2026 | official | 4 | ramGb, chipset |
| `S25` | 6.2" Dynamic AMOLED 2X FHD+ 120Hz | 6.2 | 4000 | 128GB / 256GB | 12 | Snapdragon 8 Elite for Galaxy | 2025 | official | 3 | — |
| `S25 EDGE` | 6.7" Dynamic AMOLED 2X QHD+ 120Hz | 6.7 | 3900 | 256GB / 512GB | 12 | Snapdragon 8 Elite for Galaxy | 2025 | official | 2 | — |
| `S25 FE` | 6.7" Dynamic AMOLED 2X FHD+ 120Hz | 6.7 | 4900 | 128GB / 256GB / 512GB | 8 | Exynos 2400 | 2025 | official | 2 | — |
| `S25 ULTRA` | 6.9" Dynamic AMOLED 2X QHD+ 120Hz | 6.9 | 5000 | 256GB / 512GB / 1TB | 12 | Snapdragon 8 Elite for Galaxy | 2025 | official | 2 | — |
| `S25+` | 6.7" Dynamic AMOLED 2X QHD+ 120Hz | 6.7 | 4900 | 256GB / 512GB | 12 | Snapdragon 8 Elite for Galaxy | 2025 | official | 3 | — |
| `S26` | 6.3" Dynamic AMOLED 2X FHD+ 120Hz | 6.3 | 4300 | 256GB / 512GB | 12 | Exynos 2600 | 2026 | official | 3 | — |
| `S26 5G` | 6.3" Dynamic AMOLED 2X FHD+ 120Hz | 6.3 | 4300 | 256GB / 512GB | 12 | Exynos 2600 | 2026 | official | 3 | — |
| `S26 FE` | 6.7" Dynamic AMOLED 2X FHD+ 120Hz | 6.7 | 4900 | 128GB / 256GB | 8 | Exynos 2500 | 2026 | official | 3 | — |
| `S26 ULTRA` | 6.9" Dynamic AMOLED 2X QHD+ 120Hz | 6.9 | 5000 | 256GB / 512GB | 12 | Snapdragon 8 Elite Gen 5 | 2026 | official | 2 | — |
| `S26+` | 6.7" Dynamic AMOLED 2X QHD+ 120Hz | 6.7 | 4900 | 256GB / 512GB | 12 | Exynos 2600 | 2026 | official | 2 | — |

## 5. What could not be verified

### 5.1 The one non-official value

- **`A07 5G` chipset = `MediaTek Dimensity 6300`, confidence `retailer`.** The official
  Samsung A07 5G pages and the 2026-02-12 Samsung newsroom announcement only say
  "6 nm processor" — no chip name. The value comes from the collected record title
  "Samsung Galaxy A07 5G (4GB RAM, 128GB Depolama) | 6,7 inç HD+ 120Hz Ekran | MediaTek Dimensity 6300
  | ... | 6000 mAh Batarya" (`sourceId: amazon-tr-a07-5g-128`,
  <https://www.amazon.com.tr/dp/B0H31J9RCG>) in `public/data/latest.json`. A live re-fetch of that
  Amazon page returned HTTP 200 but only a bot/consent shell, so the *title* (real collector
  output) is the evidence. Read as a retailer claim, not an official spec.

### 5.2 Fields left null on purpose

| model(s) | null field | why |
|---|---|---|
| A17, A17 5G | `ramGb` | fetched official SKUs disagree: A17 = **6 GB** (SA 128 GB) vs **8 GB** (AE 256 GB), and the collected UAE title says **4 GB** (128 GB); A17 5G = **4 GB** (SA 128 GB) vs **8 GB** (AE 256 GB). RAM varies by storage SKU, so a single number would be wrong. |
| A27 5G, A36 5G, A37 5G | `ramGb` | fetched SKUs disagree: **6 GB** (128 GB SKU) vs **8 GB** (256 GB SKU) on Samsung's own pages. |
| A57 5G | `ramGb` | fetched SKUs disagree: **8 GB** (128/256 GB) vs **12 GB** (512 GB). |
| A57 5G | `chipset` | no official spec-table or announcement names it. Samsung support replies on the official UK page and one customer review mention "Exynos 1680", but neither is a product-spec statement, so it was **not** used. |
| A37 5G | `chipset` | not named in the official spec tables or the 2026-03-25 launch announcement. The SA page contains the speculative phrase "likely the MediaTek Dimensity series" — explicitly not a spec, so it was **not** used. |
| A08, A16, A17, A17 5G | `chipset` | the MEA official pages give only "Octa-Core / CPU Speed"; **no Samsung announcement for these ids was found in the global newsroom sitemap** (searched all 4 post sitemaps). |
| A07, A07S, A08, A16, A17, A17 5G | `releaseYear` | no Samsung announcement post found for these ids in `news.samsung.com/global`; a "first seen at retail" year would be a guess, so it stays null. |
| A07, A07S, A08, A16 | display refresh rate | not present in the fetched MEA spec tables; the `display` string therefore states panel technology only. |

### 5.3 2026-generation ids — page existence

Checked via 26 regional sitemaps:

- **Official product pages exist and were fetched** for: `A07 5G`, `A07S`, `A08`, `A17`,
  `A17 5G`, `A27 5G`, `A37 5G`, `A57 5G`, `S25 EDGE` (via the launch announcement's
  specification table — no SKU page exists in any of the 26 sitemaps), `S26`, `S26 FE`,
  `S26 ULTRA`, `S26+`.
- **`S26 5G`** — **no page named "Galaxy S26 5G" exists** on samsung.com in any of the 26
  regions. It is the *same handset* as the `S26` id (SM-S942B); the two ids appear in
  models.json because retailer titles split the name (e.g. extra.com OM:
  "SAMSUNG Galaxy S26, 5G, 256 GB, Sky Blue"). Its rows are therefore populated from the
  official Galaxy S26 pages and the extra.com source URL is recorded alongside them.
  This is a naming de-duplication, **not** copying a different model's spec.
- **`S25 EDGE`, `S25`, `S25+`, `S25 ULTRA`** — no current MEA SKU pages; specs come from
  the official `us`/`uk`/`in`/`de` Samsung pages plus the official announcements.
- **S25 Ultra / S25+ battery capacity** is not printed in the German spec table; the values
  (5,000 mAh / 4,900 mAh) come from the official Samsung US pages (US S25 family comparison
  and the S25 Ultra product page).

## 6. Source inventory (every URL recorded in specs.json)

50 samsung.com / news.samsung.com URLs (all fetched during this task and re-verified HTTP 200), plus 2 collected-record source URLs carried from public/data/latest.json (the Amazon TR A07 5G listing, re-fetched but bot-shelled; the extra.com OM Galaxy S26 5G listing, kept only to document the S26 / S26 5G naming merge). Per-model mapping:

| model id | source URLs |
|---|---|
| `A07` | <https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a07-black-64gb-sm-a075fzkdmea/><br><https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a07-black-128gb-sm-a075fzkgmea/><br><https://www.samsung.com/levant/smartphones/galaxy-a/galaxy-a07-black-128gb-sm-a075fzkcmea/> |
| `A07 5G` | <https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a07-5g-black-128gb-sm-a076ezkbmea/><br><https://news.samsung.com/global/samsung-launches-galaxy-a07-5g-bringing-intelligence-and-reliable-performance-to-more-galaxy-a-series-devices><br><https://www.amazon.com.tr/dp/B0H31J9RCG> |
| `A07S` | <https://www.samsung.com/ae/smartphones/galaxy-a/galaxy-a07s-black-64gb-sm-a077fzkdmea/> |
| `A08` | <https://www.samsung.com/ae/smartphones/galaxy-a/galaxy-a08-dark-blue-64gb-sm-a085fdbdmea/><br><https://www.samsung.com/ae/smartphones/galaxy-a/galaxy-a08-dark-blue-128gb-sm-a085fdbgmea/> |
| `A16` | <https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a16-black-128gb-sm-a165fzkdmea/><br><https://www.samsung.com/ae/smartphones/galaxy-a/galaxy-a16-black-128gb-sm-a165fzkdmea/> |
| `A17` | <https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a17-black-128gb-sm-a175fzkcmea/><br><https://www.samsung.com/ae/smartphones/galaxy-a/galaxy-a17-black-256gb-sm-a175fzkomea/> |
| `A17 5G` | <https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a17-5g-black-128gb-sm-a176bzkemea/><br><https://www.samsung.com/ae/smartphones/galaxy-a/galaxy-a17-5g-black-256gb-sm-a176bzkgmea/> |
| `A27 5G` | <https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a27-5g-black-128gb-sm-a276bzkimea/><br><https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a27-5g-black-256gb-sm-a276bzkjmea/><br><https://news.samsung.com/global/samsung-galaxy-a27-5g-brings-an-immersive-display-and-awesome-intelligence-to-more-users> |
| `A36 5G` | <https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a36-5g-awesome-black-128gb-sm-a366bzkmmea/><br><https://www.samsung.com/ae/smartphones/galaxy-a/galaxy-a36-5g-awesome-black-256gb-sm-a366bzkvmea/><br><https://news.samsung.com/global/samsung-marks-a-step-forward-with-ai-for-everyone-by-introducing-new-galaxy-a56-5g-galaxy-a36-5g-and-galaxy-a26-5g> |
| `A37 5G` | <https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a37-5g-awesome-charcoal-128gb-sm-a376bzammea/><br><https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a37-5g-awesome-charcoal-256gb-sm-a376bzavmea/><br><https://news.samsung.com/global/samsung-unveils-galaxy-a57-5g-and-galaxy-a37-5g-packing-pro-level-features-at-awesome-price> |
| `A56 5G` | <https://www.samsung.com/levant/smartphones/galaxy-a/galaxy-a56-5g-awesome-graphite-256gb-sm-a566bzkwmea/><br><https://www.samsung.com/ae/smartphones/galaxy-a/galaxy-a56-5g-awesome-graphite-128gb-sm-a566bzkvmea/><br><https://news.samsung.com/global/mwc-2025-powered-by-awesome-intelligence-introducing-the-galaxy-a56-5g-and-a36-5g> |
| `A57 5G` | <https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a57-5g-awesome-gray-128gb-sm-a576bzammea/><br><https://www.samsung.com/ae/smartphones/galaxy-a/galaxy-a57-5g-awesome-gray-256gb-sm-a576bzapmea/><br><https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a57-5g-awesome-lilac-512gb-sm-a576bzvwmea/><br><https://news.samsung.com/global/samsung-unveils-galaxy-a57-5g-and-galaxy-a37-5g-packing-pro-level-features-at-awesome-price> |
| `S25` | <https://www.samsung.com/in/smartphones/galaxy-s/galaxy-s25-icyblue-128gb-sm-s931blbbins/><br><https://www.samsung.com/us/smartphones/galaxy-s25/><br><https://news.samsung.com/global/samsung-galaxy-s25-series-sets-the-standard-of-ai-phone-as-a-true-ai-companion> |
| `S25 EDGE` | <https://news.samsung.com/global/meet-the-samsung-galaxy-s25-edge-an-engineering-marvel-of-new-slim-hardware-innovation><br><https://www.samsung.com/us/smartphones/galaxy-s25-edge/> |
| `S25 FE` | <https://www.samsung.com/sa_en/smartphones/galaxy-s/galaxy-s25-fe-awesome-white-256gb-sm-s731bzwvmea/><br><https://news.samsung.com/global/meet-samsung-galaxy-s25-fe-the-gateway-to-the-galaxy-ai-and-flagship-essentials> |
| `S25 ULTRA` | <https://www.samsung.com/de/smartphones/galaxy-s/galaxy-s25-ultra-titanium-jetblack-256gb-sm5s938bakdeub/><br><https://www.samsung.com/us/smartphones/galaxy-s25-ultra/> |
| `S25+` | <https://www.samsung.com/de/smartphones/galaxy-s/galaxy-s25-plus-navy-256gb-sm5s936bdbdeub/><br><https://www.samsung.com/us/smartphones/galaxy-s25/><br><https://www.samsung.com/uk/smartphones/galaxy-s/galaxy-s25-plus-blueblack-256gb-certified-re-newed-sm5s936bzkdeub/> |
| `S26` | <https://www.samsung.com/africa_en/smartphones/galaxy-s/galaxy-s26-black-256gb-sm-s942bzkoafb/><br><https://www.samsung.com/nl/smartphones/galaxy-s/galaxy-s26-black-512gb-sm-s942bzkheub/><br><https://news.samsung.com/global/galaxy-unpacked-2026-a-first-look-at-the-galaxy-s26-series-samsungs-most-intuitive-ai-phone-yet> |
| `S26 5G` | <https://www.samsung.com/africa_en/smartphones/galaxy-s/galaxy-s26-black-256gb-sm-s942bzkoafb/><br><https://www.samsung.com/nl/smartphones/galaxy-s/galaxy-s26-black-512gb-sm-s942bzkheub/><br><https://www.extra.com/en-om/mobiles-tablets/mobiles/smartphone/samsung-galaxy-s26-5g-256-gb-sky-blue/p/100501233> |
| `S26 FE` | <https://www.samsung.com/sa_en/smartphones/galaxy-s/galaxy-s26-fe-blueberry-128gb-sm-s741bzvumea/><br><https://www.samsung.com/ae/smartphones/galaxy-s/galaxy-s26-fe-blueberry-256gb-sm-s741bzvvmea/><br><https://news.samsung.com/global/samsung-galaxy-s26-fe-delivering-the-latest-flagship-experience-focused-on-what-matters-most> |
| `S26 ULTRA` | <https://www.samsung.com/ae/smartphones/galaxy-s/galaxy-s26-ultra-black-256gb-sm-s948bzkimda/><br><https://www.samsung.com/de/smartphones/galaxy-s/galaxy-s26-ultra-black-512gb-sm5s948bzkgeub/> |
| `S26+` | <https://www.samsung.com/ae/smartphones/galaxy-s/galaxy-s26-plus-black-256gb-sm-s947bzkimda/><br><https://www.samsung.com/africa_en/smartphones/galaxy-s/galaxy-s26-plus-black-512gb-sm-s947bzkoafb/> |

`curl`-level reproduction of the primary evidence:

```bash
# official spec table example (A57 5G, 512 GB SKU: 12 GB RAM / 512 GB storage / 5,000 mAh)
curl -sL "https://www.samsung.com/sa_en/smartphones/galaxy-a/galaxy-a57-5g-awesome-lilac-512gb-sm-a576bzvwmea/" \
  | tr '<' '\n' | grep -E "Memory_\(GB\)|Storage \(GB\)|Battery Capacity"
# official announcement with chipset + release year (A36 5G -> Snapdragon 6 Gen 3, 2025-03-02)
curl -sL "https://news.samsung.com/global/samsung-marks-a-step-forward-with-ai-for-everyone-by-introducing-new-galaxy-a56-5g-galaxy-a36-5g-and-galaxy-a26-5g" \
  | grep -o '"datePublished":"[^"]*"'
```

## 7. Verification command (quoted output)

```console
$ node -e "const s=require('./public/data/specs.json');const m=require('./public/data/models.json');const ids=m.models.map(x=>x.id);console.log('keys',Object.keys(s.models).length,'expected',ids.length);console.log('missing ids',ids.filter(i=>!(i in s.models)));for(const k of ['display','screenInches','batteryMah','storage','ramGb','chipset','releaseYear'])console.log(k,Object.values(s.models).filter(v=>v[k]!=null&&(!Array.isArray(v[k])||v[k].length)).length+'/'+ids.length);"
keys 22 expected 22
missing ids []
display 22/22
screenInches 22/22
batteryMah 22/22
storage 22/22
ramGb 16/22
chipset 16/22
releaseYear 16/22
```

## 8. Write scope

Only these two files were created/modified by this thread:
`public/data/specs.json`, `docs/SPECS.md`. Scratch download/parse work stayed in `/tmp`
(`/tmp/pages2`, `/tmp/press`, `/tmp/im_*.xml`). `public/data/{latest,models,markets,fx,history}.json`,
`src/**`, `scripts/**`, `config/**`, `tests/**` and `.github/**` were not touched.
