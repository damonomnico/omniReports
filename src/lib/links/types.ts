export const LINK_TYPES = [
  { value: "guest_post", label: "Guest post" },
  { value: "niche_edit", label: "Link insertion" },
  { value: "digital_pr", label: "Digital PR" },
  { value: "citation", label: "Citation / directory" },
  { value: "resource", label: "Resource page" },
  { value: "social", label: "Social profile" },
  { value: "other", label: "Other" },
] as const;

export type LinkTypeValue = (typeof LINK_TYPES)[number]["value"];

export function linkTypeLabel(value: string): string {
  return LINK_TYPES.find((t) => t.value === value)?.label ?? "Other";
}

export const LINK_STATUSES = [
  { value: "live", label: "Live" },
  { value: "pending", label: "Pending" },
  { value: "lost", label: "Lost" },
] as const;

export const LINK_RELS = [
  { value: "dofollow", label: "Follow" },
  { value: "nofollow", label: "Nofollow" },
  { value: "sponsored", label: "Sponsored" },
  { value: "ugc", label: "UGC" },
] as const;

/** What a client user is allowed to see about a link. */
export type LinkForClient = {
  id: string;
  sourceUrl: string;
  sourceDomain: string;
  targetUrl: string;
  anchorText: string;
  linkType: string;
  rel: string;
  domainRating: number | null;
  status: "live" | "pending" | "lost";
  builtOn: string;
  clientNote: string;
};

/** Adds the fields only the omniSEO team may see. */
export type LinkForStaff = LinkForClient & {
  cost: string | null;
  internalNote: string;
};
