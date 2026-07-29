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
  WmcCampaign,
  WmcCampaignInput,
  WmcCampaignUpdate,
  WmcMutationResult,
} from '../../../../../server/wmc/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  try {
    if (ctx.mode === 'simulated') {
      return wmcJson(simulator.listCampaigns(), ctx);
    }
    const campaigns = await wmcFetch<WmcCampaign[]>(ctx, '/api/v1/campaigns', {
      query: { advertiserId: ctx.advertiserId },
    });
    return wmcJson(campaigns, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  const body = await readJsonBody<WmcCampaignInput[]>(request);
  if (!Array.isArray(body) || body.length === 0) {
    return wmcJson({ error: 'Expected a non-empty array of campaigns' }, ctx, 400);
  }
  // Display API expects advertiserId inside each campaign object.
  const withAdvertiser = body.map((campaign) => ({
    ...campaign,
    advertiserId: campaign.advertiserId ?? ctx.advertiserId,
  }));
  try {
    if (ctx.mode === 'simulated') {
      return wmcJson(
        simulator.createCampaigns(ctx.advertiserId, withAdvertiser),
        ctx,
      );
    }
    const results = await wmcFetch<WmcMutationResult[]>(ctx, '/api/v1/campaigns', {
      method: 'POST',
      body: withAdvertiser,
    });
    return wmcJson(results, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  const body = await readJsonBody<WmcCampaignUpdate[]>(request);
  if (!Array.isArray(body) || body.length === 0) {
    return wmcJson({ error: 'Expected a non-empty array of campaign updates' }, ctx, 400);
  }
  const withAdvertiser = body.map((update) => ({
    ...update,
    advertiserId: update.advertiserId ?? ctx.advertiserId,
  }));
  try {
    if (ctx.mode === 'simulated') {
      return wmcJson(simulator.updateCampaigns(withAdvertiser), ctx);
    }
    const results = await wmcFetch<WmcMutationResult[]>(ctx, '/api/v1/campaigns', {
      method: 'PUT',
      body: withAdvertiser,
    });
    return wmcJson(results, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}
