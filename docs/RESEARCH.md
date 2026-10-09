# Retailer Reachability & Price-Extractability Research — TR / SA / AE / QA / OM / JO

**Scope:** upgrading the static Samsung Galaxy price-tracking site to cover Turkey (TR/TRY), Saudi Arabia (SA/SAR), UAE (AE/AED), Qatar (QA/QAR), Oman (OM/OMR), Jordan (JO/JOD).

**Method:** every claim below was verified live from this machine on **2026-10-09** using `curl`/Node `fetch` (static HTML) and headless Playwright (Chromium 1228, `~/Library/Caches/ms-playwright`). "Price location" means where the price string actually lives: **static HTML** (plain `curl`), **JSON-LD** (`<script type="application/ld+json">` present in static HTML), or **JS-render only** (needs a browser / AJAX API).

**Existing parser types** in `scripts/collect.mjs`: `jsonld`, `browser-text`, `amazon-search`. Below each candidate is annotated with which (if any) existing parser fits.

---

## Turkey (TR / TRY)

| id | country | base URL | search-URL template (model+variant) | HTTP status | price location | evidence |
|---|---|---|---|---|---|---|
| `hepsiburada` | tr | https://www.hepsiburada.com/ | `https://www.hepsiburada.com/ara?q={query}` → `?q=samsung+galaxy+a16` | 200 (Playwright); **403** (plain curl) | JS-render only (anti-bot on curl) | `Samsung Galaxy A16 128 GB 4 GB Ram (Samsung Türkiye Garantili) Siyah … 12.792,37 TL`; also `A16 128GB 6GB … 18.999,05 TL`, `A16 5G 256 GB … 22.175,56 TL` |
| `amazon-tr` | tr | https://www.amazon.com.tr/ | `https://www.amazon.com.tr/s?k={query}` → `?k=Samsung+Galaxy+A16` | 200 (Playwright) | JS-render (search grid) | observed `12.605,04 TL`, `18.999,00 TL`, `16.849,00 TL` |
| `samsung-tr` | tr | https://www.samsung.com/tr/ | `https://www.samsung.com/tr/smartphones/galaxy-a/` | 200 (Playwright) | JS-render | models `Galaxy A08, A27 5G, A37 5G, A52, A53 5G, A57 5G, A72`; prices `12.999,00 TL`, `20.499,00 TL`, `30.499,00 TL` |
| `vatan` | tr | https://www.vatanbilgisayar.com/ | `…/arama/samsung-galaxy-a16/` | **403** | — | Cloudflare challenge `Ray ID: a47e66cd79cb04e4` |
| `teknosa` | tr | https://www.teknosa.com/ | `…/arama/?q=samsung%20galaxy%20a16` | **403** | — | Cloudflare challenge `Ray ID: a47e67243b9facf8` |
| `mediamarkt-tr` | tr | https://www.mediamarkt.com.tr/ | `…/tr/search.html?query=samsung+galaxy+a16` | **403** | — | "Çok sayıda hatalı giriş yapıldı… doğrulamayı tamamlayın" |

**TR lineup (retail):** Hepsiburada lists **A07 5G, A16 (4G 128GB 4GB/6GB, 5G 256GB), A26, A36, A37 5G, A56** (A26/A36/A56 appear in charger-compatible listings). Samsung TR official store lists **A08, A27 5G, A37 5G, A57 5G** (+ older A52/A53/A72). **A06 is not prominently listed on Hepsiburada or Samsung TR** — treat as UNVERIFIED for TR.

---

## Saudi Arabia (SA / SAR) — *already partially working*

