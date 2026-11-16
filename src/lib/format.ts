const INT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const COMPACT = new Intl.NumberFormat("en-GB", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatInt(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? "-" : INT.format(Math.round(n));
}

/** 1,234 below ten thousand, then 12.3K, 4.5M. */
export function formatCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  return Math.abs(n) < 10_000 ? INT.format(Math.round(n)) : COMPACT.format(n);
}

export function formatDecimal(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "-";
  return n.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Takes a ratio (0.123) and returns "12.3%". */
export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || Number.isNaN(ratio)) return "-";
  return `${(ratio * 100).toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "-";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function formatMoney(n: number | null | undefined, currency = "GBP"): string {
  if (n == null || Number.isNaN(n)) return "-";
  return n.toLocaleString("en-GB", { style: "currency", currency });
}

/** Relative change between two values as a ratio, or null when undefined. */
export function changeRatio(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** Strips protocol, www and trailing slash: "https://www.example.co.uk/" becomes "example.co.uk". */
export function bareDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/)[0] ?? s;
  s = s.replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  return s;
}

/** True when `host` is the domain itself or one of its subdomains. */
export function hostMatchesDomain(host: string | null | undefined, domain: string): boolean {
  if (!host) return false;
  const h = bareDomain(host);
  const d = bareDomain(domain);
  return h === d || h.endsWith(`.${d}`);
}

export function pathOfUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
