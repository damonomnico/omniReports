import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SERIES_COLORS } from "./theme";

export type BarListItem = {
  key: string;
  label: ReactNode;
  /** Plain-text version of the label for the tooltip. */
  title?: string;
  value: number;
  /** Formatted value shown at the row's end. */
  display: string;
  /** Extra columns after the value, e.g. a change badge. */
  extra?: ReactNode;
  /** Draws this row in the accent colour and the others in grey. */
  highlight?: boolean;
};

/**
 * Ranked horizontal bars: one hue, one shared baseline, value at the end.
 * When any row is highlighted the rest fall back to grey (emphasis form).
 */
export function BarList({
  items,
  color = SERIES_COLORS[0],
  emptyMessage = "No data for this period.",
  className,
}: {
  items: BarListItem[];
  color?: string;
  emptyMessage?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted">{emptyMessage}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  const emphasis = items.some((i) => i.highlight);

  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => (
        <li key={item.key} title={item.title ? `${item.title}: ${item.display}` : undefined}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={cn("min-w-0 truncate", item.highlight ? "font-semibold text-ink" : "text-ink")}>
              {item.label}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {item.extra}
              <span className="tabular font-semibold text-ink">{item.display}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-paper">
            <div
              className="h-full rounded-r-full"
              style={{
                width: `${Math.max((item.value / max) * 100, item.value > 0 ? 1.5 : 0)}%`,
                backgroundColor: emphasis && !item.highlight ? "#b7c2c6" : color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
