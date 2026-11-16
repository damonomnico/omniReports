import type { ReportData } from "./data";

const int = (n: number) => Math.round(n).toLocaleString("en-GB");

function change(current: number, previous: number | null | undefined): string | null {
  if (previous == null || previous === 0) return null;
  const ratio = (current - previous) / Math.abs(previous);
  if (Math.abs(ratio) < 0.005) return "level with";
  const pct = `${Math.abs(ratio * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
  return ratio > 0 ? `up ${pct} on` : `down ${pct} on`;
}

/**
 * Plain-English headline sentences for a report, written from the figures.
 * Good news and bad news are stated the same way: no spin.
 */
export function summarise(data: ReportData): string[] {
  const out: string[] = [];
  const versus = "the previous period";

  if (data.gsc) {
    const { totals, previousTotals } = data.gsc;
    const c = change(totals.clicks, previousTotals?.clicks);
    out.push(
      `${int(totals.clicks)} people clicked through from Google Search` +
        (c ? `, ${c} ${versus}` : "") +
        `, from ${int(totals.impressions)} impressions.`,
    );
  }

  if (data.rankings) {
    const s = data.rankings.summary;
    let line = `${int(s.top10)} of ${int(s.total)} tracked keywords are in Google's top 10`;
    if (s.comparable > 0) {
      const diff = s.top10 - s.start.top10;
      line +=
        diff === 0
          ? ", the same as at the start of the period"
          : `, ${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than at the start of the period`;
    }
    out.push(`${line}.`);
    if (s.comparable > 0) {
      out.push(
        `${int(s.improved)} keyword${s.improved === 1 ? "" : "s"} moved up and ${int(s.declined)} moved down.` +
          (s.averagePosition !== null
            ? ` The average position is ${s.averagePosition.toLocaleString("en-GB", { maximumFractionDigits: 1 })}.`
            : ""),
      );
    }
    const best = data.rankings.movers[0];
    if (best && best.change > 0 && best.position !== null) {
      out.push(`Biggest climb: "${best.keyword}", up ${best.change} to position ${best.position}.`);
    }
  }

  if (data.ga4) {
    const { totals, previousTotals } = data.ga4;
    const c = change(totals.sessions, previousTotals?.sessions);
    const k = change(totals.keyEvents, previousTotals?.keyEvents);
    out.push(
      `The website had ${int(totals.sessions)} visits` +
        (c ? `, ${c} ${versus}` : "") +
        `, with ${int(totals.keyEvents)} key events` +
        (k ? ` (${k} ${versus})` : "") +
        ".",
    );
  }

  if (data.gbp) {
    const { totals, previousTotals } = data.gbp;
    const c = change(totals.impressions, previousTotals?.impressions);
    out.push(
      `${int(totals.impressions)} people saw the Google Business Profile` +
        (c ? `, ${c} ${versus}` : "") +
        `. It led to ${int(totals.calls)} calls, ${int(totals.websiteClicks)} website clicks and ${int(totals.directions)} direction requests.`,
    );
  }

  if (data.links) {
    const n = data.links.stats.builtInRange;
    const dr = data.links.stats.averageRatingInRange;
    out.push(
      n === 0
        ? "No new links went live in this period."
        : `${int(n)} new link${n === 1 ? "" : "s"} went live` +
            (dr !== null ? `, with an average domain rating of ${Math.round(dr)}` : "") +
            ".",
    );
  }

  return out;
}
