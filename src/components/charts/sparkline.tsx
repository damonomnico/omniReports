import { SERIES_COLORS } from "./theme";

/**
 * Tiny trend line. `invert` puts small numbers at the top, for positions.
 * Nulls (not ranking, or no data) break the line.
 */
export function Sparkline({
  values,
  invert = false,
  width = 88,
  height = 26,
  color = SERIES_COLORS[0],
  label,
}: {
  values: (number | null)[];
  invert?: boolean;
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) {
    return <span className="inline-block text-xs text-subtle" style={{ width }} aria-hidden="true" />;
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => pad + (i * (width - pad * 2)) / Math.max(values.length - 1, 1);
  const y = (v: number) => {
    const t = (v - min) / span;
    return pad + (invert ? t : 1 - t) * (height - pad * 2);
  };

  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
    } else {
      current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    }
  });
  if (current.length > 1) segments.push(current.join(" "));

  let lastIndex = values.length - 1;
  while (lastIndex >= 0 && values[lastIndex] === null) lastIndex--;
  const last = values[lastIndex] as number;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? "Trend"}
      className="shrink-0"
    >
      {segments.map((points, i) => (
        <polyline
          key={i}
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <circle cx={x(lastIndex)} cy={y(last)} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
