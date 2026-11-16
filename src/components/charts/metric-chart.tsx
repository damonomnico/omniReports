"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { TimeSeriesChart, type TimeSeriesPoint } from "./time-series-chart";
import type { ValueFormat } from "./theme";

export type MetricOption = {
  key: string;
  label: string;
  format: ValueFormat;
  /** Key holding the previous period's value for the same point. */
  previousKey?: string;
  /** Smaller is better (average position). */
  invert?: boolean;
  description?: string;
};

/**
 * One chart, one axis, with a switch for which measure it shows. Measures on
 * different scales are never drawn against two axes at once.
 */
export function MetricChart({
  title,
  data,
  metrics,
  height = 280,
}: {
  title: string;
  data: TimeSeriesPoint[];
  metrics: MetricOption[];
  height?: number;
}) {
  const [active, setActive] = useState(metrics[0]!.key);
  const metric = metrics.find((m) => m.key === active) ?? metrics[0]!;

  return (
    <div>
      <div
        role="group"
        aria-label={`${title}: choose a measure`}
        className="no-print mb-3 flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1 text-[13px] shadow-card sm:inline-flex"
      >
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={m.key === metric.key}
            onClick={() => setActive(m.key)}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium",
              m.key === metric.key ? "bg-brand-800 text-white" : "text-muted hover:bg-brand-50 hover:text-ink",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <TimeSeriesChart
        title={`${metric.label} over time`}
        description={metric.description}
        data={data}
        series={[{ key: metric.key, label: metric.label }]}
        previousKey={metric.previousKey}
        format={metric.format}
        invert={metric.invert}
        area={!metric.invert}
        height={height}
      />
    </div>
  );
}