| id | country | base URL | search-URL template | HTTP status | price location | evidence |
|---|---|---|---|---|---|---|
| `jarir-sa` | sa | https://www.jarir.com/sa-en/ | product `…/sa-en/{slug}-{sku}.html`; search `…/sa-en/catalogsearch/result/?q={query}` | 200 (curl & Playwright) | **static HTML + JSON-LD** | `Samsung Galaxy A57 5G 256 GB` → JSON-LD `"offers":{"priceCurrency":"SAR","price":"1599.00"}`; rendered `SR 1,599` (was `SR 1,849`) |
| `amazon-sa` | sa | https://www.amazon.sa/ | `https://www.amazon.sa/s?k={query}` → `?k=Samsung+Galaxy+A16` | 200 (Playwright); **503 captcha** (curl) | JS-render (search grid) | `SAR999.00`, `SAR1,349.00`, `SAR1,599.00`, `SAR1,699.00`; titles incl. `Galaxy A16 … 4GB RAM, 128GB Storage … (KSA Version)`, `Galaxy A16 … 8GB RAM, 256GB Storage` |
| `extra-sa` | sa | https://www.extra.com/en-sa | `https://www.extra.com/en-sa/search?text={query}` | 200 (curl shell); **403 Cloudflare** (Playwright) | JS-render only (Unbxd `ss-unbxd-auk-extra-saudi-en-prod…`) | static HTML is a shell + template `{{= ubProduct.price }}`; no product price in static HTML |
| `samsung-sa` | sa | https://www.samsung.com/sa_en/ | `https://www.samsung.com/sa_en/smartphones/galaxy-a/` | 200 | JS-render | (official store) |

**SA lineup (VERIFIED, Jarir brand page `/sa-en/samsung`):** **A06, A06 5G, A07, A07 5G, A08, A15, A16, A16 5G, A17, A17 5G, A25 5G, A26 5G, A27 5G, A35 5G, A36 5G, A37 5G, A55 5G, A56 5G, A57 5G** + S23 FE/S23/S23 Ultra/S24 FE/S24+/S24 Ultra/S25 Edge/S25 FE/S25/S26. Amazon SA also carries **A06 (4G/5G, 64/128 GB)** and **A16 (4G 128 GB, 256 GB)** — matches the existing `config/sources.json` A06/A16/A57 targets.

---

## UAE (AE / AED)

| id | country | base URL | search-URL template | HTTP status | price location | evidence |
|---|---|---|---|---|---|---|
| `amazon-ae` | ae | https://www.amazon.ae/ | `https://www.amazon.ae/s?k={query}` → `?k=Samsung+Galaxy+A16` | 200 (Playwright) | JS-render (search grid) | `AED 1,199.00`, `AED 1,449.00`, `AED 1,689.00`; titles incl. `Galaxy A16 4G Android Smartphone, Super Amoled 6.7" … 128GB`, `Galaxy A16 Smartphone 128 GB Midnight Blue` |
| `jumbo-ae` | ae | https://www.jumbo.ae/ | product `…/samsung-galaxy-a07-4gb-5g-smartphone-black-128-gb.html`; search `…/catalogsearch/result/?q={query}` | 200 (curl & Playwright) | **static HTML + JSON-LD** (product pages) | `Samsung Galaxy A07 4GB 4G Smartphone, Black, 128 GB` → JSON-LD `"price":579, "currency":"AED"` (4 ld+json blocks in static HTML) |
| `sharafdg-ae` | ae | https://uae.sharafdg.com/ | `…/catalogsearch/result/?q={query}` | **403** | — | Cloudflare `server: cloudflare`, `cf-ray: a47e715cd8a99d7d`, `__cf_bm` |
| `jarir-ae` | ae | https://www.jarir.com/ae-en/ | product `…/ae-en/{slug}-{sku}.html` | 200 | static + JSON-LD (same as Jarir SA) | homepage Samsung links limited (`Galaxy S26` + iPhones/Honor) |
| `samsung-ae` | ae | https://www.samsung.com/ae/ | `https://www.samsung.com/ae/smartphones/galaxy-a/` | 200 | JS-render | models `Galaxy A07, A08, A18, A27 5G, A52, A53 5G, A55 5G, A72`; prices `659.00 AED`, `589.00 AED` |

**AE lineup (VERIFIED, Jumbo sitemap + product pages):** **A07 (64/128 GB), A17 (128 GB), A27 (128/256 GB), A37 (128/256 GB), A57 (128/256 GB)** + S22 Ultra, S25 Ultra (256/512 GB), S26 FE (256/512 GB), S26 Ultra (256/512 GB/1 TB). **No A06/A16/A26/A36/A56 phone listings on Jumbo** (checked full sitemap; those strings only appear as case/accessory SKUs). Amazon AE carries **A16 (4G 128 GB)**, A07, A17.

