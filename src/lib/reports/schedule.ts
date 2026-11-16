import "server-only";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { clients, reportRuns, reportSchedules, type Client } from "@/db/schema";
import { systemClientContext } from "@/lib/auth/guards";
import {
  addDays,
  addMonths,
  describeRange,
  isoWeekday,
  makeRange,
  previousRange,
  startOfMonth,
  todayInTz,
  type DateRange,
  type RangeSelection,
} from "@/lib/dates";
import { renderEmail, sendEmail } from "@/lib/email";
import { appUrl, emailConfigured } from "@/lib/env";
import { ALL_SECTIONS, buildReportData, type ReportSectionKey } from "./data";
import { renderReportPdf } from "./pdf";
import { summarise } from "./summary";

export type Frequency = "weekly" | "monthly";

/** The finished period a report sent on `runDate` covers. */
export function periodFor(frequency: Frequency, runDate: string): DateRange {
  if (frequency === "weekly") {
    const to = addDays(runDate, -1);
    return makeRange(addDays(to, -6), to);
  }
  const lastDayOfPreviousMonth = addDays(startOfMonth(runDate), -1);
  return makeRange(startOfMonth(lastDayOfPreviousMonth), lastDayOfPreviousMonth);
}

/** What that period is compared with: the week before, or the calendar month before. */
export function comparisonFor(frequency: Frequency, period: DateRange): DateRange {
  if (frequency === "weekly") return previousRange(period);
  const lastDay = addDays(period.from, -1);
  return makeRange(startOfMonth(lastDay), lastDay);
}

/** The first date after `after` that matches the schedule. */
export function nextRunAfter(
  frequency: Frequency,
  dayOfWeek: number,
  dayOfMonth: number,
  after: string,
): string {
  if (frequency === "weekly") {
    for (let i = 1; i <= 7; i++) {
      const candidate = addDays(after, i);
      if (isoWeekday(candidate) === dayOfWeek) return candidate;
    }
    return addDays(after, 7);
  }
  const day = Math.min(Math.max(dayOfMonth, 1), 28);
  const thisMonth = `${after.slice(0, 7)}-${String(day).padStart(2, "0")}`;
  if (thisMonth > after) return thisMonth;
  return `${addMonths(startOfMonth(after), 1).slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

export function selectionFor(frequency: Frequency, runDate: string): RangeSelection {
  const current = periodFor(frequency, runDate);
  return {
    preset: "custom",
    label: describeRange(current),
    current,
    previous: comparisonFor(frequency, current),
    compare: true,
  };
}

export type SendResult = { ok: true; recipients: string[] } | { ok: false; error: string };

/**
 * Builds the PDF for a period and emails it. Every attempt is recorded in
 * report_runs so there is a history of what was sent, and what failed.
 */
export async function sendReport(input: {
  client: Client;
  selection: RangeSelection;
  recipients: string[];
  sections: ReportSectionKey[];
  scheduleId: string | null;
  /** Test sends go to a team member and are not logged as client deliveries. */
  test?: boolean;
}): Promise<SendResult> {
  const { client, selection, recipients } = input;
  const log = async (status: "sent" | "failed", error?: string) => {
    if (input.test) return;
    await db.insert(reportRuns).values({
      clientId: client.id,
      scheduleId: input.scheduleId,
      periodStart: selection.current.from,
      periodEnd: selection.current.to,
      status,
      recipients,
      error: error?.slice(0, 500),
    });
  };

  if (recipients.length === 0) {
    await log("failed", "No recipients");
    return { ok: false, error: "There is nobody to send the report to." };
  }
  if (!emailConfigured()) {
    await log("failed", "Email is not set up");
    return { ok: false, error: "Email is not set up yet, so reports cannot be sent. Add RESEND_API_KEY." };
  }

  try {
    const sections = input.sections.length > 0 ? input.sections : ALL_SECTIONS;
    const data = await buildReportData(systemClientContext(client), selection, sections);
    const pdf = await renderReportPdf(data);
    const headlines = summarise(data);
    const period = describeRange(selection.current);

    const { html, text } = renderEmail({
      heading: `${client.name}: SEO report for ${period}`,
      paragraphs: [
        input.test
          ? "This is a test send, so only you received it."
          : "Your latest SEO report from omniSEO is attached as a PDF. Here are the headlines:",
        ...headlines.map((h) => `• ${h}`),
        "The full figures, updated daily, are in your online dashboard.",
      ],
      button: { label: "Open your dashboard", url: `${appUrl()}/c/${client.id}` },
    });

    const result = await sendEmail({
      to: recipients,
      subject: `${input.test ? "[Test] " : ""}${client.name} SEO report: ${period}`,
      html,
      text,
      attachments: [
        {
          filename: `${client.domain}-seo-report-${selection.current.from}-to-${selection.current.to}.pdf`,
          content: pdf,
        },
      ],
    });
    if (!result.delivered) {
      const error = result.reason === "not_configured" ? "Email is not set up" : (result.error ?? "Email failed");
      await log("failed", error);
      return { ok: false, error: `The email could not be sent (${error}).` };
    }
    await log("sent");
    return { ok: true, recipients };
  } catch (err) {
    console.error(`[reports] failed for client ${client.id}`, err);
    const message = err instanceof Error ? err.message : String(err);
    await log("failed", message);
    return { ok: false, error: "The report could not be generated. Check the server logs for details." };
  }
}

export type DueSummary = { due: number; sent: number; failed: number; skipped: number };

/** Sends every scheduled report that is due. Run daily. */
export async function runDueReports(budgetMs = 240_000): Promise<DueSummary> {
  const started = Date.now();
  // Schedules are stored as calendar dates; UK time decides what "today" is.
  const today = todayInTz("Europe/London");
  const summary: DueSummary = { due: 0, sent: 0, failed: 0, skipped: 0 };

  const due = await db
    .select({ schedule: reportSchedules, client: clients })
    .from(reportSchedules)
    .innerJoin(clients, eq(clients.id, reportSchedules.clientId))
    .where(and(eq(reportSchedules.isActive, true), lte(reportSchedules.nextRunOn, today)))
    .orderBy(asc(reportSchedules.nextRunOn));
  summary.due = due.length;

  for (const { schedule, client } of due) {
    if (Date.now() - started > budgetMs) break; // the rest run tomorrow

    const advance = () =>
      db
        .update(reportSchedules)
        .set({
          nextRunOn: nextRunAfter(schedule.frequency, schedule.dayOfWeek, schedule.dayOfMonth, today),
          lastRunAt: new Date(),
        })
        .where(eq(reportSchedules.id, schedule.id));

    if (client.status !== "active" || client.isDemo) {
      await advance();
      summary.skipped++;
      continue;
    }

    const result = await sendReport({
      client,
      // Report on the period that was due, even if the job ran a day or two late.
      selection: selectionFor(schedule.frequency, schedule.nextRunOn),
      recipients: schedule.recipients,
      sections: schedule.sections as ReportSectionKey[],
      scheduleId: schedule.id,
    });
    await advance();
    if (result.ok) summary.sent++;
    else summary.failed++;
  }
  return summary;
}

