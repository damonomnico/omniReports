import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";
import { addMonths, isoWeekday, previousRange, makeRange, resolveRange, todayInTz } from "./dates";
import { bareDomain, hostMatchesDomain } from "./format";
import { describeMovement } from "./rank/display";

describe("dates", () => {
  const now = new Date("2026-11-16T12:00:00Z");

  it("resolves rolling ranges ending yesterday by default", () => {
    const r = resolveRange({ range: "28d" }, "Europe/London", { now });
    expect(r.current).toEqual({ from: "2026-10-19", to: "2026-11-15", days: 28 });
    expect(r.previous).toEqual({ from: "2026-09-21", to: "2026-10-18", days: 28 });
  });

  it("can end today for rankings and can switch comparison off", () => {
    const r = resolveRange({ range: "7d", compare: "0" }, "Europe/London", { now, endOffset: 0 });
    expect(r.current).toEqual({ from: "2026-11-10", to: "2026-11-16", days: 7 });
    expect(r.previous).toBeNull();
  });

  it("compares last month with the calendar month before it", () => {
    const r = resolveRange({ range: "last-month" }, "Europe/London", { now });
    expect(r.current).toEqual({ from: "2026-10-01", to: "2026-10-31", days: 31 });
    expect(r.previous).toEqual({ from: "2026-09-01", to: "2026-09-30", days: 30 });
  });

  it("accepts a custom range and rejects nonsense", () => {
    const custom = resolveRange({ from: "2026-01-01", to: "2026-01-31" }, "Europe/London", { now });
    expect(custom.preset).toBe("custom");
    expect(custom.current.days).toBe(31);

    const bad = resolveRange({ from: "2026-02-01", to: "2026-01-01" }, "Europe/London", { now });
    expect(bad.preset).toBe("28d");
    const injected = resolveRange({ from: "'; drop table", to: "x" }, "Europe/London", { now });
    expect(injected.preset).toBe("28d");
  });

  it("uses the client's timezone for today", () => {
    const lateUtc = new Date("2026-11-16T23:30:00Z");
    expect(todayInTz("Europe/London", lateUtc)).toBe("2026-11-16");
    expect(todayInTz("Australia/Sydney", lateUtc)).toBe("2026-11-17");
    expect(todayInTz("America/Los_Angeles", lateUtc)).toBe("2026-11-16");
  });

  it("handles month ends and weekdays", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(isoWeekday("2026-11-16")).toBe(1);
    expect(isoWeekday("2026-11-22")).toBe(7);
    expect(previousRange(makeRange("2026-11-10", "2026-11-16"))).toEqual({
      from: "2026-11-03",
      to: "2026-11-09",
      days: 7,
    });
  });
});

describe("domains", () => {
  it("normalises website input to a bare domain", () => {
    expect(bareDomain("https://www.Example.co.uk/path?x=1")).toBe("example.co.uk");
    expect(bareDomain("example.co.uk/")).toBe("example.co.uk");
    expect(bareDomain("HTTP://shop.example.com:8080")).toBe("shop.example.com");
  });

  it("matches a domain and its subdomains only", () => {
    expect(hostMatchesDomain("www.example.co.uk", "example.co.uk")).toBe(true);
    expect(hostMatchesDomain("blog.example.co.uk", "https://example.co.uk/")).toBe(true);
    expect(hostMatchesDomain("badexample.co.uk", "example.co.uk")).toBe(false);
    expect(hostMatchesDomain("example.co.uk.evil.com", "example.co.uk")).toBe(false);
    expect(hostMatchesDomain(null, "example.co.uk")).toBe(false);
  });
});

describe("rank movement", () => {
  it("describes moves the way people say them", () => {
    expect(describeMovement(5, 8, true, true)).toEqual({ kind: "up", by: 3, entered: false });
    expect(describeMovement(12, 9, true, true)).toEqual({ kind: "down", by: 3, lost: false });
    expect(describeMovement(7, 7, true, true)).toEqual({ kind: "same" });
    expect(describeMovement(40, null, true, true)).toEqual({ kind: "up", by: 0, entered: true });
    expect(describeMovement(null, 40, true, true)).toEqual({ kind: "down", by: 0, lost: true });
    expect(describeMovement(4, null, false, true)).toEqual({ kind: "new" });
    expect(describeMovement(null, null, false, false)).toEqual({ kind: "none" });
  });
});

describe("csv", () => {
  it("quotes fields and neutralises spreadsheet formulas", () => {
    const csv = toCsv(["a", "b"], [["plain", 'has "quotes", commas'], ["=SUM(A1)", -5]]);
    expect(csv).toBe('a,b\r\nplain,"has ""quotes"", commas"\r\n\'=SUM(A1),-5\r\n');
  });

  it("parses quoted fields, embedded newlines and other delimiters", () => {
    expect(parseCsv('k,pos\r\n"plumber, cardiff",3\r\n"multi\nline",4\r\n\r\n')).toEqual([
      ["k", "pos"],
      ["plumber, cardiff", "3"],
      ["multi\nline", "4"],
    ]);
    expect(parseCsv("k\tpos\nboiler repair\t7")).toEqual([
      ["k", "pos"],
      ["boiler repair", "7"],
    ]);
    expect(parseCsv("﻿k;pos\na;1")).toEqual([
      ["k", "pos"],
      ["a", "1"],
    ]);
  });
});
