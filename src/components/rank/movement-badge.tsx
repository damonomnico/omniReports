import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { Movement } from "@/lib/rank/display";

export function MovementBadge({ movement }: { movement: Movement }) {
  switch (movement.kind) {
    case "none":
      return <span className="text-subtle">-</span>;
    case "new":
      return <span className="text-xs font-medium text-muted">New</span>;
    case "same":
      return (
        <span className="inline-flex items-center text-muted" title="No change">
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">No change</span>
        </span>
      );
    case "up":
      return (
        <span className="tabular inline-flex items-center gap-0.5 font-semibold text-up">
          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          {movement.entered ? "In" : movement.by}
          <span className="sr-only">{movement.entered ? "entered the results" : "positions up"}</span>
        </span>
      );
    case "down":
      return (
        <span className="tabular inline-flex items-center gap-0.5 font-semibold text-down">
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          {movement.lost ? "Out" : movement.by}
          <span className="sr-only">{movement.lost ? "dropped out of the results" : "positions down"}</span>
        </span>
      );
  }
}

/** A position as people say it: "4", or a quiet note when there isn't one. */
export function PositionValue({
  position,
  checked,
  depth,
  className,
}: {
  position: number | null;
  checked: boolean;
  depth: number;
  className?: string;
}) {
  if (!checked) return <span className="text-xs text-subtle">Awaiting first check</span>;
  if (position === null) return <span className="text-xs text-muted">Not in top {depth}</span>;
  return <span className={className ?? "tabular font-semibold text-ink"}>{position}</span>;
}
