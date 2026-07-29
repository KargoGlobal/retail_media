/**
 * Types mirroring the Walmart Connect (WMC) Display Ads API contracts.
 * https://developer.walmart.com/advertising-partners/docs/introduction-to-walmart-connect-ads-apis
 */

export type WmcObjective = 'awareness' | 'engagement' | 'conversion';
export type WmcMediaType = 'banner' | 'video';
export type WmcBudgetType = 'daily' | 'total';
export type WmcDeliverySpeed = 'frontloaded' | 'evenly';
export type WmcCampaignStatus =
  | 'scheduled'
  | 'live'
  | 'paused'
  | 'completed'
  | 'proposal';
export type WmcMatchType = 'BROAD' | 'EXACT';
export type WmcCreativeRotationMode = 'OPTIMIZE_PERFORMANCE' | 'ROTATE_EVENLY';

export type WmcCampaign = {
  campaignId: number;
  advertiserId: number;
  name: string;
  description?: string;
  objective: WmcObjective;
  campaignType: 'ngd';
  mediaType: WmcMediaType;
  /** ISO 8601 datetimes, e.g. 2026-07-20T12:00:00-05:00 */
  startDate: string;
  endDate: string;
  budgetType: WmcBudgetType;
  dailyBudget?: number;
  totalBudget?: number;
  deliverySpeed: WmcDeliverySpeed;
  status: WmcCampaignStatus;
};

export type WmcCampaignInput = Omit<WmcCampaign, 'campaignId' | 'status'> & {
  advertiserId?: number;
};

export type WmcCampaignUpdate = {
  campaignId: number;
  advertiserId?: number;
  name?: string;
  status?: WmcCampaignStatus;
  dailyBudget?: number;
  totalBudget?: number;
  endDate?: string;
};

/** Flattened targeting structure (include/exclude arrays). Pick one strategy. */
export type WmcTargeting = {
  keywords?: {
    include?: Array<{ matchType: WmcMatchType; keywordText: string }>;
    exclude?: Array<{ matchType: WmcMatchType; keywordText: string }>;
  };
  contextual?: {
    include?: Array<{ id: number; reach: string }>; // reach: tier_1 .. tier_7
  };
  behavioral?: {
    include?: Array<{ id: number; audienceType: string; attribute?: string }>;
  };
  geoTargets?: {
    include?: Array<{ id?: number; zipCode?: string }>;
  };
  runOfSite?: boolean;
};

export type WmcAdGroup = {
  adGroupId: number;
  campaignId: number;
  advertiserId: number;
  name: string;
  startDate: string;
  endDate: string;
  rateType: 'cpm';
  budgetType?: WmcBudgetType;
  dailyBudget?: number;
  totalBudget?: number;
  deliverySpeed?: WmcDeliverySpeed;
  maxBid?: number;
  creativeRotationMode?: WmcCreativeRotationMode;
  frequencyCapDay?: number;
  frequencyCapWeek?: number;
  frequencyCapMonth?: number;
  targeting?: WmcTargeting;
  status: 'enabled' | 'paused';
};

export type WmcAdGroupInput = Omit<WmcAdGroup, 'adGroupId' | 'status'> & {
  advertiserId?: number;
};

export type WmcCreative = {
  creativeId: number;
  advertiserId: number;
  name: string;
  mediaType: WmcMediaType;
  /** e.g. "970x250", "728x90", "300x250" (banner) or duration for video */
  adSize: string;
  clickUrl: string;
  assetUrl: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
};

export type WmcCreativeInput = Omit<
  WmcCreative,
  'creativeId' | 'reviewStatus'
> & { advertiserId?: number };

export type WmcCreativeAssociation = {
  adGroupId: number;
  creativeId: number;
  status: 'enabled' | 'paused';
};

/**
 * Product/catalog lookup — a different Walmart API surface than Display Ads
 * (seller item management, not campaign management). Field names follow the
 * Walmart Marketplace Items API (GET /v3/items?sku=...): `sku` is the
 * seller-assigned alphanumeric ID; `wpid` is Walmart's own item ID, present
 * once the item is published/matched. The confirmed top-level ItemResponse
 * fields are sku, wpid, productName, productType, price, publishedStatus,
 * lifecycleStatus — there is NO fixed title/description/image field.
 * Marketing content (description, images, brand) lives in a category-specific
 * `additionalAttributes` bag whose keys vary by product-type spec, so it's
 * extracted best-effort in live mode. `contentComplete` flags whether we
 * actually found real description/image data vs. a simulated placeholder.
 */
export type WmcProductImages = {
  thumbnail: string;
  medium: string;
  large: string;
};

export type WmcProduct = {
  sku: string;
  /** Walmart's own item ID; present once the item is published/matched. */
  wpid?: string;
  name: string;
  productType?: string;
  price?: { amount: number; currency: string };
  publishedStatus?: 'PUBLISHED' | 'UNPUBLISHED';
  lifecycleStatus?: 'ACTIVE' | 'ARCHIVED' | 'RETIRED';
  brandName?: string;
  shortDescription?: string;
  /** Derived (not a native field) from name/brand/productType or attributes. */
  keywords: string[];
  images: WmcProductImages;
  additionalImages?: string[];
  productTrackingUrl: string;
  /** false in live mode when description/images weren't found in additionalAttributes. */
  contentComplete: boolean;
};

/** WMC mutation endpoints return one result object per submitted entity. */
export type WmcMutationResult = {
  code: 'success' | 'failure';
  details: string | string[];
  name?: string;
  campaignId?: number;
  adGroupId?: number;
  creativeId?: number;
};

export type WmcReportType = 'campaign' | 'lineItem' | 'creative';

export type WmcSnapshotRow = {
  date: string;
  campaignId: number;
  campaignName: string;
  /** Ad group (lineItem) or creative label for those report types. */
  entityLabel?: string;
  impressions: number;
  viewableImpressions: number;
  clicks: number;
  adSpend: number;
  attributedSales: number;
  unitsSold: number;
  newBuyers: number;
};

export type WmcSnapshotJob = {
  code?: 'success' | 'failure';
  snapshotId: string;
  advertiserId: number;
  reportType: WmcReportType;
  jobStatus: 'pending' | 'processing' | 'done' | 'failed' | 'expired';
  /** Live mode: signed URL to the gzipped report file returned by WMC. */
  details?: string;
  /** Simulated mode: report rows returned inline. */
  rows?: WmcSnapshotRow[];
};
