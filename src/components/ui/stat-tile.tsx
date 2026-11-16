import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

export type DeltaProps = {
  /** Signed text to show, e.g. "+12.4%" or "3". */
  text: string;
  direction: "up" | "down" | "flat";
  /** Whether this movement is good news. Null renders neutral. */
  good: boolean | null;
};

/** Builds a percentage-change delta. `goodWhenUp` is false for metrics like bounce rate. */
export function percentDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  goodWhenUp = true,
): DeltaProps | null {
  if (current == null || previous == null || previous === 0) return null;
  const ratio = (current - previous) / Math.abs(previous);
  if (Math.abs(ratio) < 0.0005) return { text: "0%", direction: "flat", good: null };
  const up = ratio > 0;
  return {
    text: `${up ? "+" : "-"}${Math.abs(ratio * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`,
    direction: up ? "up" : "down",
    good: up === goodWhenUp,
  };
}

/** Builds an absolute-change delta, e.g. keywords in the top 10 going from 4 to 7. */
export function countDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  goodWhenUp = true,
  digits = 0,
): DeltaProps | null {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return { text: "0", direction: "flat", good: null };
  const up = diff > 0;
  return {
    text: `${up ? "+" : "-"}${Math.abs(diff).toLocaleString("en-GB", { maximumFractionDigits: digits })}`,
    direction: up ? "up" : "down",
    good: up === goodWhenUp,
  };
}

export function Delta({ delta, className }: { delta: DeltaProps; className?: string }) {
  const Icon = delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular",
        delta.good === null
          ? "bg-paper text-muted"
          : delta.good
            ? "bg-up-bg text-up"
            : "bg-down-bg text-down",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {delta.text}
      <span className="sr-only">
        {delta.good === null ? "no change" : delta.good ? "improvement" : "decline"}
      </span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  delta,
  hint,
  trend,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: DeltaProps | null;
  /** Small context line, e.g. "vs previous 28 days". */
  hint?: ReactNode;
  trend?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-4 shadow-card", className)}>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p className="font-display text-[1.7rem] leading-none font-semibold text-ink">{value}</p>
        {trend}
      </div>
      <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
        {delta ? <Delta delta={delta} /> : null}
        {hint ? <span className="text-xs text-subtle">{hint}</span> : null}
      </div>
    </div>
  );
}

/**
 * Change in a ranking position, where a smaller number is better. Moving
 * from 12.0 to 9.5 shows as an upward, good "2.5".
 */
export function positionDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): DeltaProps | null {
  if (current == null || previous == null) return null;
  const gained = previous - current;
  if (Math.abs(gained) < 0.05) return { text: "0", direction: "flat", good: null };
  return {
    text: Math.abs(gained).toLocaleString("en-GB", { maximumFractionDigits: 1 }),
    direction: gained > 0 ? "up" : "down",
    good: gained > 0,
  };
}
