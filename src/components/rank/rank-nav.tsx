import Link from "next/link";
import { Download } from "lucide-react";
import { Tabs } from "@/components/shell/tabs";
import { UrlSegments, UrlSelect } from "@/components/shell/url-controls";
import type { RankFilters } from "@/lib/rank/queries";

/** Tabs plus the one filter row that scopes everything on the rank pages. */
export function RankNav({
  clientId,
  query,
  filters,
  tags,
  showExport = true,
}: {
  clientId: string;
  query: string;
  filters: RankFilters;
  tags: string[];
  showExport?: boolean;
}) {
  const suffix = query ? `?${query}` : "";
  return (
    <>
      <Tabs
        tabs={[
          { href: `/c/${clientId}/rankings`, label: "Keywords", exact: true },
          { href: `/c/${clientId}/rankings/competitors`, label: "Competitors" },
        ]}
      />
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <UrlSegments
          param="device"
          label="Device"
          value={filters.device ?? ""}
          options={[
            { value: "", label: "All devices" },
            { value: "desktop", label: "Desktop" },
            { value: "mobile", label: "Mobile" },
          ]}
        />
        {tags.length > 0 ? (
          <UrlSelect
            param="tag"
            label="Tag"
            value={filters.tag ?? ""}
            options={[{ value: "", label: "All tags" }, ...tags.map((t) => ({ value: t, label: t }))]}
          />
        ) : null}
        {showExport ? (
          <Link
            href={`/api/c/${clientId}/rankings/export${suffix}`}
            prefetch={false}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted hover:bg-brand-50 hover:text-ink"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export CSV
          </Link>
        ) : null}
      </div>
    </>
  );
}
