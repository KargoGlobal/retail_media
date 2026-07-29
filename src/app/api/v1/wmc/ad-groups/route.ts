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
  WmcAdGroup,
  WmcAdGroupInput,
  WmcMutationResult,
} from '../../../../../server/wmc/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  const campaignId = request.nextUrl.searchParams.get('campaignId');
  try {
    if (ctx.mode === 'simulated') {
      return wmcJson(
        simulator.listAdGroups(campaignId ? Number(campaignId) : undefined),
        ctx,
      );
    }
    const adGroups = await wmcFetch<WmcAdGroup[]>(ctx, '/api/v1/adGroups', {
      query: {
        advertiserId: ctx.advertiserId,
        campaignId: campaignId ?? undefined,
      },
    });
    return wmcJson(adGroups, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  const body = await readJsonBody<WmcAdGroupInput[]>(request);
  if (!Array.isArray(body) || body.length === 0) {
    return wmcJson({ error: 'Expected a non-empty array of ad groups' }, ctx, 400);
  }
  const withAdvertiser = body.map((adGroup) => ({
    ...adGroup,
    advertiserId: adGroup.advertiserId ?? ctx.advertiserId,
  }));
  try {
    if (ctx.mode === 'simulated') {
      return wmcJson(simulator.createAdGroups(ctx.advertiserId, withAdvertiser), ctx);
    }
    const results = await wmcFetch<WmcMutationResult[]>(ctx, '/api/v1/adGroups', {
      method: 'POST',
      body: withAdvertiser,
    });
    return wmcJson(results, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}
