import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/** True on a brand new installation, before the first admin exists. */
export async function needsSetup(): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return (row?.n ?? 0) === 0;
}
