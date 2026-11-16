import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientUsers, reportRuns, reportSchedules, users } from "@/db/schema";
import type { ClientContext } from "@/lib/auth/guards";

export async function getSchedules(ctx: ClientContext) {
  return db
    .select()
    .from(reportSchedules)
    .where(eq(reportSchedules.clientId, ctx.client.id))
    .orderBy(asc(reportSchedules.createdAt));
}

export async function getReportRuns(ctx: ClientContext, limit = 12) {
  return db
    .select()
    .from(reportRuns)
    .where(eq(reportRuns.clientId, ctx.client.id))
    .orderBy(desc(reportRuns.createdAt))
    .limit(limit);
}

/** Email addresses of the client's own logins, offered as default recipients. */
export async function getClientEmails(ctx: ClientContext): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(clientUsers)
    .innerJoin(users, eq(users.id, clientUsers.userId))
    .where(eq(clientUsers.clientId, ctx.client.id));
  return rows.map((r) => r.email);
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function describeSchedule(s: { frequency: "weekly" | "monthly"; dayOfWeek: number; dayOfMonth: number }): string {
  if (s.frequency === "weekly") return `Every ${WEEKDAYS[s.dayOfWeek - 1] ?? "week"}`;
  const n = s.dayOfMonth;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `Monthly on the ${n}${suffix}`;
}
