"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { RANGE_PRESETS } from "@/lib/dates";

/**
 * Sets ?range= (or ?from=&to=) and ?compare= in the URL. Every chart, tile
 * and table on the page reads the same values, so the numbers always agree.
 */
export function DateRangePicker({
  preset,
  label,
  from,
  to,
  compare,
  showCompare = true,
}: {
  preset: string;
  label: string;
  from: string;
  to: string;
  compare: boolean;
  showCompare?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomFrom(from);
    setCustomTo(to);
  }, [from, to]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function apply(change: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(change)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    setOpen(false);
  }

  const customValid = customFrom && customTo && customFrom <= customTo;

  return (
    <div ref={ref} className={cn("no-print relative", pending && "opacity-70")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-brand-50"
      >
        <CalendarDays className="h-4 w-4 text-muted" aria-hidden="true" />
        {label}
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className="absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        >
          <ul className="py-1.5">
            {RANGE_PRESETS.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => apply({ range: p.key, from: null, to: null })}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-ink hover:bg-brand-50"
                >
                  {p.label}
                  {preset === p.key ? (
                    <Check className="h-4 w-4 text-brand-700" strokeWidth={3} aria-label="Selected" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-3">
            <p className="mb-2 flex items-center justify-between text-xs font-medium text-muted">
              Custom range
              {preset === "custom" ? (
                <Check className="h-4 w-4 text-brand-700" strokeWidth={3} aria-label="Selected" />
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="From"
                className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong px-2 text-[13px]"
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="To"
                className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong px-2 text-[13px]"
              />
            </div>
            <button
              type="button"
              disabled={!customValid}
              onClick={() => apply({ range: null, from: customFrom, to: customTo })}
              className="mt-2 h-9 w-full rounded-lg bg-brand-800 text-[13px] font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Apply custom range
            </button>
          </div>
          {showCompare ? (
            <label className="flex cursor-pointer items-center gap-2.5 border-t border-line px-4 py-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={compare}
                onChange={(e) => apply({ compare: e.target.checked ? null : "0" })}
                className="h-4 w-4 accent-brand-800"
              />
              Compare with the previous period
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
