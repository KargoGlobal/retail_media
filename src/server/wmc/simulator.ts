import type {
  WmcAdGroup,
  WmcAdGroupInput,
  WmcCampaign,
  WmcCampaignInput,
  WmcCampaignUpdate,
  WmcCreative,
  WmcCreativeAssociation,
  WmcCreativeInput,
  WmcMutationResult,
  WmcProduct,
  WmcReportType,
  WmcSnapshotJob,
  WmcSnapshotRow,
} from './types';

/**
 * In-memory Walmart Connect Display Ads sandbox. Mirrors the request/response
 * shapes of the real Display API so the UI exercises the exact same workflow
 * (campaign -> ad group + targeting -> creatives -> snapshot reports) without
 * live credentials. State survives hot reloads via globalThis.
 */

type SimStore = {
  campaigns: Map<number, WmcCampaign>;
  adGroups: Map<number, WmcAdGroup>;
  creatives: Map<number, WmcCreative>;
  associations: WmcCreativeAssociation[];
  snapshots: Map<string, { job: WmcSnapshotJob; createdAt: number }>;
  nextId: number;
};

declare global {
  var __wmcSimStore: SimStore | undefined;
}

function getStore(): SimStore {
  if (!globalThis.__wmcSimStore) {
    globalThis.__wmcSimStore = seedStore();
  }
  return globalThis.__wmcSimStore;
}

function isoDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function isoDateTime(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function deriveStatus(startDate: string, endDate: string): WmcCampaign['status'] {
  const now = Date.now();
  if (new Date(startDate).getTime() > now) return 'scheduled';
  if (endDate && new Date(endDate).getTime() < now) return 'completed';
  return 'live';
}

function seedStore(): SimStore {
  const store: SimStore = {
    campaigns: new Map(),
    adGroups: new Map(),
    creatives: new Map(),
    associations: [],
    snapshots: new Map(),
    nextId: 600001,
  };

  const advertiserId = 1;

  // Campaign 1 — banner awareness campaign, live for 3 weeks
  const c1 = store.nextId++;
  store.campaigns.set(c1, {
    campaignId: c1,
    advertiserId,
    name: 'Summer Outdoor Living — Onsite Display',
    description: 'Q3 awareness push for patio & grill categories',
    objective: 'awareness',
    campaignType: 'ngd',
    mediaType: 'banner',
    startDate: isoDateTime(-21),
    endDate: isoDateTime(30),
    budgetType: 'total',
    totalBudget: 25000,
    deliverySpeed: 'evenly',
    status: 'live',
  });
  const g1 = store.nextId++;
  store.adGroups.set(g1, {
    adGroupId: g1,
    campaignId: c1,
    advertiserId,
    name: 'Patio & Grill — Contextual T1',
    startDate: isoDateTime(-21),
    endDate: isoDateTime(30),
    rateType: 'cpm',
    maxBid: 6.5,
    creativeRotationMode: 'OPTIMIZE_PERFORMANCE',
    frequencyCapDay: 3,
    frequencyCapWeek: 10,
    targeting: {
      contextual: { include: [{ id: 4044, reach: 'tier_1' }] },
      keywords: {
        include: [
          { matchType: 'BROAD', keywordText: 'patio furniture' },
          { matchType: 'EXACT', keywordText: 'gas grill' },
        ],
      },
    },
    status: 'enabled',
  });
  const cr1 = store.nextId++;
  store.creatives.set(cr1, {
    creativeId: cr1,
    advertiserId,
    name: 'Outdoor Living 970x250',
    mediaType: 'banner',
    adSize: '970x250',
    clickUrl: 'https://www.walmart.com/browse/patio-garden',
    assetUrl: 'https://cdn.example.com/creatives/outdoor-970x250.png',
    reviewStatus: 'approved',
  });
  const cr2 = store.nextId++;
  store.creatives.set(cr2, {
    creativeId: cr2,
    advertiserId,
    name: 'Outdoor Living 300x250',
    mediaType: 'banner',
    adSize: '300x250',
    clickUrl: 'https://www.walmart.com/browse/patio-garden',
    assetUrl: 'https://cdn.example.com/creatives/outdoor-300x250.png',
    reviewStatus: 'approved',
  });
  store.associations.push(
    { adGroupId: g1, creativeId: cr1, status: 'enabled' },
    { adGroupId: g1, creativeId: cr2, status: 'enabled' },
  );

  // Campaign 2 — video engagement campaign, run-of-site
  const c2 = store.nextId++;
  store.campaigns.set(c2, {
    campaignId: c2,
    advertiserId,
    name: 'Back to School Video — ROS',
    objective: 'awareness',
    campaignType: 'ngd',
    mediaType: 'video',
    startDate: isoDateTime(-10),
    endDate: isoDateTime(45),
    budgetType: 'daily',
    dailyBudget: 800,
    deliverySpeed: 'evenly',
    status: 'live',
  });
  const g2 = store.nextId++;
  store.adGroups.set(g2, {
    adGroupId: g2,
    campaignId: c2,
    advertiserId,
    name: 'BTS Video — Run of Site',
    startDate: isoDateTime(-10),
    endDate: isoDateTime(45),
    rateType: 'cpm',
    maxBid: 12,
    targeting: { runOfSite: true },
    status: 'enabled',
  });
  const cr3 = store.nextId++;
  store.creatives.set(cr3, {
    creativeId: cr3,
    advertiserId,
    name: 'BTS Hero Video :15',
    mediaType: 'video',
    adSize: '15s',
    clickUrl: 'https://www.walmart.com/cp/back-to-school',
    assetUrl: 'https://cdn.example.com/creatives/bts-hero-15s.mp4',
    reviewStatus: 'approved',
  });
  store.associations.push({ adGroupId: g2, creativeId: cr3, status: 'enabled' });

  return store;
}

/** Deterministic PRNG so metrics stay stable across refreshes. */
function seededRandom(seedText: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Display economics: CPM buying, low CTR, view-through heavy. */
function dailyMetrics(campaign: WmcCampaign, date: string) {
  const rand = seededRandom(`${campaign.campaignId}:${date}`);
  const dailySpendTarget =
    campaign.budgetType === 'daily'
      ? (campaign.dailyBudget ?? 100)
      : (campaign.totalBudget ?? 3000) / 45;
  const cpm = (campaign.mediaType === 'video' ? 9 : 4) + rand() * 3;
  const adSpend = dailySpendTarget * (0.8 + rand() * 0.25);
  const impressions = Math.round((adSpend / cpm) * 1000);
  const viewableImpressions = Math.round(impressions * (0.55 + rand() * 0.25));
  const ctr = campaign.mediaType === 'video' ? 0.0012 : 0.0008 + rand() * 0.002;
  const clicks = Math.max(1, Math.round(impressions * ctr));
  const roas = 1.8 + rand() * 2.4;
  const attributedSales = adSpend * roas;
  const unitsSold = Math.max(1, Math.round(attributedSales / (16 + rand() * 24)));
  const newBuyers = Math.round(unitsSold * (0.25 + rand() * 0.3));
  return {
    impressions,
    viewableImpressions,
    clicks,
    adSpend,
    attributedSales,
    unitsSold,
    newBuyers,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export function listCampaigns(): WmcCampaign[] {
  return [...getStore().campaigns.values()];
}

export function createCampaigns(
  advertiserId: number,
  inputs: WmcCampaignInput[],
): WmcMutationResult[] {
  const store = getStore();
  if (inputs.length > 10) {
    return inputs.map(() => ({
      code: 'failure',
      details: 'Batch operations support a maximum of 10 campaigns per request',
    }));
  }
  return inputs.map((input) => {
    if (!input.name?.trim()) {
      return { code: 'failure', details: 'Campaign name is required' };
    }
    if (input.name.length > 240) {
      return { code: 'failure', details: 'Campaign name exceeds 240 characters' };
    }
    const duplicate = [...store.campaigns.values()].some(
      (c) => c.name === input.name,
    );
    if (duplicate) {
      return { code: 'failure', details: 'Campaign name must be unique', name: input.name };
    }
    if (input.budgetType === 'daily' && input.deliverySpeed === 'frontloaded') {
      return {
        code: 'failure',
        details: 'Frontloaded pacing is not supported if budgetType is daily',
        name: input.name,
      };
    }
    if (input.mediaType === 'video' && input.objective !== 'awareness') {
      return {
        code: 'failure',
        details: 'Video campaigns support only the awareness objective',
        name: input.name,
      };
    }
    const budget =
      input.budgetType === 'daily' ? input.dailyBudget : input.totalBudget;
    if (!budget || budget < 0.01) {
      return {
        code: 'failure',
        details: `${input.budgetType === 'daily' ? 'dailyBudget' : 'totalBudget'} of at least $0.01 is required`,
        name: input.name,
      };
    }
    const campaignId = store.nextId++;
    store.campaigns.set(campaignId, {
      ...input,
      advertiserId: input.advertiserId ?? advertiserId,
      campaignId,
      status: deriveStatus(input.startDate, input.endDate),
    });
    return {
      code: 'success',
      details: ['Campaign created successfully'],
      name: input.name,
      campaignId,
    };
  });
}

export function updateCampaigns(updates: WmcCampaignUpdate[]): WmcMutationResult[] {
  const store = getStore();
  return updates.map((update) => {
    const existing = store.campaigns.get(update.campaignId);
    if (!existing) {
      return {
        code: 'failure',
        details: `Campaign ${update.campaignId} not found`,
        campaignId: update.campaignId,
      };
    }
    store.campaigns.set(update.campaignId, { ...existing, ...update });
    return {
      code: 'success',
      details: ['Campaign updated successfully'],
      campaignId: update.campaignId,
    };
  });
}

// ---------------------------------------------------------------------------
// Ad groups (targeting is embedded in the ad group object)
// ---------------------------------------------------------------------------

export function listAdGroups(campaignId?: number): WmcAdGroup[] {
  const groups = [...getStore().adGroups.values()];
  return campaignId ? groups.filter((g) => g.campaignId === campaignId) : groups;
}

export function createAdGroups(
  advertiserId: number,
  inputs: WmcAdGroupInput[],
): WmcMutationResult[] {
  const store = getStore();
  return inputs.map((input) => {
    const campaign = store.campaigns.get(input.campaignId);
    if (!campaign) {
      return { code: 'failure', details: `Campaign ${input.campaignId} not found` };
    }
    if (!input.name?.trim()) {
      return { code: 'failure', details: 'Ad group name is required' };
    }
    // Budget must live at exactly one level (campaign or ad group).
    const campaignHasBudget =
      (campaign.dailyBudget ?? 0) > 0 || (campaign.totalBudget ?? 0) > 0;
    const adGroupHasBudget =
      (input.dailyBudget ?? 0) > 0 || (input.totalBudget ?? 0) > 0;
    if (campaignHasBudget && adGroupHasBudget) {
      return {
        code: 'failure',
        details:
          'Budget must be set at either the campaign level or the ad group level, not both',
        name: input.name,
      };
    }
    if (input.maxBid !== undefined && input.maxBid < 0.01) {
      return { code: 'failure', details: 'maxBid must be at least $0.01', name: input.name };
    }
    const adGroupId = store.nextId++;
    store.adGroups.set(adGroupId, {
      ...input,
      advertiserId: input.advertiserId ?? advertiserId,
      rateType: 'cpm',
      adGroupId,
      status: 'enabled',
    });
    return {
      code: 'success',
      details: 'Ad group created successfully',
      name: input.name,
      campaignId: input.campaignId,
      adGroupId,
    };
  });
}

// ---------------------------------------------------------------------------
// Creatives & associations
// ---------------------------------------------------------------------------

export function listCreatives(): WmcCreative[] {
  return [...getStore().creatives.values()];
}

export function listAssociations(adGroupId?: number): WmcCreativeAssociation[] {
  const store = getStore();
  return adGroupId
    ? store.associations.filter((a) => a.adGroupId === adGroupId)
    : store.associations;
}

export function createCreatives(
  advertiserId: number,
  inputs: WmcCreativeInput[],
): WmcMutationResult[] {
  const store = getStore();
  return inputs.map((input) => {
    if (!input.name?.trim()) {
      return { code: 'failure', details: 'Creative name is required' };
    }
    if (!input.clickUrl?.startsWith('https://')) {
      return {
        code: 'failure',
        details: `clickUrl must be an https URL (received: ${JSON.stringify(input.clickUrl ?? '')})`,
        name: input.name,
      };
    }
    const creativeId = store.nextId++;
    store.creatives.set(creativeId, {
      ...input,
      advertiserId: input.advertiserId ?? advertiserId,
      creativeId,
      reviewStatus: 'pending', // creatives go through Walmart creative review
    });
    return {
      code: 'success',
      details: 'Creative submitted for review',
      name: input.name,
      creativeId,
    };
  });
}

export function associateCreatives(
  adGroupId: number,
  creativeIds: number[],
): WmcMutationResult[] {
  const store = getStore();
  if (!store.adGroups.has(adGroupId)) {
    return [{ code: 'failure', details: `Ad group ${adGroupId} not found` }];
  }
  return creativeIds.map((creativeId) => {
    if (!store.creatives.has(creativeId)) {
      return { code: 'failure', details: `Creative ${creativeId} not found`, creativeId };
    }
    const exists = store.associations.some(
      (a) => a.adGroupId === adGroupId && a.creativeId === creativeId,
    );
    if (!exists) {
      store.associations.push({ adGroupId, creativeId, status: 'enabled' });
    }
    return {
      code: 'success',
      details: 'Creative associated with ad group',
      adGroupId,
      creativeId,
    };
  });
}

// ---------------------------------------------------------------------------
// Snapshot reports (async, file-based in live WMC; inline rows here)
// ---------------------------------------------------------------------------

const SNAPSHOT_READY_AFTER_MS = 4000;
/** Display reporting data lags 24-48h; the sim reports through D-2. */
const REPORT_LAG_DAYS = 2;
const SNAPSHOT_DAYS = 14;

export function createSnapshot(
  advertiserId: number,
  reportType: WmcReportType,
  startDate?: string,
  endDate?: string,
): WmcSnapshotJob | WmcMutationResult {
  const store = getStore();
  const today = isoDate(0);
  if (startDate === today || endDate === today) {
    return {
      code: 'failure',
      details: 'Reporting data is unavailable for the current date',
    };
  }
  const snapshotId = `snap-${store.nextId++}`;
  const job: WmcSnapshotJob = {
    code: 'success',
    snapshotId,
    advertiserId,
    reportType,
    jobStatus: 'pending',
  };
  store.snapshots.set(snapshotId, { job, createdAt: Date.now() });
  return job;
}

export function getSnapshot(snapshotId: string): WmcSnapshotJob | null {
  const store = getStore();
  const entry = store.snapshots.get(snapshotId);
  if (!entry) return null;
  const age = Date.now() - entry.createdAt;
  if (age > 24 * 60 * 60 * 1000) {
    entry.job.jobStatus = 'expired';
    entry.job.rows = undefined;
    return entry.job;
  }
  if (age < SNAPSHOT_READY_AFTER_MS) {
    entry.job.jobStatus = age < SNAPSHOT_READY_AFTER_MS / 2 ? 'pending' : 'processing';
    return entry.job;
  }
  if (entry.job.jobStatus !== 'done') {
    entry.job.jobStatus = 'done';
    entry.job.rows = buildSnapshotRows(entry.job.reportType);
  }
  return entry.job;
}

function buildSnapshotRows(reportType: WmcReportType): WmcSnapshotRow[] {
  const store = getStore();
  const rows: WmcSnapshotRow[] = [];
  for (const campaign of store.campaigns.values()) {
    let entities: Array<{ label: string } | null> = [null];
    if (reportType === 'lineItem') {
      entities = [...store.adGroups.values()]
        .filter((g) => g.campaignId === campaign.campaignId)
        .map((g) => ({ label: g.name }));
    } else if (reportType === 'creative') {
      const adGroupIds = new Set(
        [...store.adGroups.values()]
          .filter((g) => g.campaignId === campaign.campaignId)
          .map((g) => g.adGroupId),
      );
      entities = store.associations
        .filter((a) => adGroupIds.has(a.adGroupId))
        .map((a) => ({
          label:
            store.creatives.get(a.creativeId)?.name ?? `Creative ${a.creativeId}`,
        }));
    }
    if (entities.length === 0) continue;
    const campaignStart = campaign.startDate.slice(0, 10);
    for (
      let daysAgo = SNAPSHOT_DAYS + REPORT_LAG_DAYS;
      daysAgo >= REPORT_LAG_DAYS;
      daysAgo--
    ) {
      const date = isoDate(daysAgo);
      if (date < campaignStart) continue;
      const day = dailyMetrics(campaign, date);
      for (const entity of entities) {
        const share = 1 / entities.length;
        const jitter = entity
          ? seededRandom(`${date}:${entity.label}`)() * 0.4 + 0.8
          : 1;
        rows.push({
          date,
          campaignId: campaign.campaignId,
          campaignName: campaign.name,
          entityLabel: entity?.label,
          impressions: Math.round(day.impressions * share * jitter),
          viewableImpressions: Math.round(day.viewableImpressions * share * jitter),
          clicks: Math.round(day.clicks * share * jitter),
          adSpend: round2(day.adSpend * share * jitter),
          attributedSales: round2(day.attributedSales * share * jitter),
          unitsSold: Math.round(day.unitsSold * share * jitter),
          newBuyers: Math.round(day.newBuyers * share * jitter),
        });
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Product/catalog lookup — feeds the "enter a SKU" creative-building step.
// Modeled on the Walmart Marketplace Items API (GET /v3/items?sku=...), a
// seller-item-management surface distinct from Display Ads. Real ItemResponse
// objects only guarantee sku/wpid/productName/productType/price/status
// fields — description, images, and brand live in a per-category
// `additionalAttributes` bag, which is why simulated mode invents plausible
// values for them (clearly a sandbox) while live mode treats them as
// best-effort. See server/wmc/client.ts and the module README.
// ---------------------------------------------------------------------------

type ProductSeed = {
  name: string;
  brandName: string;
  productType: string;
  shortDescription: string;
  price: number;
  accentHue: number;
};

/** Keyed by seller SKU — an arbitrary alphanumeric ID, not Walmart's itemId. */
const PRODUCT_CATALOG: Record<string, ProductSeed> = {
  'GRILL-PROCHEF-4B': {
    name: 'ProChef 4-Burner Gas Grill',
    brandName: 'ProChef',
    productType: 'Gas Grills',
    shortDescription:
      'Sear, roast, and smoke with four independently controlled burners and a porcelain-coated cast iron cooking grate.',
    price: 349.0,
    accentHue: 24,
  },
  'SAUCE-HICKORY-3PK': {
    name: 'Hickory BBQ Sauce 3-Pack',
    brandName: "Founder's Reserve",
    productType: 'Barbecue Sauce',
    shortDescription:
      'Slow-smoked hickory flavor in a family-size 3-pack, perfect for grilling season.',
    price: 11.98,
    accentHue: 340,
  },
  'TOOLSET-SS-5PC': {
    name: 'Stainless Steel Grill Tool Set',
    brandName: 'GrillMaster',
    productType: 'Grilling Tools',
    shortDescription:
      'A 5-piece stainless steel tool set with heat-resistant handles, built for backyard chefs.',
    price: 24.97,
    accentHue: 200,
  },
  'PB-ORGANIC-2PK': {
    name: 'Organic Peanut Butter 2-Pack',
    brandName: 'Meadow Farms',
    productType: 'Nut Butters',
    shortDescription:
      'Creamy organic peanut butter made with two ingredients — peanuts and a pinch of sea salt.',
    price: 8.48,
    accentHue: 40,
  },
  'PASTA-WG-FAM': {
    name: 'Whole Grain Pasta, Family Size',
    brandName: 'Meadow Farms',
    productType: 'Pasta & Rice',
    shortDescription:
      'Family-size whole grain pasta with a hearty bite, ready in 9 minutes.',
    price: 4.28,
    accentHue: 45,
  },
};

function escapeXml(text: string): string {
  const entities: Record<string, string> = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  };
  return text.replace(/[<>&'"]/g, (c) => entities[c]);
}

/** Inline SVG data URI placeholder — no external network call, per the
 * simulated-mode convention used elsewhere in this app (local POC assets). */
function svgPlaceholder(label: string, width: number, height: number, hue: number): string {
  const bg = `hsl(${hue}, 55%, 88%)`;
  const fg = `hsl(${hue}, 45%, 32%)`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(10, width / 12)}" fill="${fg}">${escapeXml(label)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const KEYWORD_MODIFIERS = [
  'best value',
  'family size',
  'deals',
  'top rated',
  'bulk pack',
  'gift set',
];

/** Derives ad-targeting keyword candidates from product name/brand/category. */
export function buildKeywords(
  name: string,
  brandName?: string,
  productType?: string,
): string[] {
  const stem = name.split(' ').slice(0, 2).join(' ').toLowerCase();
  const base = [stem, brandName?.toLowerCase(), productType?.toLowerCase()].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
  const rand = seededRandom(`keywords:${name}`);
  const modifiers = [...KEYWORD_MODIFIERS]
    .sort(() => rand() - 0.5)
    .slice(0, 3);
  return [...new Set([...base, ...modifiers.map((m) => `${stem} ${m}`)])];
}

function genericProductSeed(sku: string): ProductSeed {
  const rand = seededRandom(`product:${sku}`);
  const brands = ['Everyday Essentials', 'HomeCraft', 'ValueLine', 'Northgate', 'Ridgeline'];
  const nouns = [
    'Storage Bin Set',
    'Kitchen Utensil Set',
    'Throw Blanket',
    'Desk Organizer',
    'Cookware Set',
    'Backpack',
  ];
  const productTypes = [
    'Storage & Organization',
    'Cookware',
    'Bedding',
    'Desk Accessories',
    'Cookware',
    'Backpacks',
  ];
  const index = Math.floor(rand() * nouns.length);
  const brandName = brands[Math.floor(rand() * brands.length)];
  const noun = nouns[index];
  return {
    name: `${brandName} ${noun}`,
    brandName,
    productType: productTypes[index],
    shortDescription: `A durable, everyday ${noun.toLowerCase()} from ${brandName}, sized for real life.`,
    price: Math.round((10 + rand() * 60) * 100) / 100,
    accentHue: Math.floor(rand() * 360),
  };
}

/** A seller SKU is an arbitrary alphanumeric ID the seller assigns. */
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;

export function lookupProduct(sku: string): WmcProduct | null {
  if (!SKU_PATTERN.test(sku)) return null;
  const seed = PRODUCT_CATALOG[sku] ?? genericProductSeed(sku);
  const large = svgPlaceholder(seed.name, 800, 800, seed.accentHue);
  const medium = svgPlaceholder(seed.name, 400, 400, seed.accentHue);
  const thumbnail = svgPlaceholder(seed.name, 120, 120, seed.accentHue);
  const lifestyle = svgPlaceholder(`${seed.name} — lifestyle`, 800, 800, (seed.accentHue + 40) % 360);
  // Simulated wpid: what a live-matched item's Walmart Item ID would look
  // like, so the product page URL mirrors a real published item.
  const wpid = String(100000000 + Math.floor(seededRandom(`wpid:${sku}`)() * 800000000));
  return {
    sku,
    wpid,
    name: seed.name,
    productType: seed.productType,
    price: { amount: seed.price, currency: 'USD' },
    publishedStatus: 'PUBLISHED',
    lifecycleStatus: 'ACTIVE',
    brandName: seed.brandName,
    shortDescription: seed.shortDescription,
    keywords: buildKeywords(seed.name, seed.brandName, seed.productType),
    images: { thumbnail, medium, large },
    additionalImages: [lifestyle],
    productTrackingUrl: `https://www.walmart.com/ip/${wpid}`,
    contentComplete: true,
  };
}
