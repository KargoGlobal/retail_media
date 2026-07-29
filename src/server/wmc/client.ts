import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side client for the Walmart Connect Display Ads API.
 * https://developer.walmart.com/advertising-partners/docs/introduction-to-walmart-connect-ads-apis
 *
 * Confirmed against Walmart's Partner Operating Guide (Partner Network
 * onboarding): live mode requires ALL of the following together on every
 * request — there is no bearer-only or signature-only mode:
 *   - Authorization: Bearer <auth_token>  — a plain bearer token Walmart
 *     issues you (WMC_ACCESS_TOKEN); it plays no part in the signature.
 *   - WM_CONSUMER.ID (WMC_CONSUMER_ID) + WM_SEC.KEY_VERSION (WMC_KEY_VERSION)
 *     — also issued by Walmart, matched to your auth token.
 *   - WM_SEC.AUTH_SIGNATURE — RSA-SHA256 signature (WMC_PRIVATE_KEY) over
 *     "<consumerId>\n<timestamp>\n<keyVersion>\n", base64-encoded. This key
 *     is generated locally via openssl and never sent to Walmart — only its
 *     public half is uploaded to the Partner Onboarding Hub. It is a
 *     DIFFERENT secret from the auth token; the guide's own Java/Python
 *     signing examples never reference the auth token at all.
 *   - WM_CONSUMER.INTIMESTAMP — epoch millis for the same instant as the
 *     signature (valid ~300 seconds).
 *   - WM_QOS.CORRELATION_ID — a fresh UUID per request.
 * When any of these is missing — or WMC_SIMULATE=true — routes fall back to
 * the in-memory simulator so the POC runs end-to-end without a WMC account.
 *
 * Set WMC_ADS_API_URL to the Display API base host from your partner
 * onboarding pack. Per the guide, the confirmed Display **sandbox** base is
 * `https://developer.api.us.stg.walmart.com/api-proxy/service/display/api/v1`
 * — note the `.us.` segment, and that staging bakes one `/api/v1` into the
 * base itself; the guide's own example URL then appends a second `/api/v1/…`
 * for the endpoint (e.g. `.../api/v1/api/v1/snapshot/entity`), which is why
 * this base already includes a trailing `/api/v1` on top of the routes
 * below each requesting their own `/api/v1/...` path.
 */

const DEFAULT_BASE_URL =
  'https://developer.api.walmart.com/api-proxy/service/display';

export type WmcContext =
  | {
      mode: 'live';
      baseUrl: string;
      advertiserId: number;
      accessToken: string;
      consumerId: string;
      privateKey: string;
      keyVersion: string;
    }
  | {
      mode: 'simulated';
      advertiserId: number;
    };

/**
 * Resolve credentials for this request. The UI can pass the end user's own
 * credentials per request (agency use case); env vars act as server defaults.
 */
export function resolveWmcContext(request: NextRequest): WmcContext {
  // Display API advertiser IDs are numeric; default to 1 for the sandbox.
  const advertiserId =
    Number(
      request.nextUrl.searchParams.get('advertiserId')?.trim() ||
        request.headers.get('x-wmc-advertiser-id')?.trim() ||
        process.env.WMC_ADVERTISER_ID?.trim(),
    ) || 1;

  const accessToken =
    request.headers.get('x-wmc-access-token')?.trim() ||
    process.env.WMC_ACCESS_TOKEN?.trim();
  const consumerId = process.env.WMC_CONSUMER_ID?.trim();
  const privateKey = process.env.WMC_PRIVATE_KEY?.trim();
  const keyVersion = process.env.WMC_KEY_VERSION?.trim() || '1';

  // Per the guide, all three of these are required together — there is no
  // partial/bearer-only live mode.
  const simulate =
    process.env.WMC_SIMULATE === 'true' ||
    !accessToken ||
    !consumerId ||
    !privateKey;

  if (simulate) {
    return { mode: 'simulated', advertiserId };
  }

  return {
    mode: 'live',
    baseUrl: (process.env.WMC_ADS_API_URL?.trim() || DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    ),
    advertiserId,
    accessToken,
    consumerId,
    privateKey,
    keyVersion,
  };
}

