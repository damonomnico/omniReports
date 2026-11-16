"use server";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { safeEqual } from "@/lib/crypto";
import { cronSecret } from "@/lib/env";
import type { FormState } from "./actions";
import { hashPassword, MIN_PASSWORD_LENGTH } from "./password";
import { createSession } from "./session";
import { needsSetup } from "./setup-state";

const schema = z.object({
  key: z.string().min(1),
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
});

/**
 * Creates the very first admin on a fresh installation. Only works while
 * there are no users at all, and only for someone who knows the CRON_SECRET
 * set in the hosting environment, so a stranger cannot claim a new site.
 */
export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await needsSetup())) return { error: "omniReports is already set up. Sign in instead." };

  const secret = cronSecret();
  if (!secret) {
    return { error: "Set CRON_SECRET (at least 16 characters) in the hosting environment first, then redeploy." };
  }
  const parsed = schema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (!safeEqual(parsed.data.key.trim(), secret)) {
    return { error: "That setup key is not right. It is the CRON_SECRET value from your hosting settings." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  // Guarded insert: if two people submit at once, only the first creates the admin.
  const created = await db.execute<{ id: string }>(sql`
    insert into users (email, name, password_hash, role)
    select ${parsed.data.email}, ${parsed.data.name}, ${passwordHash}, 'admin'
    where not exists (select 1 from users)
    returning id
  `);
  const id = created.rows[0]?.id;
  if (!id) return { error: "omniReports is already set up. Sign in instead." };

  await createSession(id);
  redirect("/clients");
}
