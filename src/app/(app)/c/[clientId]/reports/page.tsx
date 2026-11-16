import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { requireClientAccess } from "@/lib/auth/guards";
import { describeRange, formatDay, formatMonth, makeRange, resolveRange, todayInTz } from "@/lib/dates";
import { describeSchedule, getReportRuns, getSchedules } from "@/lib/reports/queries";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireClientAccess(clientId);
  const { client, isStaff } = ctx;
  const today = todayInTz(client.timezone);
  const pdf = (query: string) => `/api/c/${client.id}/report?${query}`;

  const lastMonth = resolveRange({ range: "last-month" }, client.timezone).current;
  const presets = [
    { query: "range=last-month", title: formatMonth(lastMonth.from), detail: "Last full month, compared with the month before" },
    { query: "range=28d", title: "Last 28 days", detail: "Compared with the 28 days before" },
    { query: "range=90d", title: "Last 90 days", detail: "Compared with the 90 days before" },
    { query: "range=this-month", title: "This month so far", detail: "Compared with the same number of days before" },
  ];

  const [schedules, runs] = await Promise.all([getSchedules(ctx), getReportRuns(ctx, 12)]);
  const active = schedules.filter((s) => s.isActive);
  const sent = runs.filter((r) => r.status === "sent");

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Reports"
        description="Download a PDF of your SEO performance for any period, ready to share or print."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Download a report"
            description="Each report covers rankings, search traffic, website visits, your Business Profile and the links we have built."
          />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
            {presets.map((p) => (
              <a
                key={p.query}
                href={pdf(p.query)}
                className="group flex items-start gap-3 rounded-xl border border-line p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 group-hover:bg-surface">
                  <Download className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-medium text-ink">{p.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{p.detail}</span>
                </span>
              </a>
            ))}
          </div>
          <form
            action={`/api/c/${client.id}/report`}
            method="get"
            className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-4"
          >
            <p className="w-full text-[13px] font-medium text-ink">Or choose your own dates</p>
            <label className="text-xs text-muted">
              From
              <input
                type="date"
                name="from"
                required
                max={today}
                defaultValue={lastMonth.from}
                className="mt-1 block h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink"
              />
            </label>
            <label className="text-xs text-muted">
              To
              <input
                type="date"
                name="to"
                required
                max={today}
                defaultValue={lastMonth.to}
                className="mt-1 block h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink"
              />
            </label>
            <button type="submit" className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download PDF
            </button>
          </form>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Reports by email"
              description={
                active.length > 0
                  ? "These are sent automatically."
                  : "No report is being emailed automatically at the moment."
              }
              action={
                isStaff && !client.isDemo ? (
                  <Link href={`/c/${client.id}/settings/reports`} className={buttonClass("secondary", "sm")}>
                    Manage
                  </Link>
                ) : undefined
              }
            />
            {active.length === 0 ? (
              <p className="flex items-start gap-3 px-5 pb-6 text-sm text-muted">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                {client.isDemo
                  ? "Reports are not emailed for the demo client."
                  : isStaff
                    ? "Set up a monthly or weekly report so it arrives in the client's inbox on its own."
                    : "If you would like a report emailed to you every month, just ask omniSEO."}
              </p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {active.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 px-5 py-3.5">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{describeSchedule(s)}</p>
                      <p className="mt-0.5 text-sm break-words text-muted">To {s.recipients.join(", ")}</p>
                      <p className="mt-0.5 text-xs text-subtle">Next one: {formatDay(s.nextRunOn)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Previously sent" description="Download any earlier report again." />
            {sent.length === 0 ? (
              <p className="flex items-start gap-3 px-5 pb-6 text-sm text-muted">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                Reports appear here once they have been emailed.
              </p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {sent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {describeRange(makeRange(r.periodStart, r.periodEnd))}
                      </p>
                      <p className="text-xs text-muted">
                        Sent {formatDay(r.createdAt.toISOString().slice(0, 10))}
                      </p>
                    </div>
                    <a
                      href={pdf(`from=${r.periodStart}&to=${r.periodEnd}`)}
                      className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      PDF
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {client.isDemo ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Badge tone="warn">Demo</Badge> Downloads for this client are stamped as sample reports.
          </p>
        ) : null}
      </div>
    </>
  );
}