/**
 * Walmart consumer-signature scheme: RSA-SHA256 over
 * "<consumerId>\n<timestamp>\n<keyVersion>\n", base64-encoded — matches the
 * Partner Operating Guide's Java/Python signing examples exactly.
 */
function buildAuthSignature(
  consumerId: string,
  privateKey: string,
  timestamp: string,
  keyVersion: string,
): string {
  const canonical = `${consumerId}\n${timestamp}\n${keyVersion}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(canonical);
  const pem = privateKey.includes('BEGIN')
    ? privateKey
    : `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
  return signer.sign(pem, 'base64');
}

function buildHeaders(ctx: Extract<WmcContext, { mode: 'live' }>): Record<string, string> {
  const timestamp = Date.now().toString();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ctx.accessToken}`,
    'WM_QOS.CORRELATION_ID': crypto.randomUUID(),
    'WM_CONSUMER.ID': ctx.consumerId,
    'WM_CONSUMER.INTIMESTAMP': timestamp,
    'WM_SEC.KEY_VERSION': ctx.keyVersion,
    'WM_SEC.AUTH_SIGNATURE': buildAuthSignature(
      ctx.consumerId,
      ctx.privateKey,
      timestamp,
      ctx.keyVersion,
    ),
  };
}

export class WmcApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'WmcApiError';
  }
}

export async function wmcFetch<T>(
  ctx: Extract<WmcContext, { mode: 'live' }>,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  // Mutations carry advertiserId in each body object; reads pass it via
  // options.query. Nothing is appended implicitly.
  const url = new URL(`${ctx.baseUrl}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: buildHeaders(ctx),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    throw new WmcApiError(
      `Walmart Connect API returned ${response.status} for ${options.method ?? 'GET'} ${path}`,
      response.status,
      parsed,
    );
  }
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

export function wmcJson(
  data: unknown,
  ctx: WmcContext,
  status = 200,
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'x-wmc-mode': ctx.mode,
    },
  });
}

export function wmcErrorResponse(error: unknown): NextResponse {
  if (error instanceof WmcApiError) {
    return NextResponse.json(
      { error: error.message, details: error.body },
      { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
    );
  }
  const message =
    error instanceof Error ? error.message : 'Unexpected Walmart Connect error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function readJsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Product lookup by SKU lives on the Walmart Marketplace Items API
 * (GET https://marketplace.walmartapis.com/v3/items?sku=...) — seller item
 * management, a different surface from Display Ads. Auth is a pre-obtained
 * WM_SEC.ACCESS_TOKEN (from the separate Marketplace Token API, not
 * implemented here) plus a WM_SVC.NAME service name header — no RSA
 * signature like the Ads API above. Configure WMC_PRODUCT_ACCESS_TOKEN +
 * WMC_PRODUCT_SVC_NAME for live mode; either unset falls back to the
 * simulated catalog.
 */
const DEFAULT_MARKETPLACE_BASE_URL = 'https://marketplace.walmartapis.com';

export type ProductApiContext =
  | { mode: 'live'; baseUrl: string; accessToken: string; svcName: string }
  | { mode: 'simulated' };

export function resolveProductApiContext(): ProductApiContext {
  const accessToken = process.env.WMC_PRODUCT_ACCESS_TOKEN?.trim();
  const svcName = process.env.WMC_PRODUCT_SVC_NAME?.trim();
  if (!accessToken || !svcName) return { mode: 'simulated' };
  const baseUrl = (
    process.env.WMC_PRODUCT_API_URL?.trim() || DEFAULT_MARKETPLACE_BASE_URL
  ).replace(/\/$/, '');
  return { mode: 'live', baseUrl, accessToken, svcName };
}
