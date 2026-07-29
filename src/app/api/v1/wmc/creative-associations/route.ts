import { NextRequest } from 'next/server';
import {
  readJsonBody,
  resolveWmcContext,
  wmcErrorResponse,
  wmcFetch,
  wmcJson,
} from '../../../../../server/wmc/client';
import * as simulator from '../../../../../server/wmc/simulator';
import type {
  WmcCreativeAssociation,
  WmcMutationResult,
} from '../../../../../server/wmc/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ad group <-> creative associations ("Add Creatives to Ad Groups" in the WMC
 * Display docs). Verify the live path against your partner onboarding pack.
 */
export async function GET(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  const adGroupId = request.nextUrl.searchParams.get('adGroupId');
  try {
    if (ctx.mode === 'simulated') {
      return wmcJson(
        simulator.listAssociations(adGroupId ? Number(adGroupId) : undefined),
        ctx,
      );
    }
    const associations = await wmcFetch<WmcCreativeAssociation[]>(
      ctx,
      '/api/v1/adGroups/creatives',
      { query: { advertiserId: ctx.advertiserId, adGroupId: adGroupId ?? undefined } },
    );
    return wmcJson(associations, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  const body = await readJsonBody<{ adGroupId?: number; creativeIds?: number[] }>(
    request,
  );
  if (!body?.adGroupId || !Array.isArray(body.creativeIds) || body.creativeIds.length === 0) {
    return wmcJson({ error: 'adGroupId and a non-empty creativeIds array are required' }, ctx, 400);
  }
  try {
    if (ctx.mode === 'simulated') {
      return wmcJson(
        simulator.associateCreatives(body.adGroupId, body.creativeIds),
        ctx,
      );
    }
    const results = await wmcFetch<WmcMutationResult[]>(
      ctx,
      '/api/v1/adGroups/creatives',
      {
        method: 'POST',
        body: body.creativeIds.map((creativeId) => ({
          advertiserId: ctx.advertiserId,
          adGroupId: body.adGroupId,
          creativeId,
        })),
      },
    );
    return wmcJson(results, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}
