import "server-only";
import {
  Document,
  Line,
  Page,
  Path,
  renderToBuffer,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { describeRange, formatDay, formatDayShort } from "@/lib/dates";
import { linkTypeLabel } from "@/lib/links/types";
import type { ReportData } from "./data";
import { summarise } from "./summary";

/**
 * The PDF version of a client's report. Drawn with react-pdf primitives (no
 * browser needed), using the built-in Helvetica so nothing is downloaded.
 */

const C = {
  ink: "#0d1f26",
  deep: "#0f2129",
  teal: "#1e3a44",
  series: "#0088a3",
  previous: "#aab4b8",
  lime: "#bfff36",
  muted: "#5c6f76",
  subtle: "#8a999e",
  line: "#e3e8e5",
  paper: "#f5f7f4",
  up: "#15803d",
  upBg: "#e7f6ec",
  down: "#c8323d",
  downBg: "#fdecee",
  bands: ["#0f3d49", "#1a5f70", "#2b7f93", "#4f9db0", "#7fbccb", "#d5dcd9"],
};

const s = StyleSheet.create({
  page: { paddingTop: 76, paddingBottom: 52, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 9, color: C.ink },
  header: { position: "absolute", top: 0, left: 0, right: 0, height: 52, backgroundColor: C.deep, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 36 },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 14, color: "#ffffff" },
  headerRight: { fontSize: 8.5, color: "#9dbac4" },
  footer: { position: "absolute", bottom: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.subtle, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 7 },
  h1: { fontFamily: "Helvetica-Bold", fontSize: 21, color: C.ink },
  sub: { fontSize: 9.5, color: C.muted, marginTop: 4 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 13, color: C.ink, marginBottom: 3 },
  h2note: { fontSize: 8.5, color: C.muted, marginBottom: 10 },
  h3: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: C.ink, marginTop: 14, marginBottom: 6 },
  tiles: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  tile: { width: "33.333%", padding: 4 },
  tileInner: { borderWidth: 0.75, borderColor: C.line, borderRadius: 6, padding: 9, minHeight: 58 },
  tileLabel: { fontSize: 8, color: C.muted },
  tileValue: { fontFamily: "Helvetica-Bold", fontSize: 17, color: C.ink, marginTop: 4 },
  tileFoot: { flexDirection: "row", alignItems: "center", marginTop: 5 },
  delta: { fontFamily: "Helvetica-Bold", fontSize: 7.5, paddingVertical: 1.5, paddingHorizontal: 4, borderRadius: 3 },
  tileHint: { fontSize: 7.5, color: C.subtle, marginLeft: 5 },
  bullet: { flexDirection: "row", marginBottom: 5 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.series, marginTop: 3.5, marginRight: 7 },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.45, color: C.ink },
  th: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: C.line, paddingBottom: 4, marginBottom: 1 },
  thText: { fontSize: 7.5, color: C.muted },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 4.2, alignItems: "center" },
  td: { fontSize: 8.5, color: C.ink },
  note: { fontSize: 7.5, color: C.subtle, marginTop: 6 },
  sample: { backgroundColor: "#fdf5d8", color: "#a16207", fontSize: 8.5, padding: 7, borderRadius: 4, marginBottom: 12 },
});

const int = (n: number | null | undefined) =>
  n == null ? "-" : Math.round(n).toLocaleString("en-GB");
const dec = (n: number | null | undefined, d = 1) =>
  n == null ? "-" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number | null | undefined) =>
  n == null ? "-" : `${(n * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
const compact = (n: number | null | undefined) =>
  n == null
    ? "-"
    : Math.abs(n) < 10_000
      ? int(n)
      : new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}...` : text);
const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
};

type DeltaInfo = { text: string; good: boolean | null } | null;

