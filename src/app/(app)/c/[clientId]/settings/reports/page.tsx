import type { Metadata } from "next";
import { AlertTriangle, Mail } from "lucide-react";
import {
  DeleteScheduleButton,
  ScheduleDialog,
  SendNowButtons,
} from "@/components/reports/schedule-forms";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { requireClientStaff } from "@/lib/auth/guards";
import { describeRange, formatDay, makeRange } from "@/lib/dates";
import { emailConfigured } from "@/lib/env";
import { REPORT_SECTIONS } from "@/lib/reports/data";
import { describeSchedule, getClientEmails, getReportRuns, getSchedules } from "@/lib/reports/queries";

export const metadata: Metadata = { title: "Scheduled reports" };

const TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

export default async function ScheduledReportsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireClientStaff(clientId);
  const { client } = ctx;

  if (client.isDemo) {
    return (
      <p className="rounded-xl border border-line bg-surface px-5 py-4 text-sm text-muted">
        Reports are never emailed for the demo client. You can still download a sample PDF from its
        Reports page.
      </p>
    );
  }

  const [schedules, runs, clientEmails] = await Promise.all([
    getSchedules(ctx),
    getReportRuns(ctx, 20),
    getClientEmails(ctx),
  ]);
  const sections = REPORT_SECTIONS.map((s) => ({ key: s.key, label: s.label }));

  return (
    <div className="space-y-5">
      {!emailConfigured() ? (
        <p className="flex items-start gap-2.5 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Email is not set up yet, so scheduled reports will not be delivered. Add{" "}
            <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> in the hosting environment. You can
            still set schedules up now.
          </span>
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Scheduled reports"
          description={`PDF reports emailed automatically for ${client.name}.`}
          action={<ScheduleDialog clientId={client.id} sections={sections} suggestedRecipients={clientEmails} />}
        />
        {schedules.length === 0 ? (
          <EmptyState icon={<Mail className="h-5 w-5" />} title="No reports are scheduled">
            Set up a monthly or weekly report and it will arrive in the client&apos;s inbox without anyone
            having to remember.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {schedules.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start gap-x-6 gap-y-3 px-5 py-4">
                <div className="min-w-0 flex-1 basis-72">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {describeSchedule(s)}
                    {s.isActive ? <Badge tone="up">Sending</Badge> : <Badge>Paused</Badge>}
                  </p>
                  <p className="mt-1 text-sm break-words text-muted">To {s.recipients.join(", ")}</p>
                  <p className="mt-1 text-xs text-subtle">
                    {s.isActive ? `Next send: ${formatDay(s.nextRunOn)}. ` : ""}
                    Includes{" "}
                    {REPORT_SECTIONS.filter((r) => s.sections.includes(r.key))
                      .map((r) => r.label.toLowerCase())
                      .join(", ")}
                    .
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1">
                    <ScheduleDialog
                      clientId={client.id}
                      sections={sections}
                      suggestedRecipients={clientEmails}
                      schedule={{
                        id: s.id,
                        frequency: s.frequency,
                        dayOfWeek: s.dayOfWeek,
                        dayOfMonth: s.dayOfMonth,
                        recipients: s.recipients,
                        sections: s.sections,
                        isActive: s.isActive,
                      }}
                    />
                    <DeleteScheduleButton clientId={client.id} scheduleId={s.id} />
                  </div>
                  <SendNowButtons clientId={client.id} scheduleId={s.id} recipientCount={s.recipients.length} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Delivery history" description="The last 20 reports sent or attempted." />
        {runs.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-muted">Nothing has been sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-y border-line text-left text-xs text-muted">
                  <th className="px-5 py-2.5 font-medium">Sent</th>
                  <th className="px-3 py-2.5 font-medium">Period covered</th>
                  <th className="px-3 py-2.5 font-medium">To</th>
                  <th className="px-5 py-2.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5 whitespace-nowrap text-muted">{TIME.format(r.createdAt)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {describeRange(makeRange(r.periodStart, r.periodEnd))}
                    </td>
                    <td className="max-w-64 truncate px-3 py-2.5 text-muted" title={r.recipients.join(", ")}>
                      {r.recipients.join(", ") || "-"}
                    </td>
                    <td className="px-5 py-2.5">
                      {r.status === "sent" ? (
                        <Badge tone="up">Sent</Badge>
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone="down">Failed</Badge>
                          <span className="text-xs text-muted">{r.error}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
