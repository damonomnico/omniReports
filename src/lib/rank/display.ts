/** Presentation helpers shared by server and client rank components. */

export const FEATURE_LABELS: Record<string, string> = {
  ai_overview: "AI overview",
  ai_overview_cited: "Cited in AI overview",
  featured_snippet: "Featured snippet",
  featured_snippet_owned: "Owns featured snippet",
  local_pack: "Local pack",
  people_also_ask: "People also ask",
  knowledge_graph: "Knowledge panel",
  images: "Images",
  video: "Videos",
  top_stories: "Top stories",
  shopping: "Shopping",
  paid: "Ads",
};

/** Features the client holds itself, worth calling out. */
export const OWNED_FEATURES = new Set(["ai_overview_cited", "featured_snippet_owned"]);

export type Movement =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "same" }
  | { kind: "up"; by: number; entered: boolean }
  | { kind: "down"; by: number; lost: boolean };

/**
 * How a keyword moved between two checks. Lower positions are better, so a
 * move from 8 to 5 is "up 3". Entering or leaving the tracked results is
 * flagged rather than given a made-up number.
 */
export function describeMovement(
  position: number | null,
  startPosition: number | null,
  hasStart: boolean,
  checked: boolean,
): Movement {
  if (!checked) return { kind: "none" };
  if (!hasStart) return { kind: "new" };
  if (position === null && startPosition === null) return { kind: "same" };
  if (position !== null && startPosition === null) return { kind: "up", by: 0, entered: true };
  if (position === null && startPosition !== null) return { kind: "down", by: 0, lost: true };
  const diff = startPosition! - position!;
  if (diff === 0) return { kind: "same" };
  return diff > 0
    ? { kind: "up", by: diff, entered: false }
    : { kind: "down", by: -diff, lost: false };
}

/** Sort value for a position where "not ranking" and "never checked" go last. */
export function positionSortValue(position: number | null, checked: boolean): number {
  if (!checked) return 100_000;
  return position ?? 10_000;
}
