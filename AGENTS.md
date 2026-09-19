# AGENTS.md

Context for coding agents. This repo is unusually well documented already —
**read `src/app/wmc-campaign-manager/README.md` before changing anything under
`src/`**. It is the authoritative description of the Walmart Connect (WMC)
Display Ads object hierarchy, the live/simulated modes, the Marketplace Items
API caveats, and which API paths are still unverified. This file does not
repeat it; it covers repo mechanics and hazards.

## What this is

A standalone Next.js 16 (App Router) / React 19 proof of concept: an
agency/advertiser campaign manager for Walmart Connect onsite Display Ads.
TypeScript, Tailwind v4. Default branch is `main`. Despite the repo name
("Repository for Walmart and Amazon Ads integrations"), there is currently
**no Amazon code** — WMC only.

## Commands

```bash
npm install
npm run dev        # next dev, http://localhost:3000
npm run build
npm start
npm run typecheck  # tsc --noEmit — this one works, use it
```

`npm run lint` is defined as `next lint`, but **there is no ESLint dependency
and no ESLint config in the repo**, so it does not work as-is. `typecheck` is
the real static gate here.

There are no automated tests. `scripts/wmc-test-call.sh` is a manual,
out-of-band script for firing one signed request at Walmart's sandbox from the
terminal; it does not need the app running and is not a test suite.

## CI and deploy

No `.github/` directory — no GitHub Actions, no required checks, no PR
template, no CODEOWNERS. Nothing runs on a PR or on merge, and nothing here
deploys automatically.

## Layout

- `src/app/page.tsx` — redirects to the campaign manager
- `src/app/wmc-campaign-manager/` — the wizard + monitoring UI (and its README)
- `src/app/api/v1/wmc/{campaigns,ad-groups,creatives,creative-associations,products,snapshot}/`
  — server route handlers; the browser never sees WMC credentials
- `src/server/wmc/` — `client.ts` (RSA request signing), `simulator.ts`
  (in-memory sandbox), `types.ts`
- `src/lib/`, `src/components/`

## The simulated/live switch is the main hazard

Default is **simulated**: `WMC_SIMULATE=true`, an in-memory sandbox, no
network calls, no credentials needed. Everything below only applies once you
flip it.

- Setting `WMC_SIMULATE=false` makes `src/server/wmc/client.ts` issue **real
  authenticated requests to Walmart**, including mutations (campaign and ad
  group creation, pause/resume, creative submission). There is no dry-run
  flag. Confirm which host you are pointed at before running anything.
- Live mode needs **all** of `WMC_ADS_API_URL`, `WMC_ADVERTISER_ID`,
  `WMC_ACCESS_TOKEN`, `WMC_CONSUMER_ID`, `WMC_KEY_VERSION`, `WMC_PRIVATE_KEY`
  together. Missing any one falls back to simulated, which is easy to
  misread as "live mode works".
- `WMC_ACCESS_TOKEN` (bearer, issued by Walmart) and `WMC_PRIVATE_KEY` (RSA
  PEM you generate locally, never sent to Walmart) are **two different
  secrets** and are routinely conflated. Both are required on every live
  request — they are not alternatives.
- The base URL commented in `.env.example` is Walmart's **staging/sandbox**
  Display host (`developer.api.us.stg.walmart.com`). The product-lookup
  example, `https://marketplace.walmartapis.com`, is a **production** Walmart
  Marketplace host — it is a different API surface with different auth (token
  only, no RSA signature) and no sandbox equivalent given here. Do not point
  local experimentation at it casually.
- The doubled `/api/v1` in the sandbox base URL is intentional: staging bakes
  one into the base and each route appends its own. Removing it will 404.
- Per the campaign-manager README, the creative create/associate paths and the
  snapshot polling path are **assumed, not verified** against Walmart's docs.
  Check them against your onboarding pack before a live demo.

## Traps

- **This repository is public on GitHub.** The root README says so, and it is
  correct. `.env` is gitignored, but `git status` before every commit is not
  optional here — a leaked Walmart credential would be world-readable
  immediately. Never paste a real token, Consumer ID or PEM into source,
  fixtures, tests, commit messages or issues.
- The UI's **Connection** panel lets an end user supply their own advertiser
  ID and access token; these travel as `x-wmc-advertiser-id` /
  `x-wmc-access-token` request headers and are deliberately not persisted.
  Don't add logging that would capture them.
- `advertiserId` is injected into mutation bodies **server-side** in the API
  routes, not by the client. Don't also send it from the browser.
- The simulator is deliberately deterministic (fixed metrics per
  campaign/date, inline SVG data-URI product images, no outbound calls). If a
  change makes simulated output vary run to run, that is a regression.
  Curated test SKUs: `GRILL-PROCHEF-4B`, `SAUCE-HICKORY-3PK`, `TOOLSET-SS-5PC`,
  `PB-ORGANIC-2PK`, `PASTA-WG-FAM`; any other alphanumeric SKU is generated.
- The asset library (`src/lib/mock-assets.ts`) is a local mock by design, not
  a stubbed-out integration waiting to be finished.
- `next.config.mjs` is empty — no `ignoreBuildErrors` escape hatch, so type
  errors **do** fail `npm run build` here (unlike sibling Kargo prototypes).
