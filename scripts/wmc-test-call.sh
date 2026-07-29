#!/usr/bin/env bash
# Manual WMC Display Ads API test call, per the Partner Operating Guide.
#
# Generates a fresh WM_SEC.AUTH_SIGNATURE + WM_CONSUMER.INTIMESTAMP (valid
# ~300 seconds) from the credentials in .env, then makes a signed
# GET /campaigns request. Re-run any time — do not reuse output from a
# previous run, since the signature will have expired.
#
# Usage: ./scripts/wmc-test-call.sh
set -euo pipefail

cd "$(dirname "$0")/.."  # repo root, so `node -e` can resolve dotenv

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE (copy .env.example to .env and fill in your sandbox credentials)" >&2
  exit 1
fi

# Ask Node (dotenv from node_modules — run `npm install` first) to compute
# the signed request pieces and print them as shell-assignable lines. Doing
# the RSA signing in Node keeps this in sync with src/server/wmc/client.ts's
# exact canonical string.
eval "$(node -e "
require('dotenv').config({ path: '$ENV_FILE' });
const crypto = require('crypto');

const consumerId = process.env.WMC_CONSUMER_ID;
const privateKey = process.env.WMC_PRIVATE_KEY;
const keyVersion = process.env.WMC_KEY_VERSION || '1';
const accessToken = process.env.WMC_ACCESS_TOKEN;
const advertiserId = process.env.WMC_ADVERTISER_ID;
const baseUrl = (process.env.WMC_ADS_API_URL || '').replace(/\/\$/, '');

if (!consumerId || !privateKey || !accessToken || !baseUrl) {
  console.error('Missing one of WMC_CONSUMER_ID / WMC_PRIVATE_KEY / WMC_ACCESS_TOKEN / WMC_ADS_API_URL in $ENV_FILE');
  process.exit(1);
}

const timestamp = Date.now().toString();
const canonical = consumerId + '\n' + timestamp + '\n' + keyVersion + '\n';
const signer = crypto.createSign('RSA-SHA256');
signer.update(canonical);
const signature = signer.sign(privateKey, 'base64');

const esc = (s) => \"'\" + String(s).replace(/'/g, \"'\\\\''\") + \"'\";
console.log('CONSUMER_ID=' + esc(consumerId));
console.log('ACCESS_TOKEN=' + esc(accessToken));
console.log('KEY_VERSION=' + esc(keyVersion));
console.log('ADVERTISER_ID=' + esc(advertiserId));
console.log('BASE_URL=' + esc(baseUrl));
console.log('TIMESTAMP=' + esc(timestamp));
console.log('SIGNATURE=' + esc(signature));
")"

CORRELATION_ID="$(uuidgen)"

echo "Request:"
echo "  GET ${BASE_URL}/api/v1/campaigns?advertiserId=${ADVERTISER_ID}"
echo "  WM_CONSUMER.INTIMESTAMP: ${TIMESTAMP}"
echo "  WM_QOS.CORRELATION_ID:   ${CORRELATION_ID}"
echo

curl -s -i -X GET \
  "${BASE_URL}/api/v1/campaigns?advertiserId=${ADVERTISER_ID}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "WM_CONSUMER.ID: ${CONSUMER_ID}" \
  -H "WM_CONSUMER.INTIMESTAMP: ${TIMESTAMP}" \
  -H "WM_SEC.KEY_VERSION: ${KEY_VERSION}" \
  -H "WM_SEC.AUTH_SIGNATURE: ${SIGNATURE}" \
  -H "WM_QOS.CORRELATION_ID: ${CORRELATION_ID}" \
  --compressed