---

## Qatar (QA / QAR)

| id | country | base URL | search-URL template | HTTP status | price location | evidence |
|---|---|---|---|---|---|---|
| `jarir-qa` | qa | https://www.jarir.com/qa-en/ | product `…/qa-en/{slug}-{sku}.html`; category `…/qa-en/smartphones-x.html` | 200 (curl & Playwright) | **static HTML + JSON-LD** | `Samsung Galaxy A36 5G 256 GB Awesome Black` → JSON-LD `{"price":"1049.00","currency":"QAR"}`; rendered `QR 1,049` (was `QR 1,439`) |
| `amazon-ae` | qa | https://www.amazon.ae/ | `…/s?k={query}` | 200 (Playwright) | JS-render, **AED only** (no QAR) | AED prices (see AE section) |
| `lulu-qa` | qa | https://www.luluhypermarket.com/en-qa/ | — | **403** | — | Cloudflare `__cf_bm`, `cf-ray: a47e7160795cf4f8` |
| `samsung-qa` | qa | — | — | **404** | — | `samsung.com/qa`, `qa_en`, `qa_ar` all 404 — no dedicated Qatar storefront |

**QA lineup (VERIFIED, Jarir QA product URLs in `/qa-en/smartphones-x.html`):** **A36 5G (256 GB), A57 5G** + S25 Edge, S25 FE 5G, S25 Ultra, S26, S26 Ultra + iPhones. **No A06/A16/A-series-entry models in Qatar** (Jarir QA is the dominant QAR retailer; the facet sidebar lists all A-series names but only A36/A57 exist as actual products).

---

## Oman (OM / OMR)

| id | country | base URL | search-URL template | HTTP status | price location | evidence |
|---|---|---|---|---|---|---|
| `extra-om` | om | https://www.extra.com/en-om | `https://www.extra.com/en-om/search?text={query}` | 200 (curl shell); **403 Cloudflare** (Playwright) | JS-render only (Unbxd) | same shell/template as extra-sa |
| `sharafdg-om` | om | https://oman.sharafdg.com/ | — | **403** | — | Cloudflare `cf-ray: a47e715ee80eaf12` |
| `lulu-om` | om | https://www.luluhypermarket.com/en-om/ | — | **403** | — | Cloudflare `cf-ray: a47e715fc89972ce` |
| `amazon-ae` | om | https://www.amazon.ae/ | `…/s?k={query}` | 200 (Playwright) | JS-render, **AED only** (not OMR) | AED prices |
| `samsung-om` | om | — | — | **404** | — | `samsung.com/oman`, `om_en` all 404 — no Oman storefront |

**⚠ Oman has NO fetchable OMR-denominated price source** from the candidate list. All Oman-native retailers (eXtra Oman, SharafDG Oman, Lulu Oman) are Cloudflare/Unbxd-blocked for headless access, and there is no Samsung Oman storefront. **Closest fallback:** (a) eXtra Oman `https://www.extra.com/en-om/search?text=…` via a non-headless (headed) browser to defeat Cloudflare, or (b) use `amazon.ae` AED prices converted via FX as a proxy, or (c) mark Oman **"unavailable"** until a headed-browser path is acceptable.

---

## Jordan (JO / JOD)

