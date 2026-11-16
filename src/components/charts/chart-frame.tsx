"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Table2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type LegendItem = { label: string; color: string; shape?: "line" | "box" };

export type TableView = {
  columns: string[];
  rows: (string | number)[][];
};

/**
 * The card around every chart: title, legend, and a "view as table" toggle so
 * every value in a chart can also be read without hovering.
 */
export function ChartFrame({
  title,
  description,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  legend?: LegendItem[];
  table?: TableView;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className={cn("rounded-xl border border-line bg-surface shadow-card", className)}>
      <header className="flex items-start justify-between gap-x-4 px-5 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
        </div>
        {table ? (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className={cn(
              "no-print inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap",
              showTable ? "bg-brand-800 text-white" : "text-muted hover:bg-brand-50 hover:text-ink",
            )}
          >
            <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
            {showTable ? "Show chart" : "Show table"}
          </button>
        ) : null}
      </header>

      {legend && legend.length > 1 && !showTable ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 pt-3 text-xs text-muted">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn("inline-block", item.shape === "box" ? "h-2.5 w-2.5 rounded-[3px]" : "h-0.5 w-3.5 rounded-full")}
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="px-3 pt-3 pb-4">
        {showTable && table ? (
          <div className="max-h-80 overflow-auto px-2">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-left text-xs text-muted">
                  {table.columns.map((c, i) => (
                    <th key={c} className={cn("px-2 py-2 font-medium", i > 0 && "text-right")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {table.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, i) => (
                      <td key={i} className={cn("px-2 py-1.5", i > 0 && "tabular text-right")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** Shared tooltip body: date heading, then value-first rows keyed by a line swatch. */
export function TooltipBox({
  heading,
  rows,
  footer,
}: {
  heading: string;
  rows: { label: string; value: string; color: string; note?: string }[];
  footer?: string;
}) {
  return (
    <div className="min-w-40 rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
      <p className="mb-1.5 text-xs font-medium text-muted">{heading}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className="h-0.5 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            <span className="tabular font-semibold text-ink">{r.value}</span>
            <span className="text-muted">
              {r.label}
              {r.note ? <span className="text-subtle"> ({r.note})</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {footer ? <p className="mt-1.5 text-[11px] text-subtle">{footer}</p> : null}
    </div>
  );
}
