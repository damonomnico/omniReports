import type { RankFilters } from "./queries";

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseRankFilters(params: Params): RankFilters {
  const device = one(params.device);
  const tag = one(params.tag)?.trim().toLowerCase().slice(0, 40);
  return {
    device: device === "desktop" || device === "mobile" ? device : undefined,
    tag: tag || undefined,
  };
}

/** Rebuilds the query string from the params worth carrying between rank pages. */
export function carryQuery(params: Params): string {
  const out = new URLSearchParams();
  for (const key of ["range", "from", "to", "compare", "device", "tag"]) {
    const v = one(params[key]);
    if (v) out.set(key, v);
  }
  return out.toString();
}
