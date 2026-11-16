import { describe, expect, it } from "vitest";
import type { SerpResult } from "./client";
import { businessNameMatches, parseMapsResult, parseOrganicResult } from "./parse";

const organic = (rankGroup: number, rankAbsolute: number, domain: string, path = "/") => ({
  type: "organic",
  rank_group: rankGroup,
  rank_absolute: rankAbsolute,
  domain,
  url: `https://${domain}${path}`,
  title: domain,
});

const pack = (rankGroup: number, title: string, domain: string | null = null) => ({
  type: "local_pack",
  rank_group: rankGroup,
  rank_absolute: rankGroup,
  title,
  domain,
  url: domain ? `https://${domain}/` : null,
});

function serp(items: SerpResult["items"], itemTypes?: string[]): SerpResult {
  return {
    keyword: "plumber cardiff",
    item_types: itemTypes ?? [...new Set((items ?? []).map((i) => i.type))],
    se_results_count: 1234000,
    items,
  };
}

const target = { domain: "harbourplumbing.co.uk", businessName: "Harbour Plumbing & Heating Ltd" };

describe("parseOrganicResult", () => {
  it("finds the client's organic position, url and absolute position", () => {
    const r = parseOrganicResult(
      serp([
        { type: "paid", rank_group: 1, rank_absolute: 1, domain: "ads.example" },
        organic(1, 2, "www.rival.co.uk"),
        organic(2, 3, "www.harbourplumbing.co.uk", "/boiler-repair/"),
        organic(3, 4, "another.co.uk"),
      ]),
      target,
    );
    expect(r.position).toBe(2);
    expect(r.absolutePosition).toBe(3);
    expect(r.url).toBe("https://www.harbourplumbing.co.uk/boiler-repair/");
    expect(r.resultsCount).toBe(1234000);
  });

  it("matches subdomains but not lookalike domains", () => {
    const sub = parseOrganicResult(serp([organic(1, 1, "blog.harbourplumbing.co.uk")]), target);
    expect(sub.position).toBe(1);

    const lookalike = parseOrganicResult(
      serp([organic(1, 1, "notharbourplumbing.co.uk"), organic(2, 2, "harbourplumbing.co.uk.evil.com")]),
      target,
    );
    expect(lookalike.position).toBeNull();
  });

  it("returns nulls when the client is not in the results", () => {
    const r = parseOrganicResult(serp([organic(1, 1, "rival.co.uk")]), target);
    expect(r.position).toBeNull();
    expect(r.url).toBeNull();
    expect(r.absolutePosition).toBeNull();
    expect(r.localPackPosition).toBeNull();
  });

  it("handles an empty or missing result (no search results)", () => {
    expect(parseOrganicResult(null, target).position).toBeNull();
    expect(parseOrganicResult(serp(null), target).serpFeatures).toEqual([]);
  });

  it("uses the first listing when the site appears more than once", () => {
    const r = parseOrganicResult(
      serp([
        organic(1, 1, "rival.co.uk"),
        organic(2, 2, "harbourplumbing.co.uk", "/a/"),
        organic(3, 3, "harbourplumbing.co.uk", "/b/"),
      ]),
      target,
    );
    expect(r.position).toBe(2);
    expect(r.url).toContain("/a/");
  });

  it("counts a featured snippet as position 1 and shifts organic results down", () => {
    const rivalOwnsSnippet = parseOrganicResult(
      serp([
        { type: "featured_snippet", rank_group: 1, rank_absolute: 1, domain: "rival.co.uk", url: "https://rival.co.uk/" },
        organic(1, 2, "harbourplumbing.co.uk"),
      ]),
      target,
    );
    expect(rivalOwnsSnippet.position).toBe(2);
    expect(rivalOwnsSnippet.serpFeatures).toContain("featured_snippet");
    expect(rivalOwnsSnippet.serpFeatures).not.toContain("featured_snippet_owned");

    const clientOwnsSnippet = parseOrganicResult(
      serp([
        { type: "featured_snippet", rank_group: 1, rank_absolute: 1, domain: "www.harbourplumbing.co.uk", url: "https://www.harbourplumbing.co.uk/guide/" },
        organic(1, 2, "rival.co.uk"),
      ]),
      target,
    );
    expect(clientOwnsSnippet.position).toBe(1);
    expect(clientOwnsSnippet.serpFeatures).toContain("featured_snippet_owned");
  });

  it("finds the local pack position by website or by business name", () => {
    const byDomain = parseOrganicResult(
      serp([pack(1, "Someone Else"), pack(2, "HP&H", "harbourplumbing.co.uk"), organic(1, 4, "rival.co.uk")]),
      target,
    );
    expect(byDomain.localPackPosition).toBe(2);

    const byName = parseOrganicResult(
      serp([pack(1, "Bayside Plumbers"), pack(2, "Cardiff Heating"), pack(3, "Harbour Plumbing and Heating")]),
      target,
    );
    expect(byName.localPackPosition).toBe(3);
    expect(byName.serpFeatures).toContain("local_pack");
  });

  it("reports competitor positions from the same results", () => {
    const r = parseOrganicResult(
      serp([organic(1, 1, "www.rival.co.uk"), organic(2, 2, "harbourplumbing.co.uk"), organic(3, 3, "third.co.uk")]),
      target,
      [
        { id: "c1", domain: "rival.co.uk" },
        { id: "c2", domain: "absent.co.uk" },
      ],
    );
    expect(r.competitors.c1?.position).toBe(1);
    expect(r.competitors.c2?.position).toBeNull();
  });

  it("flags a citation inside an AI overview", () => {
    const r = parseOrganicResult(
      serp([
        {
          type: "ai_overview",
          rank_group: 1,
          rank_absolute: 1,
          items: [{ type: "ai_overview_element", references: [{ domain: "harbourplumbing.co.uk", url: "https://harbourplumbing.co.uk/x" }] }],
        },
        organic(1, 2, "rival.co.uk"),
      ]),
      target,
    );
    expect(r.serpFeatures).toContain("ai_overview");
    expect(r.serpFeatures).toContain("ai_overview_cited");
    expect(r.position).toBeNull();
  });
});