| id | country | base URL | search-URL template | HTTP status | price location | evidence |
|---|---|---|---|---|---|---|
| `smartbuy-jo` | jo | https://smartbuy-me.com/ (redirects from smartbuy.jo) | `https://smartbuy-me.com/search?q={query}` → `?q=samsung+galaxy+a16` | 200 (Playwright); **429 rate-limit** (plain curl) | Shopify static-rendered (server HTML; needs browser UA to avoid 429) | `Sale price 409.000 JOD — Samsung A57 5G, 8GB & 256GB`; `239.000 JOD — Galaxy A27 5G 6/128`; `300.000 JOD — Galaxy A56 5G 8/256` |
| `orange-jo` | jo | https://eshop.orange.jo/ | web `https://eshop.orange.jo/en/search?q={query}`; **API (Algolia)** `https://R46O3IBY3F-dsn.algolia.net/1/indexes/orange_jo_personal/query` | 200 (web & API) | **Algolia JSON (machine-reachable, no key beyond public search key)** | `Samsung Galaxy A07 - 128GB,4GB` → `priceWithAttr:70`; `A07 - 64GB,4GB` → `60`; `Samsung Galaxy Z Flip 7,256GB,12GB` → `799` |
| `samsung-levant` | jo | https://www.samsung.com/levant/ | `https://www.samsung.com/levant/smartphones/galaxy-a/` | 200 | JS-render | title "Samsung Jordan"; models `Galaxy A07, A17, A27 5G, A52, A53 5G, A55 5G, A72`; prices `239.00 JD`, `190.00 JD`, `149.00 JD`, `100 JOD` |
| `cozmo-jo` | jo | https://cozmo.jo/ | — | 200 (homepage) | N/A | **grocery/hypermarket** (toys, homeware, food; `ProductDetails.php`); `/search?q=` and `/catalogsearch/result` render SPA "404". Not a phone retailer. |
| `carrefour-jo` | jo | https://www.carrefour.jo/ | — | **unreachable** | — | DNS resolves to `198.18.0.52` (reserved/sinkhole IP) → blocked at network/DNS level |

**JO lineup (VERIFIED, SmartBuy + Orange + Samsung Levant):** SmartBuy carries **A27 5G (6/128, 8/256), A37 5G (8/128, 8/256, 12/256), A56 5G (8/256), A57 5G (8/256, 12/512), S26 Ultra (12/256, 16/1TB)**. Orange Jordan carries **A07 (64/128 GB)** + Z Flip 7/Z Fold 7. Samsung Levant lists **A07, A17, A27 5G, A55 5G**. **No A06/A16 in any Jordan source.**

---

## Verified sources (summary)

| Country | Verified source | Currency | Extraction path | Price evidence |
|---|---|---|---|---|
| SA | Jarir (`jarir.com/sa-en`) | SAR | static HTML **JSON-LD** | A57 256GB `"price":"1599.00"` |
| SA | Amazon (`amazon.sa`) | SAR | Playwright search grid (`amazon-search`) | `SAR1,349.00` etc. |
| TR | Hepsiburada (`hepsiburada.com`) | TRY | Playwright rendered text (`browser-text`) | A16 128GB `12.792,37 TL` |
| TR | Amazon (`amazon.com.tr`) | TRY | Playwright search grid | `12.605,04 TL` |
| AE | Jumbo (`jumbo.ae`) | AED | static HTML **JSON-LD** | A07 128GB `"price":579` |
| AE | Amazon (`amazon.ae`) | AED | Playwright search grid | `AED 1,199.00` |
| QA | Jarir (`jarir.com/qa-en`) | QAR | static HTML **JSON-LD** | A36 256GB `"price":"1049.00"` |
| JO | SmartBuy (`smartbuy-me.com`) | JOD | Shopify server HTML (Playwright) | A57 8/256 `409.000 JOD` |
| JO | Orange (`eshop.orange.jo`) | JOD | **Algolia JSON API** | A07 128GB `priceWithAttr:70` |
| JO | Samsung Levant (`samsung.com/levant`) | JOD | JS-render (official) | `239.00 JD` |
| TR/SA/AE | Samsung official (`samsung.com/{tr,sa_en,ae}`) | TRY/SAR/AED | JS-render (official) | `12.999 TL` / `659 AED` |

**Per-country verified-source counts (price-bearing):** TR = 2 retailers + 1 official · SA = 2 + 1 · AE = 2 + 1 · QA = 1 · OM = **0** · JO = 3 (SmartBuy, Orange, Samsung Levant).

---

## Unavailable / blocked (list)

