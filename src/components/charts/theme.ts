/**
 * Chart colours. The categorical order and the rank ramp were checked with a
 * colour-blindness validator against the white card surface, so keep the
 * order: series colours are assigned in sequence and never cycled.
 */
export const SERIES_COLORS = [
  "#0088a3", // teal (brand)
  "#eb6834", // orange
  "#6250d6", // violet
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#2a78d6", // blue
  "#e34948", // red
] as const;

/** One hue, darker = better position. */
export const RANK_BANDS = [
  { key: "top3", label: "1 to 3", color: "#0f3d49" },
  { key: "top10", label: "4 to 10", color: "#1a5f70" },
  { key: "top20", label: "11 to 20", color: "#2b7f93" },
  { key: "top50", label: "21 to 50", color: "#4f9db0" },
  { key: "top100", label: "51 to 100", color: "#7fbccb" },
  { key: "unranked", label: "Not ranking", color: "#d5dcd9" },
] as const;

export const PREVIOUS_COLOR = "#aab4b8";
export const GRID_COLOR = "#e9edeb";
export const AXIS_COLOR = "#cfd8d4";
export const TICK_COLOR = "#7d8c91";

export type ValueFormat =
  | "int"
  | "compact"
  | "percent"
  | "decimal"
  | "position"
  | "duration";

export function formatValue(value: number | null | undefined, format: ValueFormat): string {
  if (value == null || Number.isNaN(value)) return format === "position" ? "Not ranking" : "-";
  switch (format) {
    case "percent":
      return `${(value * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
    case "decimal":
    case "position":
      return value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
    case "duration": {
      const s = Math.round(value);
      const m = Math.floor(s / 60);
      return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
    }
    case "compact":
      return Math.abs(value) < 10_000
        ? Math.round(value).toLocaleString("en-GB")
        : new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
    default:
      return Math.round(value).toLocaleString("en-GB");
  }
}

/** Axis ticks: compact once the axis reaches ten thousand. */
export function formatTick(value: number, format: ValueFormat): string {
  if (format === "percent") return `${Math.round(value * 100)}%`;
  if (format === "duration") return formatValue(value, "duration");
  if (format === "position" || format === "decimal") return String(Math.round(value * 10) / 10);
  return new Intl.NumberFormat("en-GB", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

export function tickDate(date: string): string {
  if (/^\d{4}-\d{2}$/.test(date)) return MONTH.format(new Date(`${date}-01T00:00:00Z`));
  return SHORT.format(new Date(`${date}T00:00:00Z`));
}

export function fullDate(date: string): string {
  if (/^\d{4}-\d{2}$/.test(date)) {
    return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${date}-01T00:00:00Z`),
    );
  }
  return LONG.format(new Date(`${date}T00:00:00Z`));
}
