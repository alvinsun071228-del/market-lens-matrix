# Market Lens Price API

The static JSON endpoint is available at:

`/market-lens-matrix/api/prices.json`

It returns `apiVersion`, `mode`, `collectedAt`, `week`, `sourceCount`, `failedSources`, and normalized `records`. Each record uses `country`, `model`, `channel`, `variant`, `week`, `price`, `state`, `collectedAt`, and `sourceUrl`.

The endpoint is refreshed by the `Collect Market Prices` GitHub Actions workflow every six hours. `mode: "demo"` means no enabled source has produced a valid live price yet; carried prices remain marked by `state: "missing"` or `state: "invalid"`.
