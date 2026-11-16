import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, ilike, or, sql } from "drizzle-orm";
import { ArrowRight, Building2, Search } from "lucide-react";
import { db } from "@/db";
import { clientIntegrations, clients } from "@/db/schema";
import { AddClientDialog } from "@/components/clients/add-client-dialog";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { isStaff, listAccessibleClients } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/guards";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { formatInt, initials } from "@/lib/format";

export const metadata: Metadata = { title: "Clients" };

const INTEGRATION_LABEL = { gsc: "Search Console", ga4: "Analytics", gbp: "Business Profile" } as const;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  if (!isStaff(user)) {
    const mine = await listAccessibleClients(user);
    return (
      <>
        <PageHeader title="Your reports" description="Choose a business to open its reports." />
        {mine.length === 0 ? (
          <Card>
            <EmptyState icon={<Building2 className="h-5 w-5" />} title="Nothing to show yet">
              Your login is not linked to a business yet. Please contact omniSEO and we will sort it out.
            </EmptyState>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mine.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.id}`}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-brand-300"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-800 font-display text-sm font-semibold text-white">
                  {initials(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display font-semibold text-ink">{c.name}</span>
                  <span className="block truncate text-sm text-muted">{c.domain}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
              </Link>
            ))}
          </div>
        )}
      </>
    );
  }

  const q = (params.q ?? "").trim().slice(0, 80);
  const showArchived = params.show === "archived";

  const rows = await db
    .select({
      client: clients,
      keywordCount: sql<number>`(select count(*)::int from keywords k where k.client_id = ${clients.id} and k.is_active)`,
      userCount: sql<number>`(select count(*)::int from client_users cu where cu.client_id = ${clients.id})`,
      lastChecked: sql<string | null>`(select max(r.checked_on)::text from rank_results r where r.client_id = ${clients.id})`,
      topTen: sql<number>`(
        select count(*)::int from rank_results r
        where r.client_id = ${clients.id}
          and r.position <= 10
          and r.checked_on = (select max(r2.checked_on) from rank_results r2 where r2.keyword_id = r.keyword_id)
          and exists (select 1 from keywords k where k.id = r.keyword_id and k.is_active)
      )`,
    })
    .from(clients)
    .where(
      sql`${eq(clients.status, showArchived ? "archived" : "active")} and ${
        q ? or(ilike(clients.name, `%${q}%`), ilike(clients.domain, `%${q}%`)) : sql`true`
      }`,
    )
    .orderBy(asc(clients.name));

  const integrations = await db
    .select({ clientId: clientIntegrations.clientId, type: clientIntegrations.type })
    .from(clientIntegrations);
  const byClient = new Map<string, Set<string>>();
  for (const i of integrations) {
    if (!byClient.has(i.clientId)) byClient.set(i.clientId, new Set());
    byClient.get(i.clientId)!.add(i.type);
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${rows.length} ${showArchived ? "archived" : "active"} ${rows.length === 1 ? "client" : "clients"}`}
        actions={<AddClientDialog />}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form className="relative w-full max-w-xs" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search clients"
            aria-label="Search clients"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {showArchived ? <input type="hidden" name="show" value="archived" /> : null}
        </form>
        <div className="flex rounded-lg border border-line-strong bg-surface p-0.5 text-sm">
          {[
            { label: "Active", href: "/clients", on: !showArchived },
            { label: "Archived", href: "/clients?show=archived", on: showArchived },
          ].map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium",
                t.on ? "bg-brand-800 text-white" : "text-muted hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title={q ? "No clients match that search" : showArchived ? "No archived clients" : "No clients yet"}
            action={!q && !showArchived ? <AddClientDialog /> : undefined}
          >
            {q
              ? "Try a different name or domain."
              : showArchived
                ? "Clients you archive appear here and can be restored at any time."
                : "Add your first client to start tracking rankings and building their dashboard."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-medium text-muted">
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-3 py-3 text-right font-medium">Keywords</th>
                  <th className="px-3 py-3 text-right font-medium">In top 10</th>
                  <th className="px-3 py-3 font-medium">Last rank check</th>
                  <th className="px-3 py-3 font-medium">Connected</th>
                  <th className="px-5 py-3 text-right font-medium">Logins</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ client: c, keywordCount, userCount, lastChecked, topTen }) => {
                  const connected = byClient.get(c.id);
                  return (
                    <tr key={c.id} className="group hover:bg-brand-50/50">
                      <td className="px-5 py-3">
                        <Link href={`/c/${c.id}`} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-800 text-xs font-semibold text-white">
                            {initials(c.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 font-medium text-ink group-hover:text-brand-700">
                              <span className="truncate">{c.name}</span>
                              {c.isDemo ? <Badge tone="warn">Demo</Badge> : null}
                            </span>
                            <span className="block truncate text-xs text-muted">{c.domain}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="tabular px-3 py-3 text-right">{formatInt(keywordCount)}</td>
                      <td className="tabular px-3 py-3 text-right">
                        {keywordCount > 0 ? formatInt(topTen) : "-"}
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {lastChecked ? formatDay(lastChecked) : "Not checked yet"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(["gsc", "ga4", "gbp"] as const).map((t) =>
                            connected?.has(t) || c.isDemo ? (
                              <Badge key={t} tone="brand">
                                {INTEGRATION_LABEL[t]}
                              </Badge>
                            ) : null,
                          )}
                          {!c.isDemo && !connected?.size ? (
                            <span className="text-xs text-subtle">Nothing yet</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="tabular px-5 py-3 text-right">{formatInt(userCount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
