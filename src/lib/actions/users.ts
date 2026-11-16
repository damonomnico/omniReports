"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientUsers, users } from "@/db/schema";
import { requireAdmin, requireClientStaff, requireUser } from "@/lib/auth/guards";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyAllSessionsForUser } from "@/lib/auth/session";
import { issueUserToken, tokenUrl } from "@/lib/auth/tokens";
import { renderEmail, sendEmail } from "@/lib/email";
import type { ActionState } from "./types";

const personSchema = z.object({
  name: z.string().trim().min(2, "Enter their name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

async function sendInvite(
  user: { id: string; name: string; email: string },
  context: string,
): Promise<{ link: string; emailed: boolean }> {
  const token = await issueUserToken(user.id, "invite");
  const link = tokenUrl("invite", token);
  const { html, text } = renderEmail({
    heading: "You have been invited to omniReports",
    paragraphs: [
      `Hi ${user.name}, omniSEO has set up an omniReports login for you ${context}.`,
      "Choose a password to open your reports. You can sign in any time after that.",
    ],
    button: { label: "Set up my account", url: link },
    footnote: "This invite link works once and expires in 7 days.",
  });
  const result = await sendEmail({
    to: user.email,
    subject: "Your omniReports login",
    html,
    text,
  });
  return { link, emailed: result.delivered };
}

function inviteResult(emailed: boolean, link: string, email: string): ActionState {
  return {
    ok: true,
    emailed,
    link,
    message: emailed
      ? `Invite emailed to ${email}.`
      : "Email is not set up yet, so copy this invite link and send it to them yourself.",
  };
}

/** Gives a person a login that can only see this one client. */
export async function inviteClientUserAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  const parsed = personSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  let [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  if (user && user.role !== "client") {
    return { error: "That address belongs to an omniSEO team member, who can already see every client." };
  }
  if (user && !user.isActive) {
    return { error: "That login has been deactivated. Reactivate it from the client's user list first." };
  }
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: parsed.data.email, name: parsed.data.name, role: "client" })
      .returning();
  }

  await db
    .insert(clientUsers)
    .values({ clientId: ctx.client.id, userId: user!.id })
    .onConflictDoNothing();
  revalidatePath(`/c/${ctx.client.id}/settings/users`);

  if (user!.passwordHash) {
    return { ok: true, message: `${user!.email} already has a login and can now see ${ctx.client.name}.` };
  }
  const { link, emailed } = await sendInvite(user!, `for ${ctx.client.name}`);
  return inviteResult(emailed, link, user!.email);
}

export async function removeClientUserAction(clientId: string, userId: string): Promise<void> {
  const ctx = await requireClientStaff(clientId);
  await db
    .delete(clientUsers)
    .where(and(eq(clientUsers.clientId, ctx.client.id), eq(clientUsers.userId, userId)));

  // A client login with no clients left has nothing to see: remove it entirely.
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (target?.role === "client") {
    const remaining = await db
      .select({ clientId: clientUsers.clientId })
      .from(clientUsers)
      .where(eq(clientUsers.userId, userId));
    if (remaining.length === 0) await db.delete(users).where(eq(users.id, userId));
  }
  revalidatePath(`/c/${ctx.client.id}/settings/users`);
}

/** Fresh invite (no password yet) or reset link for a user of this client. */
export async function clientUserLinkAction(
  clientId: string,
  userId: string,
  _prev: ActionState,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  const [row] = await db
    .select({ user: users })
    .from(clientUsers)
    .innerJoin(users, eq(users.id, clientUsers.userId))
    .where(and(eq(clientUsers.clientId, ctx.client.id), eq(clientUsers.userId, userId)));
  if (!row || row.user.role !== "client") return { error: "That user was not found." };

  if (!row.user.passwordHash) {
    const { link, emailed } = await sendInvite(row.user, `for ${ctx.client.name}`);
    return inviteResult(emailed, link, row.user.email);
  }
  const token = await issueUserToken(row.user.id, "reset");
  return {
    ok: true,
    link: tokenUrl("reset", token),
    message: "Password reset link created. It works once and expires in one hour.",
  };
}

/* ------------------------------ omniSEO team ----------------------------- */

const staffSchema = personSchema.extend({ role: z.enum(["admin", "staff"]) });

export async function inviteStaffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = staffSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const [existing] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  if (existing) return { error: "Someone with that email address already has a login." };

  const [user] = await db
    .insert(users)
    .values({ email: parsed.data.email, name: parsed.data.name, role: parsed.data.role })
    .returning();
  revalidatePath("/admin/team");

  const { link, emailed } = await sendInvite(user!, "as part of the omniSEO team");
  return inviteResult(emailed, link, user!.email);
}

export async function updateStaffAction(
  userId: string,
  change: { role?: "admin" | "staff"; isActive?: boolean },
): Promise<{ error?: string }> {
  const me = await requireAdmin();
  if (userId === me.id) return { error: "You cannot change your own role or deactivate yourself." };

  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target || target.role === "client") return { error: "That team member was not found." };

  await db
    .update(users)
    .set({
      ...(change.role ? { role: change.role } : {}),
      ...(change.isActive === undefined ? {} : { isActive: change.isActive }),
    })
    .where(eq(users.id, userId));
  revalidatePath("/admin/team");
  return {};
}

export async function staffLinkAction(userId: string, _prev: ActionState): Promise<ActionState> {
  await requireAdmin();
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target || target.role === "client") return { error: "That team member was not found." };

  if (!target.passwordHash) {
    const { link, emailed } = await sendInvite(target, "as part of the omniSEO team");
    return inviteResult(emailed, link, target.email);
  }
  const token = await issueUserToken(target.id, "reset");
  return {
    ok: true,
    link: tokenUrl("reset", token),
    message: "Password reset link created. It works once and expires in one hour.",
  };
}

/* ------------------------------- own account ----------------------------- */

export async function updateAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireUser();
  const name = z.string().trim().min(2).max(120).safeParse(formData.get("name"));
  if (!name.success) return { error: "Enter your name." };
  await db.update(users).set({ name: name.data }).where(eq(users.id, me.id));
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (next !== confirm) return { error: "The two new passwords do not match." };

  const [row] = await db.select().from(users).where(eq(users.id, me.id));
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    return { error: "Your current password is not right." };
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, me.id));
  // Sign out every other device, then keep this one signed in.
  await destroyAllSessionsForUser(me.id);
  await createSession(me.id);
  return { ok: true, message: "Password changed. Other devices have been signed out." };
}
