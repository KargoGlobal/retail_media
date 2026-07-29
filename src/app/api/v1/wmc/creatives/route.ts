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
  WmcCreative,
  WmcCreativeInput,
  WmcMutationResult,
} from '../../../../../server/wmc/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Creative management. NOTE: the exact live paths for creatives are in the
 * partner-gated "Add Creatives to Ad Groups" docs — verify /api/v1/creatives
 * against your onboarding pack before a live demo.
 */
export async function GET(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  try {
    if (ctx.mode === 'simulated') {
      return wmcJson(simulator.listCreatives(), ctx);
    }
    const creatives = await wmcFetch<WmcCreative[]>(ctx, '/api/v1/creatives', {
      query: { advertiserId: ctx.advertiserId },
    });
    return wmcJson(creatives, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  const body = await readJsonBody<WmcCreativeInput[]>(request);
  if (!Array.isArray(body) || body.length === 0) {
    return wmcJson({ error: 'Expected a non-empty array of creatives' }, ctx, 400);
  }
  const withAdvertiser = body.map((creative) => ({
    ...creative,
    advertiserId: creative.advertiserId ?? ctx.advertiserId,
  }));
  try {
    if (ctx.mode === 'simulated') {
      return wmcJson(
        simulator.createCreatives(ctx.advertiserId, withAdvertiser),
        ctx,
      );
    }
    const results = await wmcFetch<WmcMutationResult[]>(ctx, '/api/v1/creatives', {
      method: 'POST',
      body: withAdvertiser,
    });
    return wmcJson(results, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}
