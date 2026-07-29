import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveProductApiContext } from '../../../../../server/wmc/client';
import * as simulator from '../../../../../server/wmc/simulator';
import type { WmcProduct } from '../../../../../server/wmc/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Product lookup by seller SKU so a user can pull title, description,
 * keywords, and images to seed a creative. This is the Walmart Marketplace
 * Items API (seller item management) — a different surface than Display
 * Ads — see the module README for the live-mode field-mapping caveats.
 */
export async function GET(request: NextRequest) {
  const sku = request.nextUrl.searchParams.get('sku')?.trim();
  if (!sku) {
    return NextResponse.json({ error: 'sku is required' }, { status: 400 });
  }

  const ctx = resolveProductApiContext();

  if (ctx.mode === 'simulated') {
    const product = simulator.lookupProduct(sku);
    if (!product) {
      return NextResponse.json(
        { error: `"${sku}" is not a valid SKU (alphanumeric, 2-64 chars)` },
        { status: 404, headers: { 'x-wmc-mode': 'simulated' } },
      );
    }
    return NextResponse.json(product, {
      headers: { 'Cache-Control': 'no-store', 'x-wmc-mode': 'simulated' },
    });
  }

  try {
    const url = new URL(`${ctx.baseUrl}/v3/items`);
    url.searchParams.set('sku', sku);
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'WM_SEC.ACCESS_TOKEN': ctx.accessToken,
        'WM_QOS.CORRELATION_ID': crypto.randomUUID(),
        'WM_SVC.NAME': ctx.svcName,
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Marketplace Items API returned ${response.status}` },
        { status: response.status, headers: { 'x-wmc-mode': 'live' } },
      );
    }
    const raw = (await response.json()) as Record<string, unknown>;
    const items = Array.isArray(raw.ItemResponse) ? raw.ItemResponse : [raw];
    const first = items[0] as Record<string, unknown> | undefined;
    if (!first) {
      return NextResponse.json(
        { error: `No item found for SKU "${sku}"` },
        { status: 404, headers: { 'x-wmc-mode': 'live' } },
      );
    }
    return NextResponse.json(normalizeLiveProduct(first, sku), {
      headers: { 'Cache-Control': 'no-store', 'x-wmc-mode': 'live' },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected product API error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Maps a Marketplace ItemResponse onto WmcProduct. Confirmed top-level
 * fields: sku, wpid, productName, productType, price, publishedStatus,
 * lifecycleStatus. Description/images/brand are NOT guaranteed top-level
 * fields — they live in a per-category `additionalAttributes` bag, so this
 * scans it best-effort by attribute name and sets `contentComplete: false`
 * when nothing usable is found (rather than fabricating a placeholder).
 */
function normalizeLiveProduct(
  raw: Record<string, unknown>,
  fallbackSku: string,
): WmcProduct {
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value : undefined;

  const sku = str(raw.sku) ?? fallbackSku;
  const wpid = str(raw.wpid);
  const name = str(raw.productName) ?? sku;
  const productType = str(raw.productType);
  const publishedStatus =
    raw.publishedStatus === 'PUBLISHED' || raw.publishedStatus === 'UNPUBLISHED'
      ? raw.publishedStatus
      : undefined;
  const lifecycleStatus =
    raw.lifecycleStatus === 'ACTIVE' ||
    raw.lifecycleStatus === 'ARCHIVED' ||
    raw.lifecycleStatus === 'RETIRED'
      ? raw.lifecycleStatus
      : undefined;
  const priceObj = raw.price as Record<string, unknown> | undefined;
  const amount =
    typeof priceObj?.amount === 'number'
      ? priceObj.amount
      : typeof priceObj?.amount === 'string'
        ? Number(priceObj.amount)
        : undefined;
  const price = amount !== undefined && !Number.isNaN(amount)
    ? { amount, currency: str(priceObj?.currency) ?? 'USD' }
    : undefined;

  const attributes = flattenAttributes(raw.additionalAttributes);
  const findByHint = (hints: string[]): string | undefined => {
    for (const [key, value] of attributes) {
      const lowerKey = key.toLowerCase();
      if (hints.some((hint) => lowerKey.includes(hint))) return value;
    }
    return undefined;
  };

  const shortDescription = findByHint(['shortdescription', 'description']);
  const brandName = findByHint(['brand']);
  const mainImage = findByHint(['mainimage', 'primaryimage', 'largeimage', 'image']);
  const additionalImages = attributes
    .filter(([key]) => key.toLowerCase().includes('image'))
    .map(([, value]) => value)
    .filter((value) => value !== mainImage);
  const keywordAttr = findByHint(['keyword', 'keyfeature', 'tag']);

  const contentComplete = Boolean(shortDescription && mainImage);

  return {
    sku,
    wpid,
    name,
    productType,
    price,
    publishedStatus,
    lifecycleStatus,
    brandName,
    shortDescription,
    keywords: keywordAttr
      ? keywordAttr.split(/[,;]/).map((k) => k.trim()).filter(Boolean)
      : simulator.buildKeywords(name, brandName, productType),
    images: {
      thumbnail: mainImage ?? '',
      medium: mainImage ?? '',
      large: mainImage ?? '',
    },
    additionalImages: additionalImages.length ? additionalImages : undefined,
    productTrackingUrl: wpid
      ? `https://www.walmart.com/ip/${wpid}`
      : `https://www.walmart.com/search?query=${encodeURIComponent(sku)}`,
    contentComplete,
  };
}

/** additionalAttributes may be an object map or a NameValueAttributes-style
 * array; normalize either into [key, value] string pairs. */
function flattenAttributes(value: unknown): Array<[string, string]> {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          const name = record.name;
          const val = Array.isArray(record.values) ? record.values[0] : record.value;
          if (typeof name === 'string' && typeof val === 'string') {
            return [name, val] as [string, string];
          }
        }
        return null;
      })
      .filter((pair): pair is [string, string] => pair !== null);
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).filter(
      (pair): pair is [string, string] => typeof pair[1] === 'string',
    );
  }
  return [];
}
