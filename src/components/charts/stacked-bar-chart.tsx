"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, TooltipBox, type TableView } from "./chart-frame";
import {
  AXIS_COLOR,
  fullDate,
  formatTick,
  formatValue,
  GRID_COLOR,
  tickDate,
  TICK_COLOR,
  type ValueFormat,
} from "./theme";

export type Segment = { key: string; label: string; color: string };

/** Columns over time, each split into the same ordered segments. */
export function StackedBarChart({
  title,
  description,
  data,
  segments,
  format = "int",
  height = 260,
  emptyMessage = "No data for this period.",
  totalLabel,
}: {
  title: string;
  description?: string;
  data: ({ date: string } & Record<string, number | string | null>)[];
  /** Listed from the bottom of the stack to the top. */
  segments: Segment[];
  format?: ValueFormat;
  height?: number;
  emptyMessage?: string;
  totalLabel?: string;
}) {
  const hasData = data.length > 0;
  const table: TableView = {
    columns: ["Date", ...segments.map((s) => s.label)],
    rows: data.map((d) => [
      fullDate(d.date),
      ...segments.map((s) => formatValue(d[s.key] as number | null, format)),
    ]),
  };

  return (
    <ChartFrame
      title={title}
      description={description}
      legend={segments.map((s) => ({ label: s.label, color: s.color, shape: "box" as const }))}
      table={hasData ? table : undefined}
    >
      {!hasData ? (
        <p className="flex items-center justify-center px-4 text-sm text-muted" style={{ height }}>
          {emptyMessage}
        </p>
      ) : (
        <div style={{ height }} role="img" aria-label={`${title} chart. Use Show table for the values.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="18%">
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={tickDate}
                tick={{ fill: TICK_COLOR, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: AXIS_COLOR }}
                minTickGap={36}
                interval="preserveStartEnd"
              />
              <YAxis
                width={46}
                allowDecimals={false}
                tickFormatter={(v: number) => formatTick(v, format)}
                tick={{ fill: TICK_COLOR, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgb(13 31 38 / 0.05)" }}
                isAnimationActive={false}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]!.payload as Record<string, number | string | null>;
                  const total = segments.reduce((sum, s) => sum + (Number(row[s.key]) || 0), 0);
                  return (
                    <TooltipBox
                      heading={fullDate(String(label))}
                      // Top of the stack first, matching how the column reads.
                      rows={[...segments].reverse().map((s) => ({
                        label: s.label,
                        color: s.color,
                        value: formatValue(row[s.key] as number | null, format),
                      }))}
                      footer={totalLabel ? `${formatValue(total, format)} ${totalLabel}` : undefined}
                    />
                  );
                }}
              />
              {segments.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="stack"
                  fill={s.color}
                  maxBarSize={24}
                  // A 2px surface-coloured gap separates touching segments.
                  stroke="#ffffff"
                  strokeWidth={data.length > 31 ? 1 : 2}
                  radius={i === segments.length - 1 ? [4, 4, 0, 0] : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
