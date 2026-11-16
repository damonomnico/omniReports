"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportSchedules } from "@/db/schema";
import { requireClientStaff } from "@/lib/auth/guards";
import { todayInTz } from "@/lib/dates";
import { ALL_SECTIONS, type ReportSectionKey } from "@/lib/reports/data";
import { nextRunAfter, selectionFor, sendReport } from "@/lib/reports/schedule";
import type { ActionState } from "./types";

const EMAIL = z.string().trim().toLowerCase().email();

function parseRecipients(raw: unknown): { emails: string[]; bad: string | null } {
  const parts = String(raw ?? "")
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const emails: string[] = [];
  for (const p of parts) {
    const parsed = EMAIL.safeParse(p);
    if (!parsed.success) return { emails: [], bad: p };
    if (!emails.includes(parsed.data)) emails.push(parsed.data);
  }
  return { emails, bad: null };
}

const scheduleSchema = z.object({
  frequency: z.enum(["weekly", "monthly"]),
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  dayOfMonth: z.coerce.number().int().min(1).max(28),
});

export async function saveScheduleAction(
  clientId: string,
  scheduleId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  if (ctx.client.isDemo) return { error: "Reports are not emailed for the demo client." };

  const parsed = scheduleSchema.safeParse({
    frequency: formData.get("frequency"),
    dayOfWeek: formData.get("dayOfWeek") ?? 1,
    dayOfMonth: formData.get("dayOfMonth") ?? 3,
  });
  if (!parsed.success) return { error: "Choose how often and on which day to send the report." };

  const { emails, bad } = parseRecipients(formData.get("recipients"));
  if (bad) return { error: `"${bad.slice(0, 60)}" is not a valid email address.` };
  if (emails.length === 0) return { error: "Add at least one email address to send the report to." };
  if (emails.length > 10) return { error: "A report can go to up to 10 people." };

  const sections = ALL_SECTIONS.filter((s) => formData.get(`section_${s}`));
  if (sections.length === 0) return { error: "Tick at least one section to include." };

  const values = {
    ...parsed.data,
    recipients: emails,
    sections,
    isActive: formData.get("isActive") !== "off",
    nextRunOn: nextRunAfter(
      parsed.data.frequency,
      parsed.data.dayOfWeek,
      parsed.data.dayOfMonth,
      todayInTz("Europe/London"),
    ),
  };

  if (scheduleId) {
    const rows = await db
      .update(reportSchedules)
      .set(values)
      .where(and(eq(reportSchedules.clientId, ctx.client.id), eq(reportSchedules.id, scheduleId)))
      .returning({ id: reportSchedules.id });
    if (rows.length === 0) return { error: "That schedule was not found." };
  } else {
    await db.insert(reportSchedules).values({ clientId: ctx.client.id, ...values });
  }
  revalidatePath(`/c/${ctx.client.id}`, "layout");
  return { ok: true, message: "Schedule saved." };
}

export async function deleteScheduleAction(clientId: string, scheduleId: string): Promise<void> {
  const ctx = await requireClientStaff(clientId);
  await db
    .delete(reportSchedules)
    .where(and(eq(reportSchedules.clientId, ctx.client.id), eq(reportSchedules.id, scheduleId)));
  revalidatePath(`/c/${ctx.client.id}`, "layout");
}

/**
 * Sends the schedule's most recent report straight away.
 * mode "test" sends only to the team member pressing the button.
 */
export async function sendScheduleNowAction(
  clientId: string,
  scheduleId: string,
  mode: "test" | "recipients",
  _prev: ActionState,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  const [schedule] = await db
    .select()
    .from(reportSchedules)
    .where(and(eq(reportSchedules.clientId, ctx.client.id), eq(reportSchedules.id, scheduleId)));
  if (!schedule) return { error: "That schedule was not found." };
  if (ctx.client.isDemo) return { error: "Reports are not emailed for the demo client." };

  const result = await sendReport({
    client: ctx.client,
    selection: selectionFor(schedule.frequency, todayInTz("Europe/London")),
    recipients: mode === "test" ? [ctx.user.email] : schedule.recipients,
    sections: schedule.sections as ReportSectionKey[],
    scheduleId: schedule.id,
    test: mode === "test",
  });
  revalidatePath(`/c/${ctx.client.id}`, "layout");
  if (!result.ok) return { error: result.error };
  return {
    ok: true,
    message:
      mode === "test"
        ? `Test report sent to ${ctx.user.email}.`
        : `Report sent to ${result.recipients.join(", ")}.`,
  };
}
