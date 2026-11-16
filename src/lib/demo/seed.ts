import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  competitorRanks,
  competitors,
  keywords,
  links,
  rankResults,
} from "@/db/schema";
import { addDays, todayInTz } from "@/lib/dates";
import { createRng } from "./random";

export const DEMO_DOMAIN = "harbourplumbing.example";

const KEYWORDS: { keyword: string; tags: string[]; volume: number; local: boolean }[] = [
  { keyword: "plumber cardiff", tags: ["core", "plumbing"], volume: 2400, local: true },
  { keyword: "emergency plumber cardiff", tags: ["core", "emergency"], volume: 1300, local: true },
  { keyword: "boiler repair cardiff", tags: ["core", "boilers"], volume: 880, local: true },
  { keyword: "boiler installation cardiff", tags: ["boilers"], volume: 720, local: true },
  { keyword: "boiler service cardiff", tags: ["boilers"], volume: 590, local: true },
  { keyword: "gas engineer cardiff", tags: ["core", "gas"], volume: 480, local: true },
  { keyword: "central heating installation cardiff", tags: ["heating"], volume: 210, local: true },
  { keyword: "bathroom fitters cardiff", tags: ["bathrooms"], volume: 390, local: true },
  { keyword: "blocked drain cardiff", tags: ["drains", "emergency"], volume: 320, local: true },
  { keyword: "24 hour plumber cardiff", tags: ["emergency"], volume: 260, local: true },
  { keyword: "plumber near me", tags: ["near me"], volume: 1900, local: true },
  { keyword: "emergency plumber near me", tags: ["near me", "emergency"], volume: 1600, local: true },
  { keyword: "boiler repair near me", tags: ["near me", "boilers"], volume: 1000, local: true },
  { keyword: "gas safe engineer near me", tags: ["near me", "gas"], volume: 720, local: true },
  { keyword: "plumber penarth", tags: ["areas"], volume: 170, local: true },
  { keyword: "plumber barry", tags: ["areas"], volume: 210, local: true },
  { keyword: "plumber newport", tags: ["areas"], volume: 590, local: true },
  { keyword: "plumber cardiff bay", tags: ["areas"], volume: 90, local: true },
  { keyword: "landlord gas safety certificate cardiff", tags: ["gas", "landlords"], volume: 260, local: true },
  { keyword: "power flushing cardiff", tags: ["heating"], volume: 140, local: true },
  { keyword: "underfloor heating installation cardiff", tags: ["heating"], volume: 110, local: false },
  { keyword: "radiator installation cardiff", tags: ["heating"], volume: 90, local: true },
  { keyword: "leaking tap repair", tags: ["guides"], volume: 880, local: false },
  { keyword: "how to bleed a radiator", tags: ["guides"], volume: 2900, local: false },
  { keyword: "boiler losing pressure", tags: ["guides", "boilers"], volume: 2400, local: false },
  { keyword: "combi boiler vs system boiler", tags: ["guides", "boilers"], volume: 1300, local: false },
  { keyword: "how much does a new boiler cost", tags: ["guides", "boilers"], volume: 1900, local: false },
  { keyword: "worcester bosch installer cardiff", tags: ["boilers", "brand"], volume: 70, local: true },
  { keyword: "vaillant boiler repair cardiff", tags: ["boilers", "brand"], volume: 50, local: true },
  { keyword: "commercial plumber cardiff", tags: ["commercial"], volume: 110, local: true },
  { keyword: "bathroom installation cardiff", tags: ["bathrooms"], volume: 260, local: true },
  { keyword: "wet room installation cardiff", tags: ["bathrooms"], volume: 90, local: false },
  { keyword: "hot water cylinder replacement cardiff", tags: ["heating"], volume: 40, local: true },
  { keyword: "burst pipe repair cardiff", tags: ["emergency"], volume: 70, local: true },
  { keyword: "harbour plumbing", tags: ["brand"], volume: 320, local: true },
  { keyword: "harbour plumbing and heating reviews", tags: ["brand"], volume: 50, local: false },
];

const PAGES = [
  "/",
  "/emergency-plumber-cardiff/",
  "/boiler-repair/",
  "/boiler-installation/",
  "/gas-safety-certificates/",
  "/bathrooms/",
  "/central-heating/",
  "/blocked-drains/",
  "/areas/penarth/",
  "/areas/barry/",
  "/blog/boiler-losing-pressure/",
  "/blog/how-to-bleed-a-radiator/",
];