describe("parseMapsResult", () => {
  it("returns the business's position in Google Maps", () => {
    const result = serp([
      { type: "maps_search", rank_group: 1, rank_absolute: 1, title: "Bayside Plumbers", domain: "baysideplumbers.co.uk" },
      { type: "maps_paid_item", rank_group: 1, rank_absolute: 2, title: "Harbour Plumbing & Heating" },
      { type: "maps_search", rank_group: 2, rank_absolute: 3, title: "Harbour Plumbing & Heating", domain: "www.harbourplumbing.co.uk" },
    ]);
    expect(parseMapsResult(result, target)).toBe(2);
    expect(parseMapsResult(result, { domain: "nowhere.co.uk", businessName: "Nobody" })).toBeNull();
  });
});

describe("businessNameMatches", () => {
  it("ignores punctuation, case and company suffixes", () => {
    expect(businessNameMatches("Harbour Plumbing and Heating", "Harbour Plumbing & Heating Ltd")).toBe(true);
    expect(businessNameMatches("HARBOUR PLUMBING & HEATING - Cardiff", "Harbour Plumbing & Heating")).toBe(true);
  });

  it("does not match unrelated or partial-word names", () => {
    expect(businessNameMatches("Harbourside Plumbers", "Harbour Plumbing & Heating")).toBe(false);
    expect(businessNameMatches("Bay Plumbing", "Harbour Plumbing & Heating")).toBe(false);
    expect(businessNameMatches(null, "Harbour")).toBe(false);
    expect(businessNameMatches("Anything", "")).toBe(false);
  });
});
