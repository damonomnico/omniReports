import { describe, expect, it } from "vitest";
import { parseFlexibleDate, parsePosition, parseRankImport } from "./import-parse";

describe("parseFlexibleDate", () => {
  it("reads the formats people export", () => {
    expect(parseFlexibleDate("2026-10-31")).toBe("2026-10-31");
    expect(parseFlexibleDate("2026-10-31 04:00:00")).toBe("2026-10-31");
    expect(parseFlexibleDate("31/10/2026")).toBe("2026-10-31");
    expect(parseFlexibleDate("1.2.26")).toBe("2026-02-01");
    expect(parseFlexibleDate("31 Oct 2026")).toBe("2026-10-31");
    expect(parseFlexibleDate("3rd September 2026")).toBe("2026-09-03");
    expect(parseFlexibleDate("Oct 31, 2026")).toBe("2026-10-31");
  });

  it("reads ambiguous dates day-first, and US order only when it must be", () => {
    expect(parseFlexibleDate("03/04/2026")).toBe("2026-04-03");
    expect(parseFlexibleDate("10/31/2026")).toBe("2026-10-31");
  });

  it("rejects things that are not dates", () => {
    for (const bad of ["", "Keyword", "31/02/2026", "2026-13-01", "Position", "42"]) {
      expect(parseFlexibleDate(bad)).toBeNull();
    }
  });
});

describe("parsePosition", () => {
  it("treats blanks and not-found markers as not ranking", () => {
    for (const v of ["", "-", "n/a", "N/A", ">100", "100+", "Not found", "0"]) {
      expect(parsePosition(v)).toEqual({ ok: true, value: null });
    }
    expect(parsePosition("7")).toEqual({ ok: true, value: 7 });
    expect(parsePosition("#3")).toEqual({ ok: true, value: 3 });
    expect(parsePosition("4.6")).toEqual({ ok: true, value: 5 });
    expect(parsePosition("up 3")).toEqual({ ok: false });
  });
});

describe("parseRankImport", () => {
  it("reads one row per keyword per date", () => {
    const parsed = parseRankImport(
      "Keyword,Date,Google Position,URL,Search Volume,Tags\n" +
        "Plumber Cardiff,01/10/2026,12,https://example.co.uk/,2400,core; local\n" +
        "plumber  cardiff,02/10/2026,10,https://example.co.uk/,2400,core\n" +
        "boiler repair,01/10/2026,-,,880,\n",
    );
    expect(parsed.format).toBe("long");
    expect(parsed.keywords).toEqual([
      { keyword: "plumber cardiff", volume: 2400, tags: ["core", "local"] },
      { keyword: "boiler repair", volume: 880, tags: [] },
    ]);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.results[0]).toEqual({
      keyword: "plumber cardiff",
      date: "2026-10-01",
      position: 12,
      url: "https://example.co.uk/",
    });
    expect(parsed.results[2]).toMatchObject({ keyword: "boiler repair", position: null, url: null });
    expect(parsed.dateRange).toEqual({ from: "2026-10-01", to: "2026-10-02" });
    expect(parsed.warnings).toEqual([]);
  });

  it("reads one column per date and skips days with no check", () => {
    const parsed = parseRankImport(
      "Keyword\t2026-10-01\t2026-10-08\t2026-10-15\n" +
        "plumber cardiff\t14\t\t9\n" +
        "boiler repair\t>100\t88\t61\n",
    );
    expect(parsed.format).toBe("wide");
    expect(parsed.results).toHaveLength(5);
    expect(parsed.results.find((r) => r.keyword === "boiler repair" && r.date === "2026-10-01")?.position).toBeNull();
    expect(parsed.results.some((r) => r.keyword === "plumber cardiff" && r.date === "2026-10-08")).toBe(false);
  });

  it("needs a date for a snapshot with no dates", () => {
    const text = "Keyword,Google,Volume\nplumber cardiff,8,2400\nboiler repair,23,880\n";
    const without = parseRankImport(text);
    expect(without.format).toBe("snapshot");
    expect(without.results).toHaveLength(0);
    expect(without.warnings[0]).toContain("no dates");

    const withDate = parseRankImport(text, { snapshotDate: "2026-11-01" });
    expect(withDate.results).toEqual([
      { keyword: "plumber cardiff", date: "2026-11-01", position: 8, url: null },
      { keyword: "boiler repair", date: "2026-11-01", position: 23, url: null },
    ]);
  });

  it("explains what is wrong when columns are missing", () => {
    expect(parseRankImport("Name,Rank\na,1\n").warnings[0]).toContain("keyword column");
    expect(parseRankImport("Keyword,Notes\na,hello\n").warnings[0]).toContain("position column");
    expect(parseRankImport("").warnings[0]).toContain("heading row");
  });

  it("ignores look-alike columns such as Date added and Google change", () => {
    const parsed = parseRankImport(
      "Keyword,Date Added,Google Change,Google UK,Best Position\nplumber cardiff,01/01/2025,+3,7,2\n",
      { snapshotDate: "2026-11-01" },
    );
    // "Date Added" is not the check date, so this is a snapshot using "Google UK".
    expect(parsed.format).toBe("snapshot");
    expect(parsed.results).toEqual([
      { keyword: "plumber cardiff", date: "2026-11-01", position: 7, url: null },
    ]);
  });

  it("reports unreadable rows without failing the whole import", () => {
    const parsed = parseRankImport(
      "Keyword,Date,Position\na,2026-10-01,5\nb,sometime,5\nc,2026-10-01,high\n",
    );
    expect(parsed.results).toHaveLength(1);
    expect(parsed.warnings).toHaveLength(2);
  });
});