/** Picks the page a keyword would plausibly rank with. */
function pageFor(keyword: string, tags: string[]): string | null {
  if (keyword.includes("bleed a radiator")) return "/blog/how-to-bleed-a-radiator/";
  if (keyword.includes("losing pressure")) return "/blog/boiler-losing-pressure/";
  if (keyword.includes("penarth")) return "/areas/penarth/";
  if (keyword.includes("barry")) return "/areas/barry/";
  if (tags.includes("emergency")) return "/emergency-plumber-cardiff/";
  if (keyword.includes("installation") && tags.includes("boilers")) return "/boiler-installation/";
  if (tags.includes("boilers")) return "/boiler-repair/";
  if (tags.includes("gas")) return "/gas-safety-certificates/";
  if (tags.includes("bathrooms")) return "/bathrooms/";
  if (tags.includes("heating")) return "/central-heating/";
  if (tags.includes("drains")) return "/blocked-drains/";
  if (tags.includes("core") || tags.includes("near me") || tags.includes("areas")) return "/";
  return null;
}

const COMPETITORS = [
  { domain: "cardiffheatingco.example", label: "Cardiff Heating Co" },
  { domain: "baysideplumbers.example", label: "Bayside Plumbers" },
  { domain: "taffvalleygas.example", label: "Taff Valley Gas" },
];

const LINK_SOURCES: { domain: string; type: string; dr: number }[] = [
  { domain: "southwalesbusinessnews.example", type: "digital_pr", dr: 62 },
  { domain: "cardifftradesdirectory.example", type: "citation", dr: 38 },
  { domain: "welshhomesmagazine.example", type: "guest_post", dr: 51 },
  { domain: "trustedlocaltrades.example", type: "citation", dr: 44 },
  { domain: "thepropertylandlord.example", type: "guest_post", dr: 47 },
  { domain: "renovationdiaries.example", type: "niche_edit", dr: 41 },
  { domain: "valelifestyle.example", type: "guest_post", dr: 35 },
  { domain: "heatingadvicehub.example", type: "niche_edit", dr: 55 },
  { domain: "cardiffcommunityhub.example", type: "citation", dr: 29 },
  { domain: "ukhomeimprovementguide.example", type: "guest_post", dr: 58 },
  { domain: "energysavingwales.example", type: "digital_pr", dr: 66 },
  { domain: "localbizfinder.example", type: "citation", dr: 33 },
  { domain: "bathroominspiration.example", type: "niche_edit", dr: 46 },
  { domain: "penarthtimes.example", type: "digital_pr", dr: 49 },
  { domain: "tradesmanreviews.example", type: "citation", dr: 52 },
  { domain: "greenhomeblog.example", type: "guest_post", dr: 43 },
];

const ANCHORS = [
  "Harbour Plumbing & Heating",
  "plumber in Cardiff",
  "emergency plumber Cardiff",
  "boiler repair specialists",
  "harbourplumbing.example",
  "Gas Safe engineers in Cardiff",
  "this Cardiff plumbing company",
  "boiler installation in Cardiff",
  "read their guide",
  "local heating engineers",
];

const HISTORY_DAYS = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Creates (or rebuilds) the demo client: a fictional Cardiff plumber with
 * five months of rankings, competitors and links. Everything is generated and
 * stored with source "demo"; no external API is called.
 */
