'use client';

import { Button } from '../../components/ui/button';
import { LibraryPickerModal } from '../../components/ui/library-picker-modal';
import type { MockAsset } from '../../lib/mock-assets';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WmcBudgetType,
  WmcCampaign,
  WmcCreative,
  WmcDeliverySpeed,
  WmcMatchType,
  WmcMediaType,
  WmcMutationResult,
  WmcObjective,
  WmcProduct,
  WmcReportType,
  WmcSnapshotJob,
  WmcTargeting,
} from '../../server/wmc/types';

type WmcMode = 'live' | 'simulated';

type ApiLogEntry = {
  id: number;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  summary: string;
};

type KeywordTargetRow = {
  keywordText: string;
  matchType: WmcMatchType;
  list: 'include' | 'exclude';
};

type CreativeRow = {
  name: string;
  adSize: string;
  clickUrl: string;
  assetUrl: string;
};

type TargetingStrategy = 'runOfSite' | 'keywords' | 'contextual';

const WIZARD_STEPS = [
  'Campaign',
  'Ad Group',
  'Targeting',
  'Product',
  'Creatives',
  'Review',
] as const;

const BANNER_SIZES = ['970x250', '728x90', '300x250', '300x600'];
const VIDEO_SIZES = ['15s', '30s'];
const REACH_TIERS = ['tier_1', 'tier_2', 'tier_3', 'tier_4', 'tier_5', 'tier_6', 'tier_7'];

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Display API takes ISO 8601 datetimes; flights start/end at noon UTC. */
function toIsoDateTime(date: string): string {
  return `${date}T12:00:00Z`;
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function formatInt(value: number): string {
  return value.toLocaleString('en-US');
}

function detailsText(details: string | string[]): string {
  return Array.isArray(details) ? details.join('; ') : details;
}

function firstFailure(results: WmcMutationResult[]): string | null {
  const failed = results.find((r) => r.code !== 'success');
  if (!failed) return null;
  const text = detailsText(failed.details) || 'Walmart Connect rejected the request';
  return failed.name ? `${failed.name}: ${text}` : text;
}

/**
 * URLs pasted from Google Drive, Slack, docs, etc. often carry invisible
 * characters (zero-width spaces, BOM, non-breaking spaces) that survive
 * trim() and fail strict https validation. URLs contain no whitespace, so
 * strip all of it.
 */
function sanitizeUrl(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF\u00A0\s]/g, '');
}

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#3c61f3] focus:outline-none';
const labelClass = 'text-xs font-medium text-slate-600';
const cardClass = 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm';