- **Cloudflare 403 (headless-blocked):** extra.com (SA `en-sa`, OM `en-om`), sharafdg.com (UAE + Oman), luluhypermarket.com (AE/QA/OM), vatanbilgisayar.com, teknosa.com. `mediamarkt.com.tr` (Akamai-style "too many failed logins").
- **Curl 403/429 but Playwright OK:** hepsiburada.com (403 on curl), smartbuy-me.com (429 Shopify on curl).
- **Amazon static curl = 503 captcha** (all amazon.*), Playwright required.
- **DNS sinkhole:** carrefour.jo → `198.18.0.52` (unreachable).
- **No storefront (404):** samsung.com/qa, /oman, /kw_en (only `ae`, `ae_ar`, `levant`, `sa_en`, `tr` exist).
- **Not a phone retailer:** cozmo.jo (grocery/hypermarket).
- **extra.com price model:** product prices are loaded client-side from **Unbxd** search API (`ss-unbxd-auk-extra-saudi-en-prod11541714990488`); the static HTML is a template shell with no product prices.

---

## FX source recommendation

**Recommended: `https://open.er-api.com/v6/latest/USD`** (free, no API key, machine-reachable).

Live sample (2026-10-09, trimmed to the currencies we need):

```json
{
  "result": "success",
  "provider": "https://www.exchangerate-api.com",
  "time_last_update_utc": "Fri, 09 Oct 2026 00:02:31 +0000",
  "time_next_update_utc": "Sat, 10 Oct 2026 00:25:01 +0000",
  "base_code": "USD",
  "rates": {
    "TRY": 49.278221,
    "SAR": 3.75,
    "AED": 3.6725,
    "QAR": 3.64,
    "OMR": 0.384497,
    "JOD": 0.709,
    "KWD": 0.310233
  }
}
```

- **Cadence:** ~24h (has an explicit `time_next_update_utc` field — observed ~1 day later).
- **License/limits:** free tier, no key; docs at `https://www.exchangerate-api.com/docs/free`. No hard rate-limit surfaced in the response; treat as once-per-run cacheable (not per-request).
- **Fallback (also keyless, CDN-hosted):** `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json` → `{"date":"2026-10-08","usd":{"try":49.2143635,"sar":3.75,"aed":3.6725,"qar":3.64,"omr":0.3848514,"jod":0.709,"kwd":0.31057123}}`. Daily update, MIT-licensed data project, no rate limit (jsDelivr CDN).
- **Rejected:** `api.exchangerate.host/latest` now requires `access_key` (`{"success":false,"error":{"code":101,"type":"missing_access_key"}}`). `api.frankfurter.app` only has `TRY` (no Gulf pegs).

---

## Assumptions & confidence

1. **All prices are "as observed" on 2026-10-09** and will drift; each retailer's price string is the exact text captured. Nothing was estimated or invented.
2. **"JS-render only"** sites (Hepsiburada, Amazon, Samsung official, Orange web) require headless Playwright; the existing `browser-text`/`amazon-search` parsers cover this. **"static HTML + JSON-LD"** sites (Jarir, Jumbo) can use the existing `jsonld` parser with no browser.
3. **Oman has no OMR source** and **Qatar's only QAR source is Jarir** (small A-series selection, no A06/A16). Recommend either (a) headed-browser support for eXtra Oman, or (b) AED-proxy pricing for OM, or (c) marking OM/QA A06/A16 as unavailable — a product decision, not research.
4. **Model lineup per country is derived from what the retailers actually list**, not from Samsung's global catalog. A06/A16 are only confirmed on-sale in **SA (Jarir + Amazon)** and **AE (Amazon AE, A16 only)**. TR/JO/QA/OM do **not** list A06 or A16 at the verified retailers.
5. Jarir's on-site `/catalogsearch/result/?q=` endpoint is **unreliable** (returns "0 results" for many valid queries); prefer the brand/category pages (`/sa-en/samsung`, `/qa-en/smartphones-x.html`) and direct product-slug URLs.
6. Orange Jordan's price field is `priceWithAttr` (= `priceWithOutTax`); `priceWithTax` is `0` in the search index, so use `priceWithAttr`. Prices are the operator's device prices (may include plan subsidies).
7. `carrefour.jo` resolves to a reserved sinkhole IP on this machine's DNS (`223.5.5.5`); it may be reachable on a different network/DNS — flagged, not confirmed blocked globally.
