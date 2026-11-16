import { parseCsv } from "@/lib/csv";

/**
 * Reads ranking history exported from another tool (AgencyAnalytics, a
 * spreadsheet, another rank tracker). Three layouts are understood:
 *
 *  long      one row per keyword per date:   Keyword, Date, Position
 *  wide      one row per keyword, one column per date
 *  snapshot  one row per keyword with a single position and no date
 *
 * Pure parsing with no database access, so it can be previewed and tested.
 */

export type ImportFormat = "long" | "wide" | "snapshot";

export type ImportedResult = { keyword: string; date: string; position: number | null; url: string | null };

export type ParsedImport = {
  format: ImportFormat;
  /** Human description of which columns were used. */
  columns: string[];
  keywords: { keyword: string; volume: number | null; tags: string[] }[];
  results: ImportedResult[];
  dateRange: { from: string; to: string } | null;
  warnings: string[];
};

const ALIASES = {
  keyword: ["keyword", "keywords", "search term", "search terms", "query", "term", "phrase", "keyphrase"],
  date: ["date", "day", "checked", "check date", "as of", "ranking date", "updated", "last updated"],
  position: [
    "position", "rank", "ranking", "pos", "google", "google position", "google rank", "google ranking",
    "current position", "current rank", "organic position", "google desktop", "google uk", "serp position",
  ],
  url: ["url", "ranking url", "landing page", "page", "ranking page", "google url", "found url"],
  volume: ["volume", "search volume", "searches", "monthly searches", "avg monthly searches", "sv"],
  tags: ["tags", "tag", "group", "groups", "label", "labels", "category"],
} as const;

const norm = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

/** Exact heading matches only: "Date added" must not be mistaken for the check date. */
function findColumn(headers: string[], names: readonly string[]): number {
  return headers.findIndex((h) => names.includes(h));
}

/**
 * The position column is named many ways ("Google UK", "Position (desktop)"),
 * so fall back to a looser match that avoids change, best and start columns.
 */
function findPositionColumn(headers: string[], skip: number): number {
  const exact = headers.findIndex((h, i) => i !== skip && (ALIASES.position as readonly string[]).includes(h));
  if (exact >= 0) return exact;
  return headers.findIndex(
    (h, i) =>
      i !== skip &&
      /\b(position|rank|ranking|google)\b/.test(h) &&
      !/\b(change|diff|difference|best|previous|prev|start|first|initial|url|page|volume|local|maps|mobile|bing|date)\b/.test(h),
  );
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number): string | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
};

/**
 * Accepts 2026-10-31, 31/10/2026, 31-10-26, "31 Oct 2026", "Oct 31, 2026".
 * Ambiguous slash dates are read day-first, the UK convention.
 */
export function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const a = Number(m[1]);
    const b = Number(m[2]);
    // If the first number cannot be a day-first month position, it is US order.
    return b > 12 && a <= 12 ? iso(year, a, b) : iso(year, b, a);
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]{3,9})\.?,?[ -](\d{2,4})$/);
  if (m) {
    const month = MONTHS[m[2]!.slice(0, 4).toLowerCase()] ?? MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return month ? iso(year, month, Number(m[1])) : null;
  }
  m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/);
  if (m) {
    const month = MONTHS[m[1]!.slice(0, 4).toLowerCase()] ?? MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    return month ? iso(Number(m[3]), month, Number(m[2])) : null;
  }
  return null;
}

