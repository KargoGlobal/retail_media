# Retail Media

Repository for Walmart and Amazon Ads integrations.

Currently contains a standalone proof of concept: an **agency/advertiser
campaign manager for Walmart Connect (WMC) Display Ads** — set up and
monitor an onsite display campaign end-to-end against Walmart's real API
contracts (or a built-in local simulator, no credentials required).

## Quick start

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) — it redirects to
the campaign manager. Runs entirely against the local simulator by default;
no Walmart credentials needed to try it out.

## What's here

- `src/app/wmc-campaign-manager/` — the campaign setup wizard + monitoring
  dashboard UI. See its own [README](./src/app/wmc-campaign-manager/README.md)
  for full details on the workflow, live-mode credential requirements, and
  known caveats.
- `src/app/api/v1/wmc/*` — server-side API routes that proxy to Walmart's
  real Display Ads API in live mode, or the local simulator otherwise.
- `src/server/wmc/` — the WMC API client (RSA request signing),
  types, and the in-memory simulator.
- `scripts/wmc-test-call.sh` — a standalone script for manually testing a
  signed request against Walmart's sandbox from the terminal, independent of
  the running app. See usage notes in the script itself.

## Going live against Walmart's sandbox/production API

1. Complete Walmart's Partner Network onboarding to get a Consumer ID,
   access token, and key version, and generate your own RSA keypair via
   `openssl` (only the *public* key gets uploaded to Walmart — see their
   Partner Operating Guide for exact commands).
2. Copy `.env.example` to `.env` and fill in the credentials — see the
   comments there and in [`src/server/wmc/client.ts`](./src/server/wmc/client.ts)
   for exactly which secret goes where (the bearer token and the RSA private
   key are two different things, easy to mix up).
3. Set `WMC_SIMULATE=false` and restart the dev server.
4. Test with `./scripts/wmc-test-call.sh`, or directly in the running app.

`.env` is gitignored — never commit real credentials. This repo is public;
double-check `git status` before committing if you've been experimenting
with live credentials locally.
