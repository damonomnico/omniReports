"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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
  PREVIOUS_COLOR,
  SERIES_COLORS,
  tickDate,
  TICK_COLOR,
  type ValueFormat,
} from "./theme";

export type SeriesDef = {
  key: string;
  label: string;
  /** Defaults to the palette colour for this series' position in the list. */
  color?: string;
};

export type TimeSeriesPoint = {
  date: string;
  /** Date this point is compared with, when a previous period is drawn. */
  previousDate?: string;
} & Record<string, number | string | null | undefined>;

/**
 * Line chart over time on a single axis. With one series and `previousKey`
 * set, the previous period is drawn behind it in grey for comparison.
 */
export function TimeSeriesChart({
  title,
  description,
  data,
  series,
  format = "int",
  invert = false,
  area = false,
  previousKey,
  previousLabel = "Previous period",
  height = 260,
  yMax,
  emptyMessage = "No data for this period.",
}: {
  title: string;
  description?: string;
  data: TimeSeriesPoint[];
  series: SeriesDef[];
  format?: ValueFormat;
  /** Smaller is better (positions): puts 1 at the top. */
  invert?: boolean;
  area?: boolean;
  previousKey?: string;
  previousLabel?: string;
  height?: number;
  yMax?: number;
  emptyMessage?: string;
}) {
  const coloured = series.map((s, i) => ({
    ...s,
    color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!,
  }));
  const hasPrevious = Boolean(previousKey) && data.some((d) => d[previousKey!] != null);
  const hasData = data.some((d) => coloured.some((s) => typeof d[s.key] === "number"));

  const legend = [
    ...coloured.map((s) => ({ label: s.label, color: s.color })),
    ...(hasPrevious ? [{ label: previousLabel, color: PREVIOUS_COLOR }] : []),
  ];

  // Positions read best against round ticks with 1 at the top.
  let invertTicks: number[] | undefined;
  if (invert) {
    const values = data.flatMap((d) =>
      [...coloured.map((s) => d[s.key]), previousKey ? d[previousKey] : null].filter(
        (v): v is number => typeof v === "number",
      ),
    );
    const max = Math.max(yMax ?? 0, ...values, 3);
    const step = max <= 10 ? 3 : max <= 20 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : 50;
    invertTicks = [1];
    for (let t = step; t < max + step; t += step) invertTicks.push(t);
  }

  const table: TableView = {
    columns: ["Date", ...coloured.map((s) => s.label), ...(hasPrevious ? [previousLabel] : [])],
    rows: data.map((d) => [
      fullDate(d.date),
      ...coloured.map((s) => formatValue(d[s.key] as number | null, format)),
      ...(hasPrevious ? [formatValue(d[previousKey!] as number | null, format)] : []),
    ]),
  };

  return (
    <ChartFrame title={title} description={description} legend={legend} table={hasData ? table : undefined}>
      {!hasData ? (
        <p className="flex items-center justify-center px-4 text-sm text-muted" style={{ height }}>
          {emptyMessage}
        </p>
      ) : (
        <div style={{ height }} role="img" aria-label={`${title} chart. Use Show table for the values.`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
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
                reversed={invert}
                allowDecimals={format === "percent" || format === "decimal"}
                domain={invertTicks ? [1, invertTicks[invertTicks.length - 1]!] : [0, yMax ?? "auto"]}
                ticks={invertTicks}
                tickFormatter={(v: number) => formatTick(v, format)}
                tick={{ fill: TICK_COLOR, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: AXIS_COLOR, strokeWidth: 1 }}
                isAnimationActive={false}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]!.payload as TimeSeriesPoint;
                  return (
                    <TooltipBox
                      heading={fullDate(String(label))}
                      rows={[
                        ...coloured.map((s) => ({
                          label: s.label,
                          color: s.color,
                          value: formatValue(row[s.key] as number | null, format),
                        })),
                        ...(hasPrevious
                          ? [
                              {
                                label: previousLabel,
                                color: PREVIOUS_COLOR,
                                value: formatValue(row[previousKey!] as number | null, format),
                                note: row.previousDate ? tickDate(row.previousDate) : undefined,
                              },
                            ]
                          : []),
                      ]}
                    />
                  );
                }}
              />
              {hasPrevious ? (
                <Line
                  type="monotone"
                  dataKey={previousKey!}
                  stroke={PREVIOUS_COLOR}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ) : null}
              {area && coloured.length === 1 ? (
                <Area
                  type="monotone"
                  dataKey={coloured[0]!.key}
                  stroke="none"
                  fill={coloured[0]!.color}
                  fillOpacity={0.1}
                  isAnimationActive={false}
                  activeDot={false}
                  tooltipType="none"
                />
              ) : null}
              {coloured.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={data.length <= 2 ? { r: 4, fill: s.color, stroke: "#fff", strokeWidth: 2 } : false}
                  activeDot={{ r: 4.5, fill: s.color, stroke: "#fff", strokeWidth: 2 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
