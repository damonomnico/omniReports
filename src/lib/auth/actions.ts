"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { loginAttempts, users } from "@/db/schema";
import { renderEmail, sendEmail } from "@/lib/email";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";
import { createSession, destroyAllSessionsForUser, destroySession } from "./session";
import { consumeUserToken, issueUserToken, tokenUrl } from "./tokens";

export type FormState = { error?: string; message?: string } | undefined;

const WINDOW_MS = 15 * 60_000;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 40;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

async function attemptsFor(key: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.key, key),
        gt(loginAttempts.createdAt, new Date(Date.now() - WINDOW_MS)),
      ),
    );
  return row?.n ?? 0;
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(500),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email address and password." };
  const { email, password } = parsed.data;

  const emailKey = `email:${email}`;
  const ipKey = `ip:${await clientIp()}`;
  const [byEmail, byIp] = await Promise.all([attemptsFor(emailKey), attemptsFor(ipKey)]);
  if (byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP) {
    return { error: "Too many sign-in attempts. Please wait 15 minutes and try again." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = await verifyPassword(password, user?.passwordHash ?? null);

  if (!user || !ok || !user.isActive) {
    await db.insert(loginAttempts).values([{ key: emailKey }, { key: ipKey }]);
    // Keep the table small.
    await db
      .delete(loginAttempts)
      .where(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 3_600_000)));
    return { error: "That email and password combination is not right." };
  }

  await db.delete(loginAttempts).where(eq(loginAttempts.key, emailKey));
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const passwordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords do not match." });

async function setPasswordFromToken(
  type: "invite" | "reset",
  formData: FormData,
): Promise<FormState> {
  const parsed = passwordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const userId = await consumeUserToken(parsed.data.token, type);
  if (!userId) {
    return { error: "This link has expired or was already used. Ask for a new one." };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, userId));
  // A new password signs out every other device.
  await destroyAllSessionsForUser(userId);
  await createSession(userId);
  redirect("/");
}

export async function acceptInviteAction(_prev: FormState, formData: FormData) {
  return setPasswordFromToken("invite", formData);
}

export async function resetPasswordAction(_prev: FormState, formData: FormData) {
  return setPasswordFromToken("reset", formData);
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  const sameAnswer = {
    message:
      "If that address has an account, a reset link is on its way. It works for one hour.",
  };
  if (!email.success) return { error: "Enter a valid email address." };

  const ipKey = `reset-ip:${await clientIp()}`;
  if ((await attemptsFor(ipKey)) >= 10) return sameAnswer;
  await db.insert(loginAttempts).values({ key: ipKey });

  const [user] = await db.select().from(users).where(eq(users.email, email.data));
  // Only accounts that already have a password can reset it. Invited users
  // who never signed in need their invite link instead.
  if (user && user.isActive && user.passwordHash) {
    const token = await issueUserToken(user.id, "reset");
    const { html, text } = renderEmail({
      heading: "Reset your omniReports password",
      paragraphs: [
        `Hi ${user.name}, we received a request to reset your password.`,
        "If this was not you, ignore this email and nothing will change.",
      ],
      button: { label: "Choose a new password", url: tokenUrl("reset", token) },
      footnote: "This link works once and expires in one hour.",
    });
    await sendEmail({ to: user.email, subject: "Reset your omniReports password", html, text });
  }
  return sameAnswer;
}
