import { daysBetween, eachDay, formatMonth, startOfMonth, todayInTz, type DateRange, type RangeSelection } from "@/lib/dates";
import type {
  Ga4Breakdown,
  Ga4Report,
  Ga4Totals,
  GbpReport,
  GbpTotals,
  GscReport,
  GscRow,
  GscTotals,
} from "@/lib/google/types";
import { createRng } from "./random";

/**
 * Generated Search Console, Analytics and Business Profile figures for demo
 * clients. Values depend only on the date, so the same day always shows the
 * same numbers and earlier periods are a little lower (steady growth).
 */

const WEEKDAY_FACTOR = [0.66, 1.08, 1.12, 1.1, 1.06, 0.98, 0.72]; // Sun..Sat

function level(seed: string, date: string, base: number, today: string): number {
  const daysAgo = Math.max(0, daysBetween(date, today));
  const growth = Math.max(0.35, 1 - 0.0021 * daysAgo);
  const weekday = WEEKDAY_FACTOR[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
  const noise = createRng(`${seed}:${date}`).between(0.86, 1.14);
  return base * growth * weekday * noise;
}

const QUERIES: [string, number, number][] = [
  // query, share of clicks, typical position
  ["harbour plumbing", 0.11, 1.1],
  ["plumber cardiff", 0.085, 9.8],
  ["emergency plumber cardiff", 0.07, 8.4],
  ["boiler repair cardiff", 0.062, 7.9],
  ["boiler losing pressure", 0.058, 4.6],
  ["how to bleed a radiator", 0.05, 11.2],
  ["harbour plumbing and heating", 0.045, 1.0],
  ["boiler installation cardiff", 0.041, 6.3],
  ["gas engineer cardiff", 0.036, 12.5],
  ["plumber near me", 0.033, 14.1],
  ["blocked drain cardiff", 0.029, 6.2],
  ["boiler service cardiff", 0.026, 15.8],
  ["plumber penarth", 0.024, 5.5],
  ["leaking tap repair", 0.022, 4.2],
  ["24 hour plumber cardiff", 0.019, 13.4],
  ["landlord gas safety certificate cardiff", 0.017, 9.1],
  ["plumber barry", 0.016, 7.7],
  ["bathroom fitters cardiff", 0.015, 10.6],
  ["combi boiler vs system boiler", 0.013, 18.2],
  ["how much does a new boiler cost", 0.012, 22.4],
  ["emergency plumber near me", 0.011, 12.9],
  ["central heating installation cardiff", 0.01, 8.3],
  ["power flushing cardiff", 0.009, 16.5],
  ["gas safe engineer near me", 0.008, 10.2],
  ["burst pipe repair cardiff", 0.007, 19.7],
];

const PAGES: [string, number, number][] = [
  ["/", 0.27, 6.1],
  ["/emergency-plumber-cardiff/", 0.14, 8.6],
  ["/boiler-repair/", 0.12, 8.2],
  ["/blog/boiler-losing-pressure/", 0.1, 5.1],
  ["/boiler-installation/", 0.08, 7.4],
  ["/blog/how-to-bleed-a-radiator/", 0.075, 11.9],
  ["/gas-safety-certificates/", 0.055, 9.9],
  ["/blocked-drains/", 0.045, 7.0],
  ["/bathrooms/", 0.04, 11.3],
  ["/central-heating/", 0.035, 10.4],
  ["/areas/penarth/", 0.022, 5.9],
  ["/areas/barry/", 0.018, 8.1],
];

function gscTotals(domain: string, range: DateRange, today: string): { totals: GscTotals; days: { date: string; clicks: number; impressions: number; ctr: number; position: number }[] } {
  const days = eachDay(range).map((date) => {
    const clicks = Math.round(level(`${domain}:clicks`, date, 64, today));
    const ctr = createRng(`${domain}:ctr:${date}`).between(0.034, 0.046);
    const impressions = Math.round(clicks / ctr);
    const daysAgo = Math.max(0, daysBetween(date, today));
    const position = 12.4 + daysAgo * 0.018 + createRng(`${domain}:pos:${date}`).between(-0.6, 0.6);
    return { date, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
  });
  const clicks = days.reduce((s, d) => s + d.clicks, 0);
  const impressions = days.reduce((s, d) => s + d.impressions, 0);
  const weighted = days.reduce((s, d) => s + d.position * d.impressions, 0);
  return {
    days,
    totals: {
      clicks,
      impressions,
      ctr: impressions ? clicks / impressions : 0,
      position: impressions ? weighted / impressions : null,
    },
  };
}

function gscRows(
  kind: string,
  list: [string, number, number][],
  prefix: string,
  totals: GscTotals,
  previous: GscTotals | null,
): GscRow[] {
  return list.map(([key, share, position]) => {
    const rng = createRng(`${kind}:${key}`);
    const clicks = Math.round(totals.clicks * share * rng.between(0.9, 1.1));
    const ctr = Math.min(0.6, (0.42 / Math.max(position, 1)) * rng.between(0.7, 1.2));
    const drift = rng.between(-0.6, 2.4);
    return {
      key: `${prefix}${key}`,
      clicks,
      impressions: Math.max(clicks, Math.round(clicks / Math.max(ctr, 0.005))),
      ctr,
      position,
      previousClicks: previous ? Math.round(previous.clicks * share * rng.between(0.8, 1.1)) : null,
      previousImpressions: previous ? Math.round((previous.clicks * share) / Math.max(ctr, 0.005)) : null,
      previousPosition: previous ? Math.max(1, position + drift) : null,
    };
  });
}

export function demoGscReport(domain: string, selection: RangeSelection): GscReport {
  const today = todayInTz("Europe/London");
  const now = gscTotals(domain, selection.current, today);
  const before = selection.previous ? gscTotals(domain, selection.previous, today) : null;

  return {
    totals: now.totals,
    previousTotals: before?.totals ?? null,
    series: now.days.map((d, i) => {
      const p = before?.days[i];
      return {
        ...d,
        ...(p
          ? {
              previousDate: p.date,
              previousClicks: p.clicks,
              previousImpressions: p.impressions,
              previousCtr: p.ctr,
              previousPosition: p.position,
            }
          : {}),
      };
    }),
    queries: gscRows("q", QUERIES, "", now.totals, before?.totals ?? null).sort((a, b) => b.clicks - a.clicks),
    pages: gscRows("p", PAGES, `https://www.${domain}`, now.totals, before?.totals ?? null).sort(
      (a, b) => b.clicks - a.clicks,
    ),
    devices: [
      { key: "mobile", clicks: Math.round(now.totals.clicks * 0.63), impressions: Math.round(now.totals.impressions * 0.58) },
      { key: "desktop", clicks: Math.round(now.totals.clicks * 0.33), impressions: Math.round(now.totals.impressions * 0.38) },
      { key: "tablet", clicks: Math.round(now.totals.clicks * 0.04), impressions: Math.round(now.totals.impressions * 0.04) },
    ],
    countries: [
      { key: "GBR", clicks: Math.round(now.totals.clicks * 0.94), impressions: Math.round(now.totals.impressions * 0.9) },
      { key: "IRL", clicks: Math.round(now.totals.clicks * 0.02), impressions: Math.round(now.totals.impressions * 0.03) },
      { key: "USA", clicks: Math.round(now.totals.clicks * 0.02), impressions: Math.round(now.totals.impressions * 0.04) },
    ],
  };
}

const CHANNELS: [string, number, number][] = [
  // channel, share of sessions, key event rate
  ["Organic Search", 0.58, 0.061],
  ["Direct", 0.18, 0.048],
  ["Referral", 0.09, 0.032],
  ["Organic Social", 0.06, 0.012],
  ["Paid Search", 0.06, 0.071],
  ["Email", 0.03, 0.04],
];

function ga4Days(domain: string, range: DateRange, today: string, share: number) {
  return eachDay(range).map((date) => {
    const sessions = Math.round(level(`${domain}:sessions`, date, 128, today) * share);
    const users = Math.round(sessions * createRng(`${domain}:u:${date}`).between(0.8, 0.88));
    const keyEvents = Math.round(sessions * createRng(`${domain}:k:${date}`).between(0.04, 0.07));
    return { date, sessions, users, keyEvents };
  });
}

function ga4Totals(days: { sessions: number; users: number; keyEvents: number }[], seed: string): Ga4Totals {
  const rng = createRng(seed);
  const sessions = days.reduce((s, d) => s + d.sessions, 0);
  const users = days.reduce((s, d) => s + d.users, 0);
  const engagementRate = rng.between(0.58, 0.66);
  return {
    sessions,
    users: Math.round(users * 0.92),
    newUsers: Math.round(users * 0.71),
    engagedSessions: Math.round(sessions * engagementRate),
    engagementRate,
    averageSessionDuration: rng.between(78, 112),
    pageViews: Math.round(sessions * rng.between(1.9, 2.4)),
    keyEvents: days.reduce((s, d) => s + d.keyEvents, 0),
  };
}

export function demoGa4Report(
  domain: string,
  selection: RangeSelection,
  segment: "all" | "organic",
): Ga4Report {
  const today = todayInTz("Europe/London");
  const share = segment === "organic" ? 0.58 : 1;
  const now = ga4Days(domain, selection.current, today, share);
  const before = selection.previous ? ga4Days(domain, selection.previous, today, share) : null;
  const totals = ga4Totals(now, `${domain}:${selection.current.from}:${segment}`);
  const previousTotals = before ? ga4Totals(before, `${domain}:${selection.previous!.from}:${segment}`) : null;

  // Channels always describe all traffic.
  const allNow = segment === "organic" ? totals.sessions / 0.58 : totals.sessions;
  const allBefore = previousTotals
    ? segment === "organic"
      ? previousTotals.sessions / 0.58
      : previousTotals.sessions
    : null;

  const channels: Ga4Breakdown[] = CHANNELS.map(([key, channelShare, rate]) => ({
    key,
    sessions: Math.round(allNow * channelShare),
    keyEvents: Math.round(allNow * channelShare * rate),
    engagementRate: createRng(`ch:${key}`).between(0.45, 0.7),
    previousSessions:
      allBefore === null
        ? null
        : Math.round(allBefore * channelShare * createRng(`chp:${key}`).between(key === "Organic Search" ? 0.86 : 0.95, 1.05)),
  }));

  const landingPages: Ga4Breakdown[] = PAGES.map(([path, pageShare]) => {
    const rng = createRng(`lp:${path}`);
    const sessions = Math.round(totals.sessions * pageShare * rng.between(0.9, 1.1));
    return {
      key: path,
      sessions,
      keyEvents: Math.round(sessions * rng.between(0.02, 0.09)),
      engagementRate: rng.between(0.48, 0.74),
      previousSessions: previousTotals
        ? Math.round(previousTotals.sessions * pageShare * rng.between(0.8, 1.1))
        : null,
    };
  }).sort((a, b) => b.sessions - a.sessions);

  return {
    segment,
    totals,
    previousTotals,
    series: now.map((d, i) => {
      const p = before?.[i];
      return {
        ...d,
        ...(p
          ? {
              previousDate: p.date,
              previousSessions: p.sessions,
              previousUsers: p.users,
              previousKeyEvents: p.keyEvents,
            }
          : {}),
      };
    }),
    channels,
    landingPages,
    devices: [
      { key: "mobile", sessions: Math.round(totals.sessions * 0.61) },
      { key: "desktop", sessions: Math.round(totals.sessions * 0.35) },
      { key: "tablet", sessions: Math.round(totals.sessions * 0.04) },
    ],
  };
}

function gbpDays(domain: string, range: DateRange, today: string) {
  return eachDay(range).map((date) => {
    const searchMobile = Math.round(level(`${domain}:gbp:sm`, date, 92, today));
    const searchDesktop = Math.round(level(`${domain}:gbp:sd`, date, 31, today));
    const mapsMobile = Math.round(level(`${domain}:gbp:mm`, date, 58, today));
    const mapsDesktop = Math.round(level(`${domain}:gbp:md`, date, 11, today));
    const calls = Math.round(level(`${domain}:gbp:c`, date, 5.2, today));
    const websiteClicks = Math.round(level(`${domain}:gbp:w`, date, 8.6, today));
    const directions = Math.round(level(`${domain}:gbp:d`, date, 2.4, today));
    return { date, searchMobile, searchDesktop, mapsMobile, mapsDesktop, calls, websiteClicks, directions };
  });
}

function gbpTotals(days: ReturnType<typeof gbpDays>): GbpTotals {
  const sum = (pick: (d: (typeof days)[number]) => number) => days.reduce((s, d) => s + pick(d), 0);
  const searchImpressions = sum((d) => d.searchMobile + d.searchDesktop);
  const mapsImpressions = sum((d) => d.mapsMobile + d.mapsDesktop);
  const calls = sum((d) => d.calls);
  const websiteClicks = sum((d) => d.websiteClicks);
  const directions = sum((d) => d.directions);
  return {
    impressions: searchImpressions + mapsImpressions,
    searchImpressions,
    mapsImpressions,
    calls,
    websiteClicks,
    directions,
    actions: calls + websiteClicks + directions,
  };
}

const GBP_KEYWORDS: [string, number][] = [
  ["plumber", 1480],
  ["plumber near me", 1120],
  ["emergency plumber", 760],
  ["harbour plumbing", 540],
  ["boiler repair", 430],
  ["plumber cardiff", 410],
  ["gas engineer", 280],
  ["heating engineer near me", 210],
  ["boiler service", 170],
  ["blocked drain", 120],
  ["bathroom fitter", 64],
  ["24 hour plumber", 38],
];

const REVIEWS: [string, number, string, number, boolean][] = [
  ["Rhian T.", 5, "Came out within the hour when our boiler packed in on a Sunday. Explained everything clearly and the price was exactly what was quoted.", 3, true],
  ["Gareth P.", 5, "Fitted a new combi boiler and moved two radiators. Tidy work and they left the place spotless.", 9, true],
  ["Sian M.", 4, "Good job on the bathroom. Took a day longer than planned but they kept us informed throughout.", 16, true],
  ["Owen D.", 5, "Annual landlord gas safety checks across three flats, all sorted in a morning. Certificates emailed the same day.", 24, false],
  ["Megan L.", 5, "Fixed a leak another firm could not find. Honest advice and no upselling.", 37, true],
];

export function demoGbpReport(domain: string, selection: RangeSelection): GbpReport {
  const today = todayInTz("Europe/London");
  const now = gbpDays(domain, selection.current, today);
  const before = selection.previous ? gbpDays(domain, selection.previous, today) : null;
  const sum = (pick: (d: (typeof now)[number]) => number) => now.reduce((s, d) => s + pick(d), 0);
  const scale = selection.current.days / 30;
  const from = startOfMonth(selection.current.from);
  const to = startOfMonth(selection.current.to);

  return {
    totals: gbpTotals(now),
    previousTotals: before ? gbpTotals(before) : null,
    series: now.map((d, i) => {
      const p = before?.[i];
      const impressions = d.searchMobile + d.searchDesktop + d.mapsMobile + d.mapsDesktop;
      return {
        date: d.date,
        impressions,
        actions: d.calls + d.websiteClicks + d.directions,
        calls: d.calls,
        websiteClicks: d.websiteClicks,
        directions: d.directions,
        ...(p
          ? {
              previousDate: p.date,
              previousImpressions: p.searchMobile + p.searchDesktop + p.mapsMobile + p.mapsDesktop,
              previousActions: p.calls + p.websiteClicks + p.directions,
            }
          : {}),
      };
    }),
    surfaces: [
      { key: "Google Search on mobile", value: sum((d) => d.searchMobile) },
      { key: "Google Maps on mobile", value: sum((d) => d.mapsMobile) },
      { key: "Google Search on desktop", value: sum((d) => d.searchDesktop) },
      { key: "Google Maps on desktop", value: sum((d) => d.mapsDesktop) },
    ],
    keywords: GBP_KEYWORDS.map(([keyword, monthly]) => {
      const value = Math.round(monthly * scale);
      return value < 15
        ? { keyword, impressions: null, lessThan: 15 }
        : { keyword, impressions: value, lessThan: null };
    }),
    keywordsPeriod: from === to ? formatMonth(from) : `${formatMonth(from)} to ${formatMonth(to)}`,
    reviews: {
      averageRating: 4.8,
      total: 127,
      recent: REVIEWS.map(([reviewer, rating, comment, daysAgo, replied]) => ({
        reviewer,
        rating,
        comment,
        createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
        replied,
      })),
    },
    warnings: [],
  };
}
