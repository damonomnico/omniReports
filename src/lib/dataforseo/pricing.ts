/**
 * DataForSEO list prices in USD, from their pricing page (checked Nov 2026).
 * Google organic results are billed per page of ten results, so a top 100
 * check costs ten units. Google Maps is billed per 100 results.
 * These are only used for the cost estimates shown to staff: the real cost
 * of every request is recorded from the API response.
 */
export const PRICE_PER_PAGE_STANDARD = 0.0006;
export const PRICE_PER_PAGE_PRIORITY = 0.0012;
export const PRICE_PER_PAGE_LIVE = 0.002;
export const PRICE_SEARCH_VOLUME_REQUEST = 0.09;
