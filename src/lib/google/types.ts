/** Shapes the dashboard pages render. Real and demo data share them. */

export type ReportState<T> =
  | { status: "ok"; data: T; source: "google" | "demo"; fetchedAt: string }
  | { status: "not_connected" }
  | { status: "error"; message: string; needsReconnect: boolean };

/* ---------------------------- Search Console ---------------------------- */

export type GscTotals = {
  clicks: number;
  impressions: number;
  /** Fraction between 0 and 1. */
  ctr: number;
  /** Impression-weighted average position, or null with no impressions. */
  position: number | null;
};

export type GscPoint = {
  date: string;
  previousDate?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
  previousClicks?: number | null;
  previousImpressions?: number | null;
  previousCtr?: number | null;
  previousPosition?: number | null;
};

export type GscRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previousClicks: number | null;
  previousImpressions: number | null;
  previousPosition: number | null;
};

export type GscReport = {
  totals: GscTotals;
  previousTotals: GscTotals | null;
  series: GscPoint[];
  queries: GscRow[];
  pages: GscRow[];
  devices: { key: string; clicks: number; impressions: number }[];
  countries: { key: string; clicks: number; impressions: number }[];
};

/* ------------------------------ Analytics ------------------------------ */

export type Ga4Totals = {
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
  /** Fraction between 0 and 1. */
  engagementRate: number;
  /** Seconds. */
  averageSessionDuration: number;
  pageViews: number;
  keyEvents: number;
};

export type Ga4Point = {
  date: string;
  previousDate?: string;
  sessions: number;
  users: number;
  keyEvents: number;
  previousSessions?: number | null;
  previousUsers?: number | null;
  previousKeyEvents?: number | null;
};

export type Ga4Breakdown = {
  key: string;
  sessions: number;
  keyEvents: number;
  engagementRate: number | null;
  previousSessions: number | null;
};

export type Ga4Report = {
  /** "all" or "organic" (Organic Search only). */
  segment: "all" | "organic";
  totals: Ga4Totals;
  previousTotals: Ga4Totals | null;
  series: Ga4Point[];
  channels: Ga4Breakdown[];
  landingPages: Ga4Breakdown[];
  devices: { key: string; sessions: number }[];
};

/* --------------------------- Business Profile --------------------------- */

export type GbpTotals = {
  /** People who saw the profile on Search or Maps. */
  impressions: number;
  searchImpressions: number;
  mapsImpressions: number;
  calls: number;
  websiteClicks: number;
  directions: number;
  /** Calls + website clicks + direction requests. */
  actions: number;
};

export type GbpPoint = {
  date: string;
  previousDate?: string;
  impressions: number;
  actions: number;
  calls: number;
  websiteClicks: number;
  directions: number;
  previousImpressions?: number | null;
  previousActions?: number | null;
};

export type GbpReview = {
  reviewer: string;
  /** 1 to 5. */
  rating: number;
  comment: string;
  createdAt: string;
  replied: boolean;
};

export type GbpReport = {
  totals: GbpTotals;
  previousTotals: GbpTotals | null;
  series: GbpPoint[];
  /** Where people saw the profile, e.g. "Search on mobile". */
  surfaces: { key: string; value: number }[];
  /** Search terms that showed the profile. Small counts are reported as "fewer than N". */
  keywords: { keyword: string; impressions: number | null; lessThan: number | null }[];
  /** The months the keyword figures cover, e.g. "Sep to Oct 2026". */
  keywordsPeriod: string | null;
  reviews: { averageRating: number | null; total: number; recent: GbpReview[] } | null;
  /** Problems fetching optional parts (keywords, reviews) that did not stop the report. */
  warnings: string[];
};
