import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, userTokens } from "@/db/schema";
import { hashToken, randomToken } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

type TokenType = "invite" | "reset";

const LIFETIME_MS: Record<TokenType, number> = {
  invite: 7 * 86_400_000,
  reset: 60 * 60_000,
};

/** Creates a fresh single-use link and cancels any earlier unused ones. */
export async function issueUserToken(userId: string, type: TokenType): Promise<string> {
  await db
    .delete(userTokens)
    .where(
      and(
        eq(userTokens.userId, userId),
        eq(userTokens.type, type),
        isNull(userTokens.usedAt),
      ),
    );
  const token = randomToken();
  await db.insert(userTokens).values({
    userId,
    type,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + LIFETIME_MS[type]),
  });
  return token;
}

export function tokenUrl(type: TokenType, token: string): string {
  return `${appUrl()}/${type === "invite" ? "invite" : "reset"}/${token}`;
}

/** Looks a link up without using it, for rendering the set-password page. */
export async function peekUserToken(token: string, type: TokenType) {
  const [row] = await db
    .select({ userId: users.id, email: users.email, name: users.name })
    .from(userTokens)
    .innerJoin(users, eq(users.id, userTokens.userId))
    .where(
      and(
        eq(userTokens.tokenHash, hashToken(token)),
        eq(userTokens.type, type),
        isNull(userTokens.usedAt),
        gt(userTokens.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    );
  return row ?? null;
}

/** Atomically marks a link as used. Returns the user id, or null if invalid. */
export async function consumeUserToken(
  token: string,
  type: TokenType,
): Promise<string | null> {
  const [row] = await db
    .update(userTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(userTokens.tokenHash, hashToken(token)),
        eq(userTokens.type, type),
        isNull(userTokens.usedAt),
        gt(userTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: userTokens.userId });
  return row?.userId ?? null;
}