function pctDelta(current: number | null | undefined, previous: number | null | undefined, goodWhenUp = true): DeltaInfo {
  if (current == null || previous == null || previous === 0) return null;
  const ratio = (current - previous) / Math.abs(previous);
  if (Math.abs(ratio) < 0.0005) return { text: "No change", good: null };
  return {
    text: `${ratio > 0 ? "+" : "-"}${Math.abs(ratio * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`,
    good: ratio > 0 === goodWhenUp,
  };
}

function countDelta(current: number, previous: number | null | undefined): DeltaInfo {
  if (previous == null) return null;
  const diff = current - previous;
  if (diff === 0) return { text: "No change", good: null };
  return { text: `${diff > 0 ? "+" : "-"}${int(Math.abs(diff))}`, good: diff > 0 };
}

function Tile({ label, value, delta, hint }: { label: string; value: string; delta?: DeltaInfo; hint?: string }) {
  return (
    <View style={s.tile}>
      <View style={s.tileInner}>
        <Text style={s.tileLabel}>{label}</Text>
        <Text style={s.tileValue}>{value}</Text>
        <View style={s.tileFoot}>
          {delta ? (
            <Text
              style={[
                s.delta,
                delta.good === null
                  ? { backgroundColor: C.paper, color: C.muted }
                  : delta.good
                    ? { backgroundColor: C.upBg, color: C.up }
                    : { backgroundColor: C.downBg, color: C.down },
              ]}
            >
              {delta.text}
            </Text>
          ) : null}
          {hint ? <Text style={[s.tileHint, delta ? {} : { marginLeft: 0 }]}>{hint}</Text> : null}
        </View>
      </View>
    </View>
  );
}

type Column<T> = { header: string; width: string; align?: "right"; render: (row: T) => ReactNode };