/** "7" is 7. Blank, "-", "n/a", ">100", "100+", "not found" and 0 mean not ranking. */
export function parsePosition(raw: string): { ok: true; value: number | null } | { ok: false } {
  const s = raw.trim().toLowerCase();
  if (s === "" || /^(-+|n\/?a|none|null|not found|not ranked|not ranking|unranked|nr|>\s*\d+|\d+\s*\+)$/.test(s)) {
    return { ok: true, value: null };
  }
  const n = Number(s.replace(/^#/, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1000) return { ok: false };
  const rounded = Math.round(n);
  return { ok: true, value: rounded === 0 ? null : rounded };
}

const MAX_RESULTS = 200_000;

export function parseRankImport(text: string, opts: { snapshotDate?: string } = {}): ParsedImport {
  const rows = parseCsv(text);
  const empty: ParsedImport = { format: "snapshot", columns: [], keywords: [], results: [], dateRange: null, warnings: [] };
  if (rows.length < 2) {
    return { ...empty, warnings: ["Paste or upload the heading row and at least one row of rankings."] };
  }

  const headers = rows[0]!.map(norm);
  const keywordCol = findColumn(headers, ALIASES.keyword);
  if (keywordCol < 0) {
    return {
      ...empty,
      warnings: [
        `Could not find the keyword column. Name it "Keyword". The headings found were: ${rows[0]!.slice(0, 12).join(", ")}.`,
      ],
    };
  }

  const dateCol = findColumn(headers, ALIASES.date);
  const urlCol = findColumn(headers, ALIASES.url);
  const volumeCol = findColumn(headers, ALIASES.volume);
  const tagsCol = findColumn(headers, ALIASES.tags);
  // Columns whose heading is itself a date mean one column per check date.
  const dateColumns = rows[0]!
    .map((h, i) => ({ i, date: parseFlexibleDate(h) }))
    .filter((c): c is { i: number; date: string } => c.date !== null && c.i !== keywordCol);
  const positionCol = findPositionColumn(headers, keywordCol);

  const format: ImportFormat =
    dateColumns.length >= 2 ? "wide" : dateCol >= 0 && positionCol >= 0 ? "long" : "snapshot";

  const warnings: string[] = [];
  const columns = [`Keyword: "${rows[0]![keywordCol]}"`];
  if (format === "wide") {
    columns.push(`${dateColumns.length} date columns, ${dateColumns[0]!.date} to ${dateColumns.at(-1)!.date}`);
  } else {
    if (positionCol < 0) {
      return {
        ...empty,
        warnings: [
          `Could not find a position column. Name it "Position". The headings found were: ${rows[0]!.slice(0, 12).join(", ")}.`,
        ],
      };
    }
    columns.push(`Position: "${rows[0]![positionCol]}"`);
    if (format === "long") columns.push(`Date: "${rows[0]![dateCol]}"`);
  }
  if (urlCol >= 0 && format !== "wide") columns.push(`Ranking page: "${rows[0]![urlCol]}"`);
  if (volumeCol >= 0) columns.push(`Search volume: "${rows[0]![volumeCol]}"`);
  if (tagsCol >= 0) columns.push(`Tags: "${rows[0]![tagsCol]}"`);

  if (format === "snapshot" && !opts.snapshotDate) {
    warnings.push("This file has no dates, so choose the date these positions were recorded on.");
  }

  const keywords = new Map<string, { keyword: string; volume: number | null; tags: string[] }>();
  // One result per keyword per date: later rows win.
  const results = new Map<string, ImportedResult>();
  let badDates = 0;
  let badPositions = 0;

  for (const row of rows.slice(1)) {
    const keyword = (row[keywordCol] ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!keyword || keyword.length > 120) continue;

    if (!keywords.has(keyword)) {
      const volume = volumeCol >= 0 ? Number((row[volumeCol] ?? "").replace(/[^0-9.]/g, "")) : NaN;
      keywords.set(keyword, {
        keyword,
        volume: Number.isFinite(volume) && (row[volumeCol] ?? "").trim() !== "" ? Math.round(volume) : null,
        tags:
          tagsCol >= 0
            ? (row[tagsCol] ?? "")
                .split(/[,;|]/)
                .map((t) => t.trim().toLowerCase().slice(0, 40))
                .filter(Boolean)
                .slice(0, 10)
            : [],
      });
    }

    const add = (date: string | null, rawPosition: string, url: string | null) => {
      if (!date) {
        badDates++;
        return;
      }
      const position = parsePosition(rawPosition);
      if (!position.ok) {
        badPositions++;
        return;
      }
      if (results.size >= MAX_RESULTS) return;
      results.set(`${keyword}|${date}`, {
        keyword,
        date,
        position: position.value,
        url: position.value !== null && url && /^https?:\/\//i.test(url) ? url.slice(0, 2000) : null,
      });
    };

    if (format === "wide") {
      for (const c of dateColumns) {
        const cell = row[c.i] ?? "";
        // An empty cell in a wide sheet means "no check that day", not "not ranking".
        if (cell.trim() !== "") add(c.date, cell, null);
      }
    } else if (format === "long") {
      add(parseFlexibleDate(row[dateCol] ?? ""), row[positionCol] ?? "", urlCol >= 0 ? (row[urlCol] ?? null) : null);
    } else if (opts.snapshotDate) {
      add(opts.snapshotDate, row[positionCol] ?? "", urlCol >= 0 ? (row[urlCol] ?? null) : null);
    }
  }

  if (badDates > 0) warnings.push(`${badDates} row${badDates === 1 ? "" : "s"} skipped: the date could not be read.`);
  if (badPositions > 0) {
    warnings.push(`${badPositions} value${badPositions === 1 ? "" : "s"} skipped: the position was not a number.`);
  }
  if (results.size >= MAX_RESULTS) {
    warnings.push(`Only the first ${MAX_RESULTS.toLocaleString("en-GB")} results were read. Import the rest separately.`);
  }

  const list = [...results.values()];
  const dates = list.map((r) => r.date).sort();
  return {
    format,
    columns,
    keywords: [...keywords.values()],
    results: list,
    dateRange: dates.length > 0 ? { from: dates[0]!, to: dates.at(-1)! } : null,
    warnings,
  };
}
