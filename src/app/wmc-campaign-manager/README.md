# WMC Campaign Manager (POC)

End-to-end proof of concept for an agency/advertiser to set up and monitor a
Walmart Connect **onsite Display** campaign via the
[WMC Display Ads APIs](https://developer.walmart.com/advertising-partners/docs/introduction-to-walmart-connect-ads-apis).

## What it does

**Campaign Setup wizard** — walks the Display Ads object hierarchy, committing
each step against the API and threading the returned IDs forward:

1. `POST /api/v1/campaigns` — display campaign (`campaignType: "ngd"`), with
   objective (awareness/engagement/conversion), media type (banner/video),
   daily-or-total budget and delivery speed. Enforces documented rules: unique
   name ≤240 chars, video → awareness only, no frontloaded pacing with daily
   budgets, budget at campaign OR ad group level.
2. `POST /api/v1/adGroups` — ad group with CPM `maxBid`, frequency caps,
   creative rotation mode, and the **targeting object embedded in the same
   call** (flattened include/exclude structure): keywords (BROAD/EXACT),
   contextual category + reach tier (tier_1–tier_7), or run-of-site.
3. Product lookup (optional) — enter a seller SKU; `GET /api/v1/wmc/products`
   pulls product name, price, and (best-effort) description/keywords/images.
   Select one or more images to auto-populate creative rows (name, click URL
   → the product page, asset URL → the selected image). Skippable if you'd
   rather add creatives manually.
4. Creatives — create banner/video creatives (name, ad size, click URL, asset
   URL) and associate them to the ad group. New creatives enter Walmart
   creative review (`reviewStatus: pending`). You can also pick from a small
   local asset library instead of typing a URL by hand (see below).
5. Review — display campaigns deliver during their flight window once
   creatives clear review; there is no separate "launch" call.

**Monitoring dashboard**:

- Campaign list with pause/resume (`GET`/`PUT /api/v1/campaigns`) and a
  pending-creative-review banner
- Async snapshot reports (`POST /api/v1/snapshot/report`, then polling by
  `snapshotId`) by campaign, lineItem (ad group), or creative — with a 14-day
  spend-vs-sales trend, viewability, CTR, ROAS, and new-buyer columns.
  Report dates exclude the current date (display data lags 24–48h) and
  snapshot IDs expire after 24 hours, both mirrored by the sandbox.
- An "API activity" panel showing every WMC call the session makes

## Architecture

- UI: [`WmcCampaignManagerView.tsx`](./WmcCampaignManagerView.tsx), the
  default route for this app (see `src/app/page.tsx`).
- Server proxy: `src/app/api/v1/wmc/*` route handlers, so WMC credentials
  never reach the browser. Mutations get `advertiserId` (numeric) injected
  into each body object server-side, per the Display API contract.
- WMC client: `src/server/wmc/client.ts` — builds the Walmart consumer-
  signature headers (`WM_CONSUMER.ID`, RSA-SHA256 `WM_SEC.AUTH_SIGNATURE`,
  `WM_CONSUMER.INTIMESTAMP`, `WM_SEC.KEY_VERSION`) plus the
  `Authorization: Bearer` token — both required together, per Walmart's
  Partner Operating Guide.
- Simulator: `src/server/wmc/simulator.ts` — an in-memory Display sandbox
  mirroring the real contracts (mutation result arrays, documented validation
  rules, CPM economics, async snapshot jobs) so the POC runs with no
  credentials. Metrics are deterministic per campaign/date. Also includes a
  small product catalog (a few curated SKUs plus a deterministic generic
  generator for any other alphanumeric SKU) with inline SVG data-URI
  placeholder images — no external network calls. Try `GRILL-PROCHEF-4B`,
  `SAUCE-HICKORY-3PK`, `TOOLSET-SS-5PC`, `PB-ORGANIC-2PK`, or `PASTA-WG-FAM`
  for the curated set — any other alphanumeric SKU generates a plausible
  product on the fly.

## Asset library is a local mock, not a live integration

The "Select from Asset Library" button (`src/lib/mock-assets.ts`,
`src/components/ui/library-picker-modal.tsx`) is a small **local, in-memory**
sample library — a handful of inline SVG placeholder images, no network
calls. This intentionally does **not** integrate with any external creative
DAM/asset-management system: this repo is meant to run standalone, and any
real integration would require its own auth flow and API contract specific
to whichever system you plug in. Swap `MOCK_LIBRARY_ASSETS` for a real
fetch-backed implementation if you wire this up to an actual asset library.

## Product lookup is the Marketplace Items API — read this before a live demo

The "enter a SKU" step (`src/app/api/v1/wmc/products/route.ts`) is **not**
part of the Display Ads API — it's the
[Walmart Marketplace Items API](https://developer.walmart.com/us-marketplace/reference/getallitems)
(`GET https://marketplace.walmartapis.com/v3/items?sku=...`), a seller
item-management surface, confirmed against Walmart's docs:

- **SKU is seller-assigned**, an arbitrary alphanumeric string (not Walmart's
  numeric item ID). Special characters (`: / ? # [ ] @ ! $ & ' ( ) * + , ; = { } %`
  and spaces) must be URL-encoded per the [Update Inventory](https://developer.walmart.com/us-marketplace/reference/updateinventoryforanitem)
  docs — this route encodes the query param automatically.
- Auth is a pre-obtained `WM_SEC.ACCESS_TOKEN` (from the separate Marketplace
  Token API, not implemented here) plus `WM_QOS.CORRELATION_ID` and
  `WM_SVC.NAME` headers — **no RSA signature**, unlike the Display Ads client.
- **The confirmed `ItemResponse` schema only guarantees**: `sku`, `wpid`
  (Walmart's own item ID, once published/matched), `productName`,
  `productType`, `price`, `publishedStatus`, `lifecycleStatus`,
  `variantGroupInfo`. **There is no fixed title/description/image field.**
  Marketing content (description, images, brand) lives in a per-category
  `additionalAttributes` bag whose keys vary by Walmart product-type spec.

Because of that last point, live-mode extraction in `normalizeLiveProduct()`
is deliberately best-effort: it scans `additionalAttributes` for keys
containing `description`, `image`, `brand`, or `keyword`/`tag`, and sets
`contentComplete: false` (surfaced as a banner in the UI) when nothing usable
is found — it does **not** fabricate a placeholder in live mode the way
simulated mode does. Verify the actual attribute names against your seller
account's item spec for its taxonomy node before relying on this in a live
demo; they will differ by category.

## Modes

- **Simulated (default)** — `WMC_SIMULATE=true`, or any of the live
  credentials below are missing.
- **Live** — set in `.env` (see `.env.example`): `WMC_SIMULATE=false` plus
  **all** of `WMC_ADS_API_URL`, `WMC_ADVERTISER_ID`, `WMC_ACCESS_TOKEN`,
  `WMC_CONSUMER_ID`, `WMC_KEY_VERSION`, `WMC_PRIVATE_KEY`. Per Walmart's
  Partner Operating Guide, these are required **together** on every request —
  the bearer token and the RSA signature are two independent, simultaneously
  required pieces, not alternatives. `WMC_ACCESS_TOKEN` is the plain "auth
  token" Walmart hands you directly; `WMC_PRIVATE_KEY` is the RSA private key
  *you* generate locally via `openssl` (only its public half is ever uploaded
  to Walmart) — these are two different secrets, easy to conflate since a
  Partner Network sandbox key-issuance screen only surfaces the former. End
  users can also enter their own advertiser ID + access token in the UI's
  **Connection** panel; these are forwarded per request
  (`x-wmc-advertiser-id` / `x-wmc-access-token` headers) and never stored.

## Live-mode caveats

Campaign, ad group (incl. targeting object), and snapshot-report contracts
follow the published Display docs, and the confirmed **Display Sandbox base
URL** from the Partner Operating Guide is
`https://developer.api.us.stg.walmart.com/api-proxy/service/display/api/v1`
(note the `.us.` segment, and that staging bakes one `/api/v1` into the base
itself — each route then appends its own `/api/v1/<endpoint>` on top,
matching the guide's own doubled-path example URLs). Two things remain
unverified and should be checked against your onboarding pack before a live
demo:

- Creative create/associate paths (assumed `/api/v1/creatives` and
  `/api/v1/adGroups/creatives` — the guide's Postman collection is Sponsored
  Search only; "we are currently working on building an API collection for
  Display APIs" as of this guide's writing)
- The snapshot polling path (assumed `GET /api/v1/snapshot?snapshotId=`)