function Table<T>({ columns, rows, keyOf }: { columns: Column<T>[]; rows: T[]; keyOf: (row: T, i: number) => string }) {
  return (
    <View>
      <View style={s.th} fixed>
        {columns.map((c) => (
          <Text key={c.header} style={[s.thText, { width: c.width, textAlign: c.align ?? "left" }]}>
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={keyOf(row, i)} style={s.tr} wrap={false}>
          {columns.map((c) => (
            <View key={c.header} style={{ width: c.width, alignItems: c.align === "right" ? "flex-end" : "flex-start" }}>
              {(() => {
                const cell = c.render(row);
                return typeof cell === "string" || typeof cell === "number" ? (
                  <Text style={[s.td, { textAlign: c.align ?? "left" }]}>{cell}</Text>
                ) : (
                  cell
                );
              })()}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Line chart on one axis: this period, with the previous period in grey behind it. */
function LineChart({
  current,
  previous,
  firstLabel,
  lastLabel,
}: {
  current: number[];
  previous: (number | null | undefined)[] | null;
  firstLabel: string;
  lastLabel: string;
}) {
  const W = 523;
  const H = 130;
  const left = 30;
  const top = 8;
  const bottom = 16;
  const plotW = W - left - 4;
  const plotH = H - top - bottom;
  const all = [...current, ...(previous ?? []).filter((v): v is number => typeof v === "number")];
  const rawMax = Math.max(...all, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((st) => rawMax / st <= 4) ?? magnitude * 10;
  const max = Math.ceil(rawMax / step) * step;
  const x = (i: number, n: number) => left + (n <= 1 ? 0 : (i * plotW) / (n - 1));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const path = (values: (number | null | undefined)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (typeof v !== "number") {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"} ${x(i, values.length).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(t);

  return (
    <View>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {ticks.map((t) => (
          <Line key={t} x1={left} x2={W - 4} y1={y(t)} y2={y(t)} stroke={C.line} strokeWidth={0.5} />
        ))}
        {previous ? <Path d={path(previous)} stroke={C.previous} strokeWidth={1} fill="none" /> : null}
        <Path d={path(current)} stroke={C.series} strokeWidth={1.6} fill="none" />
      </Svg>
      {/* Axis labels are laid over the chart as ordinary text. */}
      <View style={{ position: "absolute", top: 0, left: 0, width: left - 5, height: H }}>
        {ticks.map((t) => (
          <Text
            key={t}
            style={{ position: "absolute", right: 0, top: y(t) - 3.5, fontSize: 6.5, color: C.subtle, textAlign: "right", width: left - 5 }}
          >
            {compact(t)}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginLeft: left, marginTop: -11 }}>
        <Text style={{ fontSize: 6.5, color: C.subtle }}>{firstLabel}</Text>
        <Text style={{ fontSize: 6.5, color: C.subtle }}>{lastLabel}</Text>
      </View>
    </View>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 2 }}>
          <View style={{ width: 9, height: 2, backgroundColor: i.color, marginRight: 4 }} />
          <Text style={{ fontSize: 7.5, color: C.muted }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** One whole split into ordered bands, with a legend naming each band. */
function BandBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (total === 0) return null;
  return (
    <View>
      <View style={{ flexDirection: "row", height: 18, borderRadius: 4, overflow: "hidden" }}>
        {parts
          .filter((p) => p.value > 0)
          .map((p, i, shown) => (
            <View
              key={p.label}
              style={{
                width: `${(p.value / total) * 100}%`,
                backgroundColor: p.color,
                borderRightWidth: i < shown.length - 1 ? 1.5 : 0,
                borderRightColor: "#ffffff",
                justifyContent: "center",
                paddingLeft: 4,
              }}
            >
              {p.value / total > 0.07 ? (
                <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: i >= 4 ? C.ink : "#ffffff" }}>
                  {int(p.value)}
                </Text>
              ) : null}
            </View>
          ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
        {parts.map((p) => (
          <View key={p.label} style={{ flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 2 }}>
            <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: p.color, marginRight: 4 }} />
            <Text style={{ fontSize: 7.5, color: C.muted }}>
              {p.label}: {int(p.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Shell({ data, children }: { data: ReportData; children: ReactNode }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header} fixed>
        <Text style={s.brand}>
          omni<Text style={{ color: C.lime }}>Reports</Text>
        </Text>
        <Text style={s.headerRight}>
          {data.client.name} | {describeRange(data.period)}
        </Text>
      </View>
      {children}
      <View style={s.footer} fixed>
        <Text>Prepared by omniSEO with omniReports | {formatDay(data.generatedOn)}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  );
}

function RankChange({ change }: { change: number | null }) {
  if (change === null) return <Text style={[s.td, { color: C.subtle }]}>New</Text>;
  if (change === 0) return <Text style={[s.td, { color: C.subtle }]}>-</Text>;
  return (
    <Text style={[s.td, { fontFamily: "Helvetica-Bold", color: change > 0 ? C.up : C.down }]}>
      {change > 0 ? `Up ${change}` : `Down ${Math.abs(change)}`}
    </Text>
  );
}

export function ReportDocument({ data }: { data: ReportData }) {
  const headlines = summarise(data);
  const vs = data.previous ? "vs previous period" : undefined;
  const { rankings, gsc, ga4, gbp, links } = data;
  const KEYWORD_LIMIT = 60;

  return (
    <Document
      title={`${data.client.name} SEO report, ${describeRange(data.period)}`}
      author="omniSEO"
      creator="omniReports"
    >
      <Shell data={data}>
        {data.isSample ? (
          <Text style={s.sample}>
            Sample report. This client is a demonstration and every figure here is generated, not real.
          </Text>
        ) : null}
        <Text style={s.h1}>{data.client.name}</Text>
        <Text style={s.sub}>
          SEO performance report for {describeRange(data.period)}
          {data.previous ? `, compared with ${describeRange(data.previous)}` : ""}.
        </Text>

        <Text style={[s.h3, { marginTop: 18 }]}>At a glance</Text>
        <View style={s.tiles}>
          {gsc ? (
            <>
              <Tile label="Clicks from Google" value={compact(gsc.totals.clicks)} delta={pctDelta(gsc.totals.clicks, gsc.previousTotals?.clicks)} hint={vs} />
              <Tile label="Search impressions" value={compact(gsc.totals.impressions)} delta={pctDelta(gsc.totals.impressions, gsc.previousTotals?.impressions)} hint={vs} />
            </>
          ) : null}
          {ga4 ? (
            <>
              <Tile label="Website sessions" value={compact(ga4.totals.sessions)} delta={pctDelta(ga4.totals.sessions, ga4.previousTotals?.sessions)} hint={vs} />
              <Tile label="Key events" value={compact(ga4.totals.keyEvents)} delta={pctDelta(ga4.totals.keyEvents, ga4.previousTotals?.keyEvents)} hint={vs} />
            </>
          ) : null}
          {rankings ? (
            <Tile
              label="Keywords in the top 10"
              value={int(rankings.summary.top10)}
              delta={rankings.summary.comparable > 0 ? countDelta(rankings.summary.top10, rankings.summary.start.top10) : null}
              hint={`of ${int(rankings.summary.total)} tracked`}
            />
          ) : null}
          {gbp ? (
            <Tile label="Business Profile views" value={compact(gbp.totals.impressions)} delta={pctDelta(gbp.totals.impressions, gbp.previousTotals?.impressions)} hint={vs} />
          ) : null}
          {links ? (
            <Tile
              label="Links built"
              value={int(links.stats.builtInRange)}
              delta={links.stats.builtInPrevious === null ? null : countDelta(links.stats.builtInRange, links.stats.builtInPrevious)}
              hint={`${int(links.stats.totalLive)} live in total`}
            />
          ) : null}
        </View>

        {headlines.length > 0 ? (
          <View>
            <Text style={s.h3}>Summary</Text>
            {headlines.map((line) => (
              <View key={line} style={s.bullet} wrap={false}>
                <View style={s.bulletDot} />
                <Text style={s.bulletText}>{line}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[s.sub, { marginTop: 16 }]}>
            No data sources are connected for this client yet, so there is nothing to report for this period.
          </Text>
        )}

        {gsc ? (
          <View wrap={false}>
            <Text style={s.h3}>Clicks from Google Search</Text>
            <Legend
              items={[
                { label: "This period", color: C.series },
                ...(data.previous ? [{ label: "Previous period", color: C.previous }] : []),
              ]}
            />
            <LineChart
              current={gsc.series.map((p) => p.clicks)}
              previous={data.previous ? gsc.series.map((p) => p.previousClicks) : null}
              firstLabel={formatDayShort(data.period.from)}
              lastLabel={formatDayShort(data.period.to)}
            />
          </View>
        ) : null}

        {data.unavailable.length > 0 ? (
          <Text style={s.note}>Not included because it is not connected yet: {data.unavailable.join(", ")}.</Text>
        ) : null}
      </Shell>

      {rankings ? (
        <Shell data={data}>
          <Text style={s.h2}>Rankings</Text>
          <Text style={s.h2note}>
            Where {data.client.domain} appears in Google for the keywords we track, looking at the top {rankings.depth} results.
          </Text>
          <View style={s.tiles}>
            <Tile label="Average position" value={dec(rankings.summary.averagePosition)} hint="of keywords that rank" />
            <Tile label="In the top 3" value={int(rankings.summary.top3)} delta={rankings.summary.comparable > 0 ? countDelta(rankings.summary.top3, rankings.summary.start.top3) : null} hint="since the start" />
            <Tile label="In the top 10" value={int(rankings.summary.top10)} delta={rankings.summary.comparable > 0 ? countDelta(rankings.summary.top10, rankings.summary.start.top10) : null} hint="since the start" />
          </View>

          {rankings.latest ? (
            <View wrap={false}>
              <Text style={s.h3}>Keywords by position at the end of the period</Text>
              <BandBar
                parts={[
                  { label: "1 to 3", value: rankings.latest.top3, color: C.bands[0]! },
                  { label: "4 to 10", value: rankings.latest.top10, color: C.bands[1]! },
                  { label: "11 to 20", value: rankings.latest.top20, color: C.bands[2]! },
                  { label: "21 to 50", value: rankings.latest.top50, color: C.bands[3]! },
                  { label: "51 to 100", value: rankings.latest.top100, color: C.bands[4]! },
                  { label: "Not ranking", value: rankings.latest.unranked, color: C.bands[5]! },
                ]}
              />
            </View>
          ) : null}

          <Text style={s.h3}>Keyword positions</Text>
          <Table
            keyOf={(r) => r.id}
            rows={rankings.keywords.slice(0, KEYWORD_LIMIT)}
            columns={[
              { header: "Keyword", width: "46%", render: (r) => clip(`${r.keyword}${r.device === "mobile" ? " (mobile)" : ""}`, 58) },
              {
                header: "Position",
                width: "13%",
                align: "right",
                render: (r) =>
                  r.position === null ? (
                    <Text style={[s.td, { color: C.subtle }]}>Not in top {rankings.depth}</Text>
                  ) : (
                    <Text style={[s.td, { fontFamily: "Helvetica-Bold" }]}>{r.position}</Text>
                  ),
              },
              {
                header: "Change",
                width: "13%",
                align: "right",
                render: (r) => (
                  <RankChange
                    change={
                      !r.hasStart
                        ? null
                        : (r.startPosition ?? rankings.depth + 1) - (r.position ?? rankings.depth + 1)
                    }
                  />
                ),
              },
              { header: "Best", width: "9%", align: "right", render: (r) => (r.best === null ? "-" : String(r.best)) },
              { header: "Local pack", width: "9%", align: "right", render: (r) => (r.localPackPosition === null ? "-" : String(r.localPackPosition)) },
              { header: "Searches / mo", width: "10%", align: "right", render: (r) => int(r.searchVolume) },
            ]}
          />
          {rankings.keywords.length > KEYWORD_LIMIT ? (
            <Text style={s.note}>
              Showing the {KEYWORD_LIMIT} best-ranking of {int(rankings.keywords.length)} keywords. The full list is in your online dashboard.
            </Text>
          ) : null}
          <Text style={s.note}>Change compares with the position at the start of the period. Up means closer to the top of Google.</Text>
        </Shell>
      ) : null}

      {gsc ? (
        <Shell data={data}>
          {gsc ? (
            <View>
              <Text style={s.h2}>Search Console</Text>
              <Text style={s.h2note}>How often the website was shown and clicked in Google Search.</Text>
              <View style={s.tiles}>
                <Tile label="Clicks" value={compact(gsc.totals.clicks)} delta={pctDelta(gsc.totals.clicks, gsc.previousTotals?.clicks)} hint={vs} />
                <Tile label="Click-through rate" value={pct(gsc.totals.ctr)} delta={pctDelta(gsc.totals.ctr, gsc.previousTotals?.ctr)} hint={vs} />
                <Tile label="Average position" value={dec(gsc.totals.position)} hint="across all searches" />
              </View>
              <Text style={s.h3}>Top searches</Text>
              <Table
                keyOf={(r) => r.key}
                rows={gsc.queries.slice(0, 12)}
                columns={[
                  { header: "Search", width: "52%", render: (r) => clip(r.key, 62) },
                  { header: "Clicks", width: "12%", align: "right", render: (r) => <Text style={[s.td, { fontFamily: "Helvetica-Bold" }]}>{int(r.clicks)}</Text> },
                  { header: "Impressions", width: "14%", align: "right", render: (r) => int(r.impressions) },
                  { header: "CTR", width: "10%", align: "right", render: (r) => pct(r.ctr) },
                  { header: "Position", width: "12%", align: "right", render: (r) => dec(r.position) },
                ]}
              />
              <Text style={s.h3}>Top pages</Text>
              <Table
                keyOf={(r) => r.key}
                rows={gsc.pages.slice(0, 8)}
                columns={[
                  { header: "Page", width: "64%", render: (r) => clip(pathOf(r.key), 76) },
                  { header: "Clicks", width: "12%", align: "right", render: (r) => <Text style={[s.td, { fontFamily: "Helvetica-Bold" }]}>{int(r.clicks)}</Text> },
                  { header: "Impressions", width: "12%", align: "right", render: (r) => int(r.impressions) },
                  { header: "Position", width: "12%", align: "right", render: (r) => dec(r.position) },
                ]}
              />
            </View>
          ) : null}

        </Shell>
      ) : null}

      {ga4 ? (
        <Shell data={data}>
          <Text style={s.h2}>Website traffic</Text>
          <Text style={s.h2note}>Visits to the website from every source, from Google Analytics.</Text>
          <View style={s.tiles}>
            <Tile label="Sessions" value={compact(ga4.totals.sessions)} delta={pctDelta(ga4.totals.sessions, ga4.previousTotals?.sessions)} hint={vs} />
            <Tile label="Users" value={compact(ga4.totals.users)} delta={pctDelta(ga4.totals.users, ga4.previousTotals?.users)} hint={vs} />
            <Tile label="Key events" value={compact(ga4.totals.keyEvents)} delta={pctDelta(ga4.totals.keyEvents, ga4.previousTotals?.keyEvents)} hint={vs} />
            <Tile label="New users" value={compact(ga4.totals.newUsers)} delta={pctDelta(ga4.totals.newUsers, ga4.previousTotals?.newUsers)} hint={vs} />
            <Tile label="Engagement rate" value={pct(ga4.totals.engagementRate)} delta={pctDelta(ga4.totals.engagementRate, ga4.previousTotals?.engagementRate)} hint={vs} />
            <Tile label="Pages viewed" value={compact(ga4.totals.pageViews)} delta={pctDelta(ga4.totals.pageViews, ga4.previousTotals?.pageViews)} hint={vs} />
          </View>

          <View wrap={false}>
            <Text style={s.h3}>Sessions per day</Text>
            <Legend
              items={[
                { label: "This period", color: C.series },
                ...(data.previous ? [{ label: "Previous period", color: C.previous }] : []),
              ]}
            />
            <LineChart
              current={ga4.series.map((p) => p.sessions)}
              previous={data.previous ? ga4.series.map((p) => p.previousSessions) : null}
              firstLabel={formatDayShort(data.period.from)}
              lastLabel={formatDayShort(data.period.to)}
            />
          </View>

          <Text style={s.h3}>Where visitors came from</Text>
          <Table
            keyOf={(r) => r.key}
            rows={ga4.channels.slice(0, 8)}
            columns={[
              { header: "Channel", width: "40%", render: (r) => r.key },
              { header: "Sessions", width: "20%", align: "right", render: (r) => <Text style={[s.td, { fontFamily: "Helvetica-Bold" }]}>{int(r.sessions)}</Text> },
              {
                header: "Change",
                width: "20%",
                align: "right",
                render: (r) => {
                  const d = pctDelta(r.sessions, r.previousSessions);
                  return (
                    <Text style={[s.td, { color: d?.good == null ? C.subtle : d.good ? C.up : C.down }]}>
                      {d?.text ?? "-"}
                    </Text>
                  );
                },
              },
              { header: "Key events", width: "20%", align: "right", render: (r) => int(r.keyEvents) },
            ]}
          />

          <Text style={s.h3}>Top landing pages</Text>
          <Table
            keyOf={(r) => r.key}
            rows={ga4.landingPages.slice(0, 8)}
            columns={[
              { header: "Page", width: "58%", render: (r) => clip(r.key || "(not set)", 70) },
              { header: "Sessions", width: "14%", align: "right", render: (r) => <Text style={[s.td, { fontFamily: "Helvetica-Bold" }]}>{int(r.sessions)}</Text> },
              { header: "Engagement", width: "14%", align: "right", render: (r) => pct(r.engagementRate) },
              { header: "Key events", width: "14%", align: "right", render: (r) => int(r.keyEvents) },
            ]}
          />
        </Shell>
      ) : null}

      {gbp || links ? (
        <Shell data={data}>
          {gbp ? (
            <View>
              <Text style={s.h2}>Google Business Profile</Text>
              <Text style={s.h2note}>How people found and contacted the business on Google Search and Maps.</Text>
              <View style={s.tiles}>
                <Tile label="People who saw the profile" value={compact(gbp.totals.impressions)} delta={pctDelta(gbp.totals.impressions, gbp.previousTotals?.impressions)} hint={vs} />
                <Tile label="Calls" value={int(gbp.totals.calls)} delta={pctDelta(gbp.totals.calls, gbp.previousTotals?.calls)} hint={vs} />
                <Tile label="Website clicks" value={int(gbp.totals.websiteClicks)} delta={pctDelta(gbp.totals.websiteClicks, gbp.previousTotals?.websiteClicks)} hint={vs} />
                <Tile label="Direction requests" value={int(gbp.totals.directions)} delta={pctDelta(gbp.totals.directions, gbp.previousTotals?.directions)} hint={vs} />
                <Tile label="Seen on Google Search" value={compact(gbp.totals.searchImpressions)} hint="people" />
                <Tile label="Seen on Google Maps" value={compact(gbp.totals.mapsImpressions)} hint="people" />
              </View>
              {gbp.reviews && gbp.reviews.averageRating !== null ? (
                <Text style={[s.sub, { marginTop: 8 }]}>
                  Google reviews: {dec(gbp.reviews.averageRating)} out of 5 from {int(gbp.reviews.total)} reviews.
                </Text>
              ) : null}
              {gbp.keywords.length > 0 ? (
                <View>
                  <Text style={s.h3}>Searches that showed the profile{gbp.keywordsPeriod ? ` (${gbp.keywordsPeriod})` : ""}</Text>
                  <Table
                    keyOf={(r) => r.keyword}
                    rows={gbp.keywords.slice(0, 8)}
                    columns={[
                      { header: "Search", width: "75%", render: (r) => clip(r.keyword, 80) },
                      { header: "People", width: "25%", align: "right", render: (r) => (r.impressions !== null ? int(r.impressions) : `Fewer than ${r.lessThan}`) },
                    ]}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {links ? (
            <View style={gbp ? { marginTop: 22 } : {}}>
              <Text style={s.h2}>Links built</Text>
              <Text style={s.h2note}>
                {links.built.length === 0
                  ? "No new links went live in this period."
                  : `${int(links.built.length)} link${links.built.length === 1 ? "" : "s"} to ${data.client.domain} went live in this period.`}
              </Text>
              {links.built.length > 0 ? (
                <Table
                  keyOf={(r) => r.id}
                  rows={links.built.slice(0, 40)}
                  columns={[
                    { header: "Date", width: "13%", render: (r) => formatDay(r.builtOn) },
                    { header: "Linking website", width: "31%", render: (r) => clip(r.sourceDomain, 36) },
                    { header: "Anchor text", width: "28%", render: (r) => clip(r.anchorText || "-", 34) },
                    { header: "Type", width: "18%", render: (r) => linkTypeLabel(r.linkType) },
                    { header: "DR", width: "10%", align: "right", render: (r) => (r.domainRating === null ? "-" : String(r.domainRating)) },
                  ]}
                />
              ) : null}
              {links.built.length > 40 ? (
                <Text style={s.note}>Showing the 40 most recent. The full list is in your online dashboard.</Text>
              ) : null}
            </View>
          ) : null}
        </Shell>
      ) : null}
    </Document>
  );
}

export async function renderReportPdf(data: ReportData): Promise<Buffer> {
  return renderToBuffer(<ReportDocument data={data} />);
}
