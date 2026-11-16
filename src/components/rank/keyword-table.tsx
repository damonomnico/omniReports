"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Monitor, Search, Smartphone, Tag, Trash2 } from "lucide-react";
import { deleteKeywordsAction, tagKeywordsAction } from "@/lib/actions/rank";
import { Sparkline } from "@/components/charts/sparkline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatInt, pathOfUrl } from "@/lib/format";
import {
  describeMovement,
  FEATURE_LABELS,
  OWNED_FEATURES,
  positionSortValue,
} from "@/lib/rank/display";
import type { KeywordRow } from "@/lib/rank/queries";
import { MovementBadge, PositionValue } from "./movement-badge";

type SortKey = "keyword" | "position" | "change" | "best" | "volume" | "localPack";
type View = "all" | "improved" | "declined" | "top10" | "unranked";

const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All" },
  { key: "improved", label: "Improved" },
  { key: "declined", label: "Declined" },
  { key: "top10", label: "Top 10" },
  { key: "unranked", label: "Not ranking" },
];

function changeValue(r: KeywordRow, depth: number): number {
  if (r.checkedOn === null || !r.hasStart) return 0;
  return (r.startPosition ?? depth + 1) - (r.position ?? depth + 1);
}

export function KeywordTable({
  rows,
  clientId,
  depth,
  canEdit,
  query,
}: {
  rows: KeywordRow[];
  clientId: string;
  depth: number;
  canEdit: boolean;
  /** Current URL query string, so keyword links keep the date range. */
  query: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "position", dir: 1 });
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const showMaps = rows.some((r) => r.trackMaps);
  const showLocalPack = rows.some((r) => r.localPackPosition !== null || r.serpFeatures.includes("local_pack"));
  const multipleLocations = new Set(rows.map((r) => r.locationName)).size > 1;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !r.keyword.includes(q) && !r.tags.some((t) => t.includes(q))) return false;
      const change = changeValue(r, depth);
      switch (view) {
        case "improved":
          return change > 0;
        case "declined":
          return change < 0;
        case "top10":
          return r.position !== null && r.position <= 10;
        case "unranked":
          return r.checkedOn !== null && r.position === null;
        default:
          return true;
      }
    });
    const value = (r: KeywordRow): number | string => {
      switch (sort.key) {
        case "keyword":
          return r.keyword;
        case "position":
          return positionSortValue(r.position, r.checkedOn !== null);
        case "change":
          return -changeValue(r, depth);
        case "best":
          return r.best ?? 10_000;
        case "volume":
          return -(r.searchVolume ?? -1);
        case "localPack":
          return r.localPackPosition ?? 10_000;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return cmp !== 0 ? cmp * sort.dir : a.keyword.localeCompare(b.keyword);
    });
  }, [rows, search, view, sort, depth]);

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  function SortHeader({ k, children, align = "left" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" }) {
    const active = sort.key === k;
    return (
      <th
        className={cn("px-3 py-2.5 font-medium", align === "right" && "text-right")}
        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-ink",
            active && "text-ink",
            align === "right" && "flex-row-reverse",
          )}
        >
          {children}
          {active ? (
            sort.dir === 1 ? (
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            )
          ) : null}
        </button>
      </th>
    );
  }

  function removeSelected() {
    const ids = [...selected];
    if (
      !window.confirm(
        `Stop tracking ${ids.length} keyword${ids.length === 1 ? "" : "s"}? Their ranking history will be deleted.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteKeywordsAction(clientId, ids);
      setSelected(new Set());
    });
  }

  function tagSelected() {
    const tags = window.prompt("Tags to add to the selected keywords (comma separated):");
    if (!tags?.trim()) return;
    startTransition(async () => {
      await tagKeywordsAction(clientId, [...selected], tags, "add");
      setSelected(new Set());
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-paper p-0.5 text-[13px]">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              aria-pressed={view === v.key}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium",
                view === v.key ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-60">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter keywords or tags"
            aria-label="Filter keywords or tags"
            className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-8 text-[13px] placeholder:text-subtle focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      {canEdit && selected.size > 0 ? (
        <div className="mx-5 mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm">
          <span className="font-medium text-brand-800">{selected.size} selected</span>
          <Button variant="secondary" size="sm" onClick={tagSelected} disabled={pending}>
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            Add tags
          </Button>
          <Button variant="danger" size="sm" onClick={removeSelected} disabled={pending}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {pending ? "Working..." : "Stop tracking"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-y border-line text-left text-xs text-muted">
              {canEdit ? (
                <th className="w-10 py-2.5 pr-0 pl-5">
                  <input
                    type="checkbox"
                    aria-label="Select all shown keywords"
                    checked={allVisibleSelected}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(visible.map((r) => r.id)) : new Set())
                    }
                    className="h-4 w-4 accent-brand-800"
                  />
                </th>
              ) : null}
              <SortHeader k="keyword">
                <span className={canEdit ? "" : "pl-2"}>Keyword</span>
              </SortHeader>
              <SortHeader k="position" align="right">
                Position
              </SortHeader>
              <SortHeader k="change" align="right">
                Change
              </SortHeader>
              <SortHeader k="best" align="right">
                Best
              </SortHeader>
              {showLocalPack ? (
                <SortHeader k="localPack" align="right">
                  Local pack
                </SortHeader>
              ) : null}
              {showMaps ? <th className="px-3 py-2.5 text-right font-medium">Maps</th> : null}
              <SortHeader k="volume" align="right">
                Searches / mo
              </SortHeader>
              <th className="px-3 py-2.5 font-medium">Ranking page</th>
              <th className="py-2.5 pr-5 pl-3 text-right font-medium">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-10 text-center text-sm text-muted">
                  No keywords match this view.
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const checked = r.checkedOn !== null;
                const movement = describeMovement(r.position, r.startPosition, r.hasStart, checked);
                const owned = r.serpFeatures.filter((f) => OWNED_FEATURES.has(f));
                return (
                  <tr key={r.id} className={cn("group hover:bg-brand-50/50", selected.has(r.id) && "bg-brand-50/70")}>
                    {canEdit ? (
                      <td className="py-2.5 pr-0 pl-5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.keyword}`}
                          checked={selected.has(r.id)}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.id);
                              else next.delete(r.id);
                              return next;
                            })
                          }
                          className="h-4 w-4 accent-brand-800"
                        />
                      </td>
                    ) : null}
                    <td className={cn("max-w-80 px-3 py-2.5", !canEdit && "pl-5")}>
                      <Link
                        href={`/c/${clientId}/rankings/${r.id}${query ? `?${query}` : ""}`}
                        className="font-medium text-ink group-hover:text-brand-700 hover:underline"
                      >
                        {r.keyword}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1" title={r.device === "mobile" ? "Mobile results" : "Desktop results"}>
                          {r.device === "mobile" ? (
                            <Smartphone className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <Monitor className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span className="sr-only">{r.device}</span>
                          {multipleLocations ? r.locationName.split(",")[0] : null}
                        </span>
                        {r.tags.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                        {owned.map((f) => (
                          <Badge key={f} tone="lime">
                            {FEATURE_LABELS[f]}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <PositionValue
                        position={r.position}
                        checked={checked}
                        depth={depth}
                        className="tabular text-base font-semibold text-ink"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <MovementBadge movement={movement} />
                    </td>
                    <td className="tabular px-3 py-2.5 text-right text-muted">{r.best ?? "-"}</td>
                    {showLocalPack ? (
                      <td className="tabular px-3 py-2.5 text-right">
                        {r.localPackPosition !== null ? (
                          <span className="font-semibold text-ink">{r.localPackPosition}</span>
                        ) : (
                          <span className="text-subtle">-</span>
                        )}
                      </td>
                    ) : null}
                    {showMaps ? (
                      <td className="tabular px-3 py-2.5 text-right">
                        {r.mapsPosition !== null ? (
                          <span className="font-semibold text-ink">{r.mapsPosition}</span>
                        ) : (
                          <span className="text-subtle">-</span>
                        )}
                      </td>
                    ) : null}
                    <td className="tabular px-3 py-2.5 text-right text-muted">
                      {r.searchVolume === null ? "-" : formatInt(r.searchVolume)}
                    </td>
                    <td className="max-w-56 px-3 py-2.5">
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-xs text-brand-600 hover:underline"
                          title={r.url}
                        >
                          {pathOfUrl(r.url)}
                        </a>
                      ) : (
                        <span className="text-xs text-subtle">-</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-5 pl-3">
                      <div className="flex justify-end">
                        <Sparkline values={r.trend} invert label={`Position trend for ${r.keyword}`} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="px-5 pt-3 text-xs text-subtle">
        Showing {visible.length} of {rows.length} keyword{rows.length === 1 ? "" : "s"}. Change compares
        with the position at the start of the selected period.
      </p>
    </div>
  );
}