export function WmcCampaignManagerView() {
  const [tab, setTab] = useState<'setup' | 'monitor'>('setup');
  const [mode, setMode] = useState<WmcMode | null>(null);
  const [advertiserId, setAdvertiserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [showConnection, setShowConnection] = useState(false);
  const [apiLog, setApiLog] = useState<ApiLogEntry[]>([]);
  const logIdRef = useRef(1);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const callWmc = useCallback(
    async <T,>(
      path: string,
      options: { method?: string; json?: unknown } = {},
    ): Promise<T> => {
      const method = options.method ?? 'GET';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (advertiserId.trim()) headers['x-wmc-advertiser-id'] = advertiserId.trim();
      if (accessToken.trim()) headers['x-wmc-access-token'] = accessToken.trim();

      const response = await fetch(`/api/v1/wmc${path}`, {
        method,
        headers,
        body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
        cache: 'no-store',
      });
      const responseMode = response.headers.get('x-wmc-mode');
      if (mountedRef.current && (responseMode === 'live' || responseMode === 'simulated')) {
        setMode(responseMode);
      }
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (mountedRef.current) {
        const summary = response.ok
          ? Array.isArray(payload)
            ? `${payload.length} record(s)`
            : 'OK'
          : ((payload as { error?: string } | null)?.error ?? 'Request failed');
        setApiLog((prev) =>
          [
            {
              id: logIdRef.current++,
              method,
              path,
              status: response.status,
              ok: response.ok,
              summary,
            },
            ...prev,
          ].slice(0, 30),
        );
      }
      if (!response.ok) {
        throw new Error(
          (payload as { error?: string } | null)?.error ??
            `Walmart Connect request failed (${response.status})`,
        );
      }
      return payload as T;
    },
    [advertiserId, accessToken],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[#f6f8fb]">
      <div className="border-b border-slate-200 bg-white px-8 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#fb7500]">
              Walmart Connect · Display Ads API POC
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-[#050e3e]">
              WMC Campaign Manager
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Set up and monitor Walmart Connect onsite display campaigns
              end-to-end via the WMC Display Ads APIs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {mode && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  mode === 'live'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {mode === 'live' ? 'Live WMC API' : 'Simulated sandbox'}
              </span>
            )}
            <Button variant="outline" onClick={() => setShowConnection((v) => !v)}>
              {showConnection ? 'Hide connection' : 'Connection'}
            </Button>
          </div>
        </div>

        {showConnection && (
          <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Advertiser ID (numeric)</label>
              <input
                className={inputClass}
                value={advertiserId}
                onChange={(e) => setAdvertiserId(e.target.value)}
                placeholder="e.g. 700001"
              />
            </div>
            <div>
              <label className={labelClass}>WMC access token</label>
              <input
                className={inputClass}
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Bearer token from Walmart Connect"
              />
            </div>
            <p className="text-xs text-slate-500 md:col-span-2">
              Credentials are forwarded per request to the server-side proxy and
              never stored. Leave blank to use the built-in simulated sandbox
              (or server-configured env credentials).
            </p>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          {(
            [
              ['setup', 'Campaign Setup'],
              ['monitor', 'Monitoring'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === key
                  ? 'bg-[#050e3e] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="grid gap-6 p-8 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {tab === 'setup' ? (
            <SetupWizard callWmc={callWmc} onFinished={() => setTab('monitor')} />
          ) : (
            <MonitoringDashboard callWmc={callWmc} />
          )}
        </div>
        <ApiActivityPanel entries={apiLog} />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API activity panel — shows each proxied WMC call for POC transparency
// ---------------------------------------------------------------------------

function ApiActivityPanel({ entries }: { entries: ApiLogEntry[] }) {
  return (
    <aside className={`${cardClass} h-fit`}>
      <h2 className="text-sm font-semibold text-[#050e3e]">WMC API activity</h2>
      <p className="mt-1 text-xs text-slate-500">
        Every call proxied to the Walmart Connect Display Ads API from this
        session.
      </p>
      <ul className="mt-3 space-y-2">
        {entries.length === 0 && (
          <li className="text-xs text-slate-400">No requests yet.</li>
        )}
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="rounded-md border border-slate-100 bg-slate-50 p-2 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-slate-700">
                {entry.method} {entry.path}
              </span>
              <span
                className={`font-semibold ${entry.ok ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {entry.status}
              </span>
            </div>
            <p className="mt-0.5 truncate text-slate-500">{entry.summary}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Setup wizard
// ---------------------------------------------------------------------------

type CallWmc = <T>(
  path: string,
  options?: { method?: string; json?: unknown },
) => Promise<T>;

function SetupWizard({
  callWmc,
  onFinished,
}: {
  callWmc: CallWmc;
  onFinished: () => void;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — campaign
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState<WmcObjective>('awareness');
  const [mediaType, setMediaType] = useState<WmcMediaType>('banner');
  const [budgetType, setBudgetType] = useState<WmcBudgetType>('total');
  const [budgetAmount, setBudgetAmount] = useState('5000');
  const [deliverySpeed, setDeliverySpeed] = useState<WmcDeliverySpeed>('evenly');
  const [startDate, setStartDate] = useState(() => isoDate(1));
  const [endDate, setEndDate] = useState(() => isoDate(31));
  const [campaignId, setCampaignId] = useState<number | null>(null);

  // Step 2 — ad group settings
  const [adGroupName, setAdGroupName] = useState('');
  const [maxBid, setMaxBid] = useState('6.00');
  const [frequencyCapDay, setFrequencyCapDay] = useState('3');
  const [rotationMode, setRotationMode] = useState<'OPTIMIZE_PERFORMANCE' | 'ROTATE_EVENLY'>(
    'OPTIMIZE_PERFORMANCE',
  );
  const [adGroupId, setAdGroupId] = useState<number | null>(null);

  // Step 3 — targeting
  const [strategy, setStrategy] = useState<TargetingStrategy>('keywords');
  const [keywordRows, setKeywordRows] = useState<KeywordTargetRow[]>([
    { keywordText: '', matchType: 'BROAD', list: 'include' },
  ]);
  const [contextualCategoryId, setContextualCategoryId] = useState('');
  const [contextualReach, setContextualReach] = useState('tier_1');

  // Step 4 — product lookup
  const [skuInput, setSkuInput] = useState('');
  const [product, setProduct] = useState<WmcProduct | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());

  // Step 5 — creatives
  const [creativeRows, setCreativeRows] = useState<CreativeRow[]>([
    { name: '', adSize: '970x250', clickUrl: '', assetUrl: '' },
  ]);
  const [creativeResults, setCreativeResults] = useState<WmcMutationResult[]>([]);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const [finished, setFinished] = useState(false);

  const sizes = mediaType === 'video' ? VIDEO_SIZES : BANNER_SIZES;

  const runStep = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const createCampaign = () =>
    runStep(async () => {
      const results = await callWmc<WmcMutationResult[]>('/campaigns', {
        method: 'POST',
        json: [
          {
            name,
            description: description || undefined,
            objective,
            campaignType: 'ngd',
            mediaType,
            startDate: toIsoDateTime(startDate),
            endDate: toIsoDateTime(endDate),
            budgetType,
            ...(budgetType === 'daily'
              ? { dailyBudget: Number(budgetAmount) || 0 }
              : { totalBudget: Number(budgetAmount) || 0 }),
            deliverySpeed,
          },
        ],
      });
      const failure = firstFailure(results);
      if (failure) throw new Error(failure);
      setCampaignId(results[0].campaignId ?? null);
      setAdGroupName(`${name} — Ad Group 1`);
      setStep(1);
    });

  const buildTargeting = (): WmcTargeting => {
    if (strategy === 'runOfSite') return { runOfSite: true };
    if (strategy === 'contextual') {
      return {
        contextual: {
          include: [
            { id: Number(contextualCategoryId) || 0, reach: contextualReach },
          ],
        },
      };
    }
    const include = keywordRows
      .filter((r) => r.keywordText.trim() && r.list === 'include')
      .map((r) => ({ matchType: r.matchType, keywordText: r.keywordText.trim() }));
    const exclude = keywordRows
      .filter((r) => r.keywordText.trim() && r.list === 'exclude')
      .map((r) => ({ matchType: r.matchType, keywordText: r.keywordText.trim() }));
    return { keywords: { include, ...(exclude.length ? { exclude } : {}) } };
  };

  const createAdGroup = () =>
    runStep(async () => {
      if (strategy === 'keywords') {
        const hasInclude = keywordRows.some(
          (r) => r.keywordText.trim() && r.list === 'include',
        );
        if (!hasInclude) throw new Error('Add at least one include keyword');
      }
      if (strategy === 'contextual' && !contextualCategoryId.trim()) {
        throw new Error('Enter a contextual category ID');
      }
      // Budget lives at campaign level, so the ad group only carries flight,
      // bid, caps, and targeting (single POST per the Display API contract).
      const results = await callWmc<WmcMutationResult[]>('/ad-groups', {
        method: 'POST',
        json: [
          {
            campaignId,
            name: adGroupName,
            startDate: toIsoDateTime(startDate),
            endDate: toIsoDateTime(endDate),
            rateType: 'cpm',
            maxBid: Number(maxBid) || 0.01,
            creativeRotationMode: rotationMode,
            frequencyCapDay: Number(frequencyCapDay) || undefined,
            targeting: buildTargeting(),
          },
        ],
      });
      const failure = firstFailure(results);
      if (failure) throw new Error(failure);
      setAdGroupId(results[0].adGroupId ?? null);
      setStep(3);
    });

  const createCreatives = () =>
    runStep(async () => {
      const valid = creativeRows.filter(
        (r) => r.name.trim() && sanitizeUrl(r.clickUrl),
      );
      if (valid.length === 0) {
        throw new Error('Add at least one creative with a name and click URL');
      }
      const results = await callWmc<WmcMutationResult[]>('/creatives', {
        method: 'POST',
        json: valid.map((r) => ({
          name: r.name.trim(),
          mediaType,
          adSize: r.adSize,
          clickUrl: sanitizeUrl(r.clickUrl),
          assetUrl: sanitizeUrl(r.assetUrl) || 'https://cdn.example.com/pending-upload',
        })),
      });
      const failure = firstFailure(results);
      if (failure) throw new Error(failure);
      const creativeIds = results
        .map((r) => r.creativeId)
        .filter((id): id is number => id !== undefined);
      const assoc = await callWmc<WmcMutationResult[]>('/creative-associations', {
        method: 'POST',
        json: { adGroupId, creativeIds },
      });
      const assocFailure = firstFailure(assoc);
      if (assocFailure) throw new Error(assocFailure);
      setCreativeResults(results);
      setStep(5);
    });

  const lookupProduct = () =>
    runStep(async () => {
      const sku = skuInput.trim();
      if (!sku) throw new Error('Enter a SKU');
      const result = await callWmc<WmcProduct>(
        `/products?sku=${encodeURIComponent(sku)}`,
      );
      setProduct(result);
      setSelectedImages(new Set());
    });

  const toggleImage = (url: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const useSelectedImagesAsCreatives = () => {
    if (!product || selectedImages.size === 0) return;
    const rows: CreativeRow[] = [...selectedImages].map((url, index) => ({
      name: `${product.name} — ${sizes[index % sizes.length]}`,
      adSize: sizes[index % sizes.length],
      clickUrl: product.productTrackingUrl,
      assetUrl: url,
    }));
    setCreativeRows(rows);
    setStep(4);
  };

  const addRowFromLibraryAsset = (asset: MockAsset) => {
    setCreativeRows((rows) => {
      const blankIndex = rows.findIndex(
        (r) => !r.name.trim() && !r.assetUrl.trim(),
      );
      const newRow: CreativeRow = {
        name: asset.name,
        adSize: sizes[0],
        clickUrl: '',
        assetUrl: asset.url,
      };
      if (blankIndex !== -1) {
        return rows.map((r, i) => (i === blankIndex ? newRow : r));
      }
      return [...rows, newRow];
    });
    setAssetPickerOpen(false);
  };

  const productImageOptions = product
    ? [
        ...new Set(
          [product.images.large, product.images.medium, ...(product.additionalImages ?? [])].filter(
            (url) => url,
          ),
        ),
      ]
    : [];

  return (
    <div className="grid gap-4">
      <ol className="flex flex-wrap gap-2">
        {WIZARD_STEPS.map((label, index) => {
          const isActive = index === step;
          const isDone = index < step;
          return (
            <li
              key={label}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                isActive
                  ? 'bg-[#050e3e] text-white'
                  : isDone
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {isDone ? '✓' : `${index + 1}.`} {label}
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 0 && (
        <section className={cardClass}>
          <h2 className="text-base font-semibold text-[#050e3e]">
            Campaign details
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Creates an onsite display campaign via{' '}
            <code className="rounded bg-slate-100 px-1">POST /api/v1/campaigns</code>{' '}
            (campaignType <code className="rounded bg-slate-100 px-1">ngd</code>).
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Campaign name (unique, ≤240 chars)</label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Holiday Home Refresh — Display"
              />
            </div>
            <div>
              <label className={labelClass}>Description (optional)</label>
              <input
                className={inputClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Internal notes"
              />
            </div>
            <div>
              <label className={labelClass}>Objective</label>
              <select
                className={inputClass}
                value={objective}
                onChange={(e) => setObjective(e.target.value as WmcObjective)}
              >
                <option value="awareness">Awareness</option>
                <option value="engagement" disabled={mediaType === 'video'}>
                  Engagement
                </option>
                <option value="conversion" disabled={mediaType === 'video'}>
                  Conversion
                </option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Media type</label>
              <select
                className={inputClass}
                value={mediaType}
                onChange={(e) => {
                  const next = e.target.value as WmcMediaType;
                  setMediaType(next);
                  if (next === 'video') setObjective('awareness');
                  setCreativeRows((rows) =>
                    rows.map((r) => ({
                      ...r,
                      adSize: next === 'video' ? VIDEO_SIZES[0] : BANNER_SIZES[0],
                    })),
                  );
                }}
              >
                <option value="banner">Banner</option>
                <option value="video">Video (awareness only)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Budget type</label>
                <select
                  className={inputClass}
                  value={budgetType}
                  onChange={(e) => {
                    const next = e.target.value as WmcBudgetType;
                    setBudgetType(next);
                    if (next === 'daily') setDeliverySpeed('evenly');
                  }}
                >
                  <option value="total">Total</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  {budgetType === 'daily' ? 'Daily budget ($)' : 'Total budget ($)'}
                </label>
                <input
                  className={inputClass}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Delivery speed</label>
              <select
                className={inputClass}
                value={deliverySpeed}
                onChange={(e) => setDeliverySpeed(e.target.value as WmcDeliverySpeed)}
              >
                <option value="evenly">Evenly</option>
                <option value="frontloaded" disabled={budgetType === 'daily'}>
                  Frontloaded (total budget only)
                </option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Start date</label>
              <input
                className={inputClass}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>End date</label>
              <input
                className={inputClass}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={createCampaign} disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create campaign'}
            </Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className={cardClass}>
          <h2 className="text-base font-semibold text-[#050e3e]">
            Ad group settings
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Campaign <strong>#{campaignId}</strong> created. Ad groups carry the
            CPM bid, frequency caps, and targeting; they are committed together
            in one{' '}
            <code className="rounded bg-slate-100 px-1">POST /api/v1/adGroups</code>{' '}
            call at the end of the Targeting step.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelClass}>Ad group name</label>
              <input
                className={inputClass}
                value={adGroupName}
                onChange={(e) => setAdGroupName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Max bid — CPM ($)</label>
              <input
                className={inputClass}
                type="number"
                min="0.01"
                step="0.25"
                value={maxBid}
                onChange={(e) => setMaxBid(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Frequency cap / day (1–511)</label>
              <input
                className={inputClass}
                type="number"
                min="1"
                max="511"
                value={frequencyCapDay}
                onChange={(e) => setFrequencyCapDay(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Creative rotation</label>
              <select
                className={inputClass}
                value={rotationMode}
                onChange={(e) =>
                  setRotationMode(e.target.value as typeof rotationMode)
                }
              >
                <option value="OPTIMIZE_PERFORMANCE">Optimize performance</option>
                <option value="ROTATE_EVENLY">Rotate evenly</option>
              </select>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={!adGroupName.trim() || Number(maxBid) < 0.01}
            >
              Continue to targeting
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className={cardClass}>
          <h2 className="text-base font-semibold text-[#050e3e]">Targeting</h2>
          <p className="mt-1 text-xs text-slate-500">
            Display targeting is embedded in the ad group object (flattened
            include/exclude structure). Pick one strategy.
          </p>

          <div className="mt-4 flex gap-2">
            {(
              [
                ['keywords', 'Keywords'],
                ['contextual', 'Contextual category'],
                ['runOfSite', 'Run of site'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStrategy(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  strategy === key
                    ? 'bg-[#3c61f3] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {strategy === 'keywords' && (
            <div className="mt-4 grid gap-2">
              {keywordRows.map((row, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    className={inputClass}
                    value={row.keywordText}
                    onChange={(e) =>
                      setKeywordRows((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, keywordText: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="keyword text"
                  />
                  <select
                    className={`${inputClass} max-w-[110px]`}
                    value={row.matchType}
                    onChange={(e) =>
                      setKeywordRows((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? { ...r, matchType: e.target.value as WmcMatchType }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="BROAD">BROAD</option>
                    <option value="EXACT">EXACT</option>
                  </select>
                  <select
                    className={`${inputClass} max-w-[110px]`}
                    value={row.list}
                    onChange={(e) =>
                      setKeywordRows((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? { ...r, list: e.target.value as 'include' | 'exclude' }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="include">include</option>
                    <option value="exclude">exclude</option>
                  </select>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setKeywordRows((rows) => rows.filter((_, i) => i !== index))
                    }
                    disabled={keywordRows.length === 1}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  variant="outline"
                  onClick={() =>
                    setKeywordRows((rows) => [
                      ...rows,
                      { keywordText: '', matchType: 'BROAD', list: 'include' },
                    ])
                  }
                >
                  + Add keyword
                </Button>
              </div>
            </div>
          )}

          {strategy === 'contextual' && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Category ID</label>
                <input
                  className={inputClass}
                  type="number"
                  value={contextualCategoryId}
                  onChange={(e) => setContextualCategoryId(e.target.value)}
                  placeholder="Walmart taxonomy category, e.g. 4044"
                />
              </div>
              <div>
                <label className={labelClass}>Reach tier</label>
                <select
                  className={inputClass}
                  value={contextualReach}
                  onChange={(e) => setContextualReach(e.target.value)}
                >
                  {REACH_TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier} {tier === 'tier_1' ? '(narrowest)' : tier === 'tier_7' ? '(broadest)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {strategy === 'runOfSite' && (
            <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              Run-of-site serves across Walmart.com with no keyword, contextual,
              or audience constraints — broadest reach, lowest control.
            </p>
          )}

          <div className="mt-5 flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={createAdGroup} disabled={busy}>
              {busy ? 'Creating…' : 'Create ad group with targeting'}
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className={cardClass}>
          <h2 className="text-base font-semibold text-[#050e3e]">
            Product lookup
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Optional — enter a seller SKU to pull the product title, price,
            and (best-effort) description, keywords, and images, then turn any
            image directly into a creative. This is the Marketplace Items API
            (
            <code className="rounded bg-slate-100 px-1">GET /api/v1/wmc/products</code>
            ), a seller item-management surface distinct from Display Ads
            campaign management — see the README for live-mode details.
          </p>

          <div className="mt-4 flex gap-2">
            <input
              className={inputClass}
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              placeholder="SKU, e.g. GRILL-PROCHEF-4B"
            />
            <Button onClick={lookupProduct} disabled={busy || !skuInput.trim()}>
              {busy ? 'Looking up…' : 'Look up product'}
            </Button>
          </div>

          {product && (
            <div className="mt-5 grid gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {product.productType && (
                    <p className="text-xs text-slate-500">{product.productType}</p>
                  )}
                  {product.publishedStatus && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        product.publishedStatus === 'PUBLISHED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {product.publishedStatus}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold text-[#050e3e]">
                  {product.name}
                </h3>
                <p className="text-xs text-slate-500">
                  SKU: {product.sku}
                  {product.wpid ? ` · WPID: ${product.wpid}` : ''}
                  {product.brandName ? ` · Brand: ${product.brandName}` : ''}
                  {product.price
                    ? ` · ${formatMoney(product.price.amount)}`
                    : ''}
                </p>
                {product.shortDescription ? (
                  <p className="mt-2 text-sm text-slate-600">
                    {product.shortDescription}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-400 italic">
                    No description found.
                  </p>
                )}
              </div>

              {!product.contentComplete && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Description/images weren&apos;t found in this item&apos;s
                  additionalAttributes — that bag&apos;s keys vary by
                  product-type spec, so extraction is best-effort. Check this
                  SKU&apos;s category spec if content is missing.
                </p>
              )}

              <div>
                <p className={labelClass}>Suggested keywords</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {product.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className={labelClass}>
                  Product images — select to use as creative assets
                </p>
                {productImageOptions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {productImageOptions.map((url, index) => (
                      <button
                        key={index}
                        onClick={() => toggleImage(url)}
                        className={`overflow-hidden rounded-md border-2 ${
                          selectedImages.has(url)
                            ? 'border-[#3c61f3]'
                            : 'border-transparent'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={product.name}
                          className="h-24 w-24 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-400 italic">
                    No images found for this SKU.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-between">
            <Button variant="outline" onClick={() => setStep(4)}>
              Skip — add creatives manually
            </Button>
            <Button
              onClick={useSelectedImagesAsCreatives}
              disabled={!product || selectedImages.size === 0}
            >
              Use {selectedImages.size || ''} image
              {selectedImages.size === 1 ? '' : 's'} for creatives
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className={cardClass}>
          <h2 className="text-base font-semibold text-[#050e3e]">Creatives</h2>
          <p className="mt-1 text-xs text-slate-500">
            Ad group <strong>#{adGroupId}</strong> created. Add {mediaType}{' '}
            creatives and associate them with the ad group. New creatives enter
            Walmart&apos;s creative review (
            <code className="rounded bg-slate-100 px-1">reviewStatus: pending</code>
            ).
          </p>
          <div className="mt-4 grid gap-3">
            {creativeRows.map((row, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-md border border-slate-100 bg-slate-50 p-3 md:grid-cols-[56px_1fr_120px_1fr_1fr_auto] md:items-center"
              >
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
                  {row.assetUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.assetUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[9px] text-slate-400">no asset</span>
                  )}
                </div>
                <input
                  className={inputClass}
                  value={row.name}
                  onChange={(e) =>
                    setCreativeRows((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, name: e.target.value } : r,
                      ),
                    )
                  }
                  placeholder="Creative name"
                />
                <select
                  className={inputClass}
                  value={row.adSize}
                  onChange={(e) =>
                    setCreativeRows((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, adSize: e.target.value } : r,
                      ),
                    )
                  }
                >
                  {sizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  value={row.clickUrl}
                  onChange={(e) =>
                    setCreativeRows((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, clickUrl: e.target.value } : r,
                      ),
                    )
                  }
                  placeholder="Click URL (https://www.walmart.com/…)"
                />
                <input
                  className={inputClass}
                  value={row.assetUrl}
                  onChange={(e) =>
                    setCreativeRows((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, assetUrl: e.target.value } : r,
                      ),
                    )
                  }
                  placeholder="Asset URL (image/video)"
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    setCreativeRows((rows) => rows.filter((_, i) => i !== index))
                  }
                  disabled={creativeRows.length === 1}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setCreativeRows((rows) => [
                    ...rows,
                    { name: '', adSize: sizes[0], clickUrl: '', assetUrl: '' },
                  ])
                }
              >
                + Add creative
              </Button>
              <Button variant="outline" onClick={() => setAssetPickerOpen(true)}>
                Select from Asset Library
              </Button>
            </div>
            <Button onClick={createCreatives} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit creatives & associate'}
            </Button>
          </div>

          <LibraryPickerModal
            isOpen={assetPickerOpen}
            onClose={() => setAssetPickerOpen(false)}
            onSelect={addRowFromLibraryAsset}
            mediaType={mediaType === 'video' ? 'video' : 'image'}
            title="Select from local asset library"
          />
        </section>
      )}

      {step === 5 && (
        <section className={cardClass}>
          <h2 className="text-base font-semibold text-[#050e3e]">Review</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className={labelClass}>Campaign</dt>
              <dd className="text-slate-800">
                {name} (#{campaignId})
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Objective / media</dt>
              <dd className="text-slate-800">
                {objective} · {mediaType}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Flight</dt>
              <dd className="text-slate-800">
                {startDate} → {endDate} · {deliverySpeed}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Budget</dt>
              <dd className="text-slate-800">
                {formatMoney(Number(budgetAmount))} ({budgetType})
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Structure</dt>
              <dd className="text-slate-800">
                1 ad group (#{adGroupId}) · {strategy} targeting ·{' '}
                {creativeResults.length} creative(s) in review
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Max bid</dt>
              <dd className="text-slate-800">{formatMoney(Number(maxBid))} CPM</dd>
            </div>
          </dl>

          <div
            className={`mt-5 rounded-md border px-4 py-3 text-sm ${
              finished
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            Campaign #{campaignId} is set up. It will deliver during its flight
            window once creatives clear Walmart review — no separate launch call
            is needed. Reporting appears in Monitoring with a 24–48h lag.
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => {
                setFinished(true);
                onFinished();
              }}
            >
              Go to Monitoring
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monitoring dashboard
// ---------------------------------------------------------------------------

function MonitoringDashboard({ callWmc }: { callWmc: CallWmc }) {
  const [campaigns, setCampaigns] = useState<WmcCampaign[]>([]);
  const [creatives, setCreatives] = useState<WmcCreative[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reportType, setReportType] = useState<WmcReportType>('campaign');
  const [snapshotJob, setSnapshotJob] = useState<WmcSnapshotJob | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campaignList, creativeList] = await Promise.all([
        callWmc<WmcCampaign[]>('/campaigns'),
        callWmc<WmcCreative[]>('/creatives'),
      ]);
      if (!mountedRef.current) return;
      setCampaigns(campaignList);
      setCreatives(creativeList);
      setSelectedId((current) => current ?? campaignList[0]?.campaignId ?? null);
    } catch (e) {
      if (mountedRef.current)
        setError(e instanceof Error ? e.message : 'Failed to load campaigns');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [callWmc]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const toggleCampaignStatus = async (campaign: WmcCampaign) => {
    const nextStatus = campaign.status === 'paused' ? 'live' : 'paused';
    setError(null);
    try {
      const results = await callWmc<WmcMutationResult[]>('/campaigns', {
        method: 'PUT',
        json: [{ campaignId: campaign.campaignId, status: nextStatus }],
      });
      const failure = firstFailure(results);
      if (failure) throw new Error(failure);
      await loadCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update campaign');
    }
  };

  const requestSnapshot = async () => {
    setError(null);
    setSnapshotJob(null);
    setPolling(true);
    try {
      // Report dates must exclude today — display data lags 24-48h.
      let job = await callWmc<WmcSnapshotJob>('/snapshot', {
        method: 'POST',
        json: { reportType, startDate: isoDate(-16), endDate: isoDate(-2) },
      });
      if (job.code === 'failure') {
        throw new Error(detailsText(job.details ?? 'Snapshot request rejected'));
      }
      if (mountedRef.current) setSnapshotJob(job);
      for (let attempt = 0; attempt < 20 && mountedRef.current; attempt++) {
        if (['done', 'failed', 'expired'].includes(job.jobStatus)) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        job = await callWmc<WmcSnapshotJob>(`/snapshot?snapshotId=${job.snapshotId}`);
        if (mountedRef.current) setSnapshotJob(job);
      }
    } catch (e) {
      if (mountedRef.current)
        setError(e instanceof Error ? e.message : 'Snapshot request failed');
    } finally {
      if (mountedRef.current) setPolling(false);
    }
  };

  const selectedRows = useMemo(() => {
    if (!snapshotJob?.rows) return [];
    return selectedId == null
      ? snapshotJob.rows
      : snapshotJob.rows.filter((row) => row.campaignId === selectedId);
  }, [snapshotJob, selectedId]);

  const dailyTotals = useMemo(() => {
    const byDate = new Map<string, { adSpend: number; attributedSales: number }>();
    for (const row of selectedRows) {
      const entry = byDate.get(row.date) ?? { adSpend: 0, attributedSales: 0 };
      entry.adSpend += row.adSpend;
      entry.attributedSales += row.attributedSales;
      byDate.set(row.date, entry);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, totals]) => ({ date, ...totals }));
  }, [selectedRows]);

  const totals = useMemo(
    () =>
      selectedRows.reduce(
        (acc, row) => ({
          impressions: acc.impressions + row.impressions,
          viewableImpressions: acc.viewableImpressions + row.viewableImpressions,
          clicks: acc.clicks + row.clicks,
          adSpend: acc.adSpend + row.adSpend,
          attributedSales: acc.attributedSales + row.attributedSales,
          newBuyers: acc.newBuyers + row.newBuyers,
        }),
        {
          impressions: 0,
          viewableImpressions: 0,
          clicks: 0,
          adSpend: 0,
          attributedSales: 0,
          newBuyers: 0,
        },
      ),
    [selectedRows],
  );

  const pendingCreatives = creatives.filter((c) => c.reviewStatus === 'pending');

  return (
    <div className="grid gap-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {pendingCreatives.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {pendingCreatives.length} creative(s) awaiting Walmart review:{' '}
          {pendingCreatives.map((c) => c.name).join(', ')}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#050e3e]">Campaigns</h2>
          <Button variant="outline" onClick={loadCampaigns} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Campaign</th>
                <th className="py-2 pr-4">Media</th>
                <th className="py-2 pr-4">Objective</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Budget</th>
                <th className="py-2 pr-4">Flight</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.campaignId}
                  onClick={() => setSelectedId(campaign.campaignId)}
                  className={`cursor-pointer border-b border-slate-100 ${
                    selectedId === campaign.campaignId
                      ? 'bg-[#3c61f3]/5'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="py-2.5 pr-4 font-medium text-slate-800">
                    {campaign.name}
                    <span className="ml-2 text-xs text-slate-400">
                      #{campaign.campaignId}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600">{campaign.mediaType}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{campaign.objective}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        campaign.status === 'live'
                          ? 'bg-emerald-100 text-emerald-700'
                          : campaign.status === 'paused'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600">
                    {campaign.budgetType === 'daily'
                      ? `${formatMoney(campaign.dailyBudget ?? 0)}/day`
                      : `${formatMoney(campaign.totalBudget ?? 0)} total`}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-500">
                    {campaign.startDate.slice(0, 10)} → {campaign.endDate.slice(0, 10)}
                  </td>
                  <td className="py-2.5 text-right">
                    <Button
                      variant="outline"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        void toggleCampaignStatus(campaign);
                      }}
                    >
                      {campaign.status === 'paused' ? 'Resume' : 'Pause'}
                    </Button>
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-slate-400">
                    No campaigns yet — create one in Campaign Setup.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#050e3e]">
              Performance snapshot{' '}
              <span className="ml-1 text-xs font-normal text-slate-400">
                POST /api/v1/snapshot/report · last 14 reported days
              </span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Display reporting lags 24–48 hours; report dates exclude today.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className={`${inputClass} w-auto`}
              value={reportType}
              onChange={(e) => setReportType(e.target.value as WmcReportType)}
            >
              <option value="campaign">By campaign</option>
              <option value="lineItem">By line item (ad group)</option>
              <option value="creative">By creative</option>
            </select>
            <Button onClick={requestSnapshot} disabled={polling}>
              {polling ? 'Generating…' : 'Request report'}
            </Button>
          </div>
        </div>

        {snapshotJob && snapshotJob.jobStatus !== 'done' && (
          <p className="mt-3 text-sm text-slate-500">
            Snapshot <code>{snapshotJob.snapshotId}</code> status:{' '}
            <strong>{snapshotJob.jobStatus}</strong>
            {polling ? ' — polling…' : ''}
          </p>
        )}

        {snapshotJob?.jobStatus === 'done' && snapshotJob.details && (
          <p className="mt-3 text-sm text-slate-600">
            Report file ready:{' '}
            <a
              className="text-[#3c61f3] underline"
              href={snapshotJob.details}
              target="_blank"
              rel="noreferrer"
            >
              download (gzip)
            </a>
          </p>
        )}

        {selectedRows.length > 0 && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                [
                  'Impressions',
                  `${formatInt(totals.impressions)} (${
                    totals.impressions > 0
                      ? Math.round(
                          (totals.viewableImpressions / totals.impressions) * 100,
                        )
                      : 0
                  }% viewable)`,
                ],
                [
                  'Clicks / CTR',
                  `${formatInt(totals.clicks)} · ${
                    totals.impressions > 0
                      ? ((totals.clicks / totals.impressions) * 100).toFixed(2)
                      : '0'
                  }%`,
                ],
                ['Spend', formatMoney(totals.adSpend)],
                [
                  'Sales / ROAS',
                  `${formatMoney(totals.attributedSales)} · ${
                    totals.adSpend > 0
                      ? (totals.attributedSales / totals.adSpend).toFixed(2)
                      : '—'
                  }x`,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <strong className="mt-1 block text-base text-[#050e3e]">
                    {value}
                  </strong>
                </div>
              ))}
            </div>

            <SpendTrendChart data={dailyTotals} />

            <div className="mt-4 max-h-72 overflow-auto rounded-md border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-slate-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Campaign</th>
                    {reportType !== 'campaign' && (
                      <th className="px-3 py-2">
                        {reportType === 'lineItem' ? 'Ad group' : 'Creative'}
                      </th>
                    )}
                    <th className="px-3 py-2 text-right">Impr.</th>
                    <th className="px-3 py-2 text-right">Viewable</th>
                    <th className="px-3 py-2 text-right">Clicks</th>
                    <th className="px-3 py-2 text-right">Spend</th>
                    <th className="px-3 py-2 text-right">Sales</th>
                    <th className="px-3 py-2 text-right">New buyers</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100 text-slate-700">
                      <td className="px-3 py-1.5">{row.date}</td>
                      <td className="px-3 py-1.5">{row.campaignName}</td>
                      {reportType !== 'campaign' && (
                        <td className="px-3 py-1.5">{row.entityLabel}</td>
                      )}
                      <td className="px-3 py-1.5 text-right">
                        {formatInt(row.impressions)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {formatInt(row.viewableImpressions)}
                      </td>
                      <td className="px-3 py-1.5 text-right">{formatInt(row.clicks)}</td>
                      <td className="px-3 py-1.5 text-right">
                        {formatMoney(row.adSpend)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {formatMoney(row.attributedSales)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {formatInt(row.newBuyers)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SpendTrendChart({
  data,
}: {
  data: Array<{ date: string; adSpend: number; attributedSales: number }>;
}) {
  if (data.length === 0) return null;
  const width = 720;
  const height = 160;
  const padding = 24;
  const max = Math.max(...data.map((d) => Math.max(d.adSpend, d.attributedSales)), 1);
  const bandWidth = (width - padding * 2) / data.length;
  const barWidth = Math.max(4, bandWidth / 2 - 3);

  return (
    <div className="mt-4 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[560px]"
        role="img"
        aria-label="Daily ad spend vs attributed sales"
      >
        {data.map((d, i) => {
          const x = padding + i * bandWidth;
          const spendHeight = ((height - padding * 2) * d.adSpend) / max;
          const salesHeight = ((height - padding * 2) * d.attributedSales) / max;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={height - padding - spendHeight}
                width={barWidth}
                height={spendHeight}
                rx={2}
                fill="#fb7500"
              />
              <rect
                x={x + barWidth + 3}
                y={height - padding - salesHeight}
                width={barWidth}
                height={salesHeight}
                rx={2}
                fill="#3c61f3"
              />
              {i % 2 === 0 && (
                <text
                  x={x + barWidth}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#64748b"
                >
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#fb7500]" /> Ad
          spend
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#3c61f3]" />{' '}
          Attributed sales
        </span>
      </div>
    </div>
  );
}