export async function seedDemoClient(): Promise<string> {
  await db.delete(clients).where(eq(clients.domain, DEMO_DOMAIN));

  const [client] = await db
    .insert(clients)
    .values({
      name: "Harbour Plumbing & Heating",
      domain: DEMO_DOMAIN,
      websiteUrl: `https://www.${DEMO_DOMAIN}/`,
      businessName: "Harbour Plumbing & Heating",
      isDemo: true,
      rankFrequency: "daily",
      rankDepth: 100,
    })
    .returning();
  const clientId = client!.id;
  const today = todayInTz("Europe/London");

  const keywordRows = await db
    .insert(keywords)
    .values(
      KEYWORDS.map((k) => ({
        clientId,
        keyword: k.keyword,
        locationCode: 1006886,
        locationName: "Cardiff,Wales,United Kingdom",
        languageCode: "en",
        device: "desktop" as const,
        tags: k.tags,
        trackMaps: k.local && k.tags.includes("core"),
        searchVolume: k.volume,
        cpc: String(Math.round((2 + (k.volume % 9)) * 100) / 100),
        volumeUpdatedAt: new Date(),
      })),
    )
    .returning();

  const rivalRows = await db
    .insert(competitors)
    .values(COMPETITORS.map((c) => ({ clientId, ...c })))
    .returning();

  const results: (typeof rankResults.$inferInsert)[] = [];
  const rivalResults: (typeof competitorRanks.$inferInsert)[] = [];

  keywordRows.forEach((kw, index) => {
    const spec = KEYWORDS[index]!;
    const rng = createRng(`kw:${kw.keyword}`);
    const brand = spec.tags.includes("brand") && kw.keyword.startsWith("harbour");

    // Most keywords climb over the period, a few slip, a few never rank.
    const story = brand ? "brand" : rng.chance(0.72) ? "climb" : rng.chance(0.55) ? "flat" : "slip";
    const start = brand ? rng.int(1, 3) : story === "climb" ? rng.int(18, 95) : rng.int(6, 60);
    const end = brand
      ? 1
      : story === "climb"
        ? Math.max(1, Math.round(start * rng.between(0.08, 0.45)))
        : story === "flat"
          ? start + rng.int(-3, 3)
          : Math.min(100, start + rng.int(4, 18));
    const page = brand ? "/" : pageFor(spec.keyword, spec.tags) ?? rng.pick(PAGES);
    const packStart = spec.local ? rng.int(40, 120) : 999;
    let drift = 0;

    const rivalLevels = rivalRows.map((r) => {
      const rr = createRng(`rival:${r.domain}:${kw.keyword}`);
      return { id: r.id, level: rr.int(2, 45), ranks: rr.chance(0.85), rng: rr };
    });

    for (let d = HISTORY_DAYS - 1; d >= 0; d--) {
      const date = addDays(today, -d);
      const t = 1 - d / (HISTORY_DAYS - 1);
      // Ease so progress is slow at first, then steady.
      const eased = t * t * (3 - 2 * t);
      drift = Math.max(-4, Math.min(4, drift + rng.between(-1.1, 1.1)));
      const raw = Math.round(start + (end - start) * eased + drift);
      const position = raw > 100 ? null : Math.max(1, raw);

      let localPackPosition: number | null = null;
      if (spec.local && position !== null && d < packStart) {
        const pack = position <= 4 ? 1 : position <= 9 ? 2 : position <= 16 ? 3 : null;
        localPackPosition = pack && rng.chance(0.85) ? pack : null;
      }

      const features: string[] = [];
      if (spec.local) features.push("local_pack");
      if (rng.chance(0.55)) features.push("people_also_ask");
      if (!spec.local && rng.chance(0.35)) features.push("ai_overview");
      if (!spec.local && rng.chance(0.3)) features.push("featured_snippet");
      if (position === 1 && features.includes("featured_snippet") && rng.chance(0.6)) {
        features.push("featured_snippet_owned");
      }
      if (rng.chance(0.4)) features.push("paid");

      results.push({
        clientId,
        keywordId: kw.id,
        checkedOn: date,
        checkedAt: new Date(`${date}T04:${String(rng.int(10, 55)).padStart(2, "0")}:00Z`),
        position,
        absolutePosition: position === null ? null : position + rng.int(0, 4),
        url: position === null ? null : `https://www.${DEMO_DOMAIN}${page}`,
        localPackPosition,
        mapsPosition: kw.trackMaps && position !== null ? Math.max(1, Math.round(position / 2.5) + rng.int(0, 2)) : null,
        serpFeatures: features,
        resultsCount: 1_000_000 + rng.int(0, 40_000_000),
        source: "demo",
      });

      for (const rival of rivalLevels) {
        if (!rival.ranks) continue;
        rival.level = Math.max(1, Math.min(95, rival.level + rival.rng.int(-1, 1)));
        rivalResults.push({
          clientId,
          keywordId: kw.id,
          competitorId: rival.id,
          checkedOn: date,
          position: rival.level,
          url: null,
          localPackPosition: null,
        });
      }
    }
  });

  for (const part of chunk(results, 1000)) await db.insert(rankResults).values(part);
  for (const part of chunk(rivalResults, 1500)) await db.insert(competitorRanks).values(part);

  const linkRng = createRng("demo-links");
  const linkRows: (typeof links.$inferInsert)[] = [];
  for (let month = 5; month >= 0; month--) {
    const count = linkRng.int(4, 7);
    for (let i = 0; i < count; i++) {
      const source = linkRng.pick(LINK_SOURCES);
      const builtOn = addDays(today, -(month * 30 + linkRng.int(0, 28)));
      const slug = linkRng.pick([
        "local-trades-guide",
        "home-heating-tips",
        "winter-boiler-checklist",
        "cardiff-business-spotlight",
        "bathroom-renovation-ideas",
        "landlord-safety-guide",
        "energy-saving-at-home",
        "directory/plumbers",
      ]);
      const recent = month === 0 && linkRng.chance(0.3);
      linkRows.push({
        clientId,
        sourceUrl: `https://www.${source.domain}/${slug}/`,
        sourceDomain: source.domain,
        targetUrl: `https://www.${DEMO_DOMAIN}${linkRng.pick(PAGES)}`,
        anchorText: linkRng.pick(ANCHORS),
        linkType: source.type,
        rel: source.type === "citation" && linkRng.chance(0.5) ? "nofollow" : "dofollow",
        domainRating: source.dr,
        status: recent ? "pending" : linkRng.chance(0.04) ? "lost" : "live",
        builtOn,
        clientNote: source.type === "digital_pr" ? "Earned through our winter boiler safety campaign." : "",
        cost: String(source.type === "citation" ? linkRng.int(15, 40) : linkRng.int(90, 260)),
        internalNote: "",
      });
    }
  }
  await db.insert(links).values(linkRows);

  return clientId;
}
