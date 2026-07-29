import { NextRequest } from 'next/server';
import {
  readJsonBody,
  resolveWmcContext,
  wmcErrorResponse,
  wmcFetch,
  wmcJson,
} from '../../../../../server/wmc/client';
import * as simulator from '../../../../../server/wmc/simulator';
import type { WmcReportType, WmcSnapshotJob } from '../../../../../server/wmc/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Async snapshot reports (Display Ads POST /api/v1/snapshot/report):
 * POST requests a report job; GET polls it until jobStatus === 'done'.
 * Live mode returns the WMC file URL in `details`; simulated mode returns
 * rows inline. Report dates must exclude the current date (data lags 24-48h)
 * and snapshot IDs expire after 24 hours.
 */
export async function POST(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  const body = await readJsonBody<{
    reportType?: WmcReportType;
    startDate?: string;
    endDate?: string;
  }>(request);
  const reportType = body?.reportType ?? 'campaign';
  try {
    if (ctx.mode === 'simulated') {
      return wmcJson(
        simulator.createSnapshot(
          ctx.advertiserId,
          reportType,
          body?.startDate,
          body?.endDate,
        ),
        ctx,
      );
    }
    const job = await wmcFetch<WmcSnapshotJob>(ctx, '/api/v1/snapshot/report', {
      method: 'POST',
      body: {
        advertiserId: ctx.advertiserId,
        reportType,
        startDate: body?.startDate,
        endDate: body?.endDate,
      },
    });
    return wmcJson(job, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  const ctx = resolveWmcContext(request);
  const snapshotId = request.nextUrl.searchParams.get('snapshotId');
  if (!snapshotId) {
    return wmcJson({ error: 'snapshotId is required' }, ctx, 400);
  }
  try {
    if (ctx.mode === 'simulated') {
      const job = simulator.getSnapshot(snapshotId);
      if (!job) {
        return wmcJson({ error: `Snapshot ${snapshotId} not found` }, ctx, 404);
      }
      return wmcJson(job, ctx);
    }
    const job = await wmcFetch<WmcSnapshotJob>(ctx, '/api/v1/snapshot', {
      query: { advertiserId: ctx.advertiserId, snapshotId },
    });
    return wmcJson(job, ctx);
  } catch (error) {
    return wmcErrorResponse(error);
  }
}
