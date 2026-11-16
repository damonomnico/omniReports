import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { googleConnections, type GoogleConnection } from "@/db/schema";
import type { ClientContext } from "@/lib/auth/guards";
import { decrypt, encrypt } from "@/lib/crypto";
import { GoogleAuthError, refreshAccessToken } from "./oauth";

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

/** What the UI may know about a connection. Tokens are never included. */
export type ConnectionSummary = {
  id: string;
  scope: "agency" | "client";
  googleEmail: string;
  status: string;
  lastError: string | null;
  grantedScopes: string[];
  createdAt: Date;
};

export function summariseConnection(c: GoogleConnection): ConnectionSummary {
  return {
    id: c.id,
    scope: c.scope,
    googleEmail: c.googleEmail,
    status: c.status,
    lastError: c.lastError,
    grantedScopes: c.grantedScopes.split(" ").filter(Boolean),
    createdAt: c.createdAt,
  };
}

/**
 * Connections that may feed this client's dashboard.
 * Staff can use any omniSEO (agency) account plus the client's own.
 * Client users can only use accounts connected for their own client.
 */
export async function listUsableConnections(ctx: ClientContext): Promise<ConnectionSummary[]> {
  const rows = await db
    .select()
    .from(googleConnections)
    .where(
      ctx.isStaff
        ? or(
            and(eq(googleConnections.scope, "agency"), isNull(googleConnections.clientId)),
            eq(googleConnections.clientId, ctx.client.id),
          )
        : and(eq(googleConnections.scope, "client"), eq(googleConnections.clientId, ctx.client.id)),
    )
    .orderBy(asc(googleConnections.scope), asc(googleConnections.googleEmail));
  return rows.map(summariseConnection);
}

/** Loads a connection only if the current user is allowed to use it for this client. */
export async function getUsableConnection(
  ctx: ClientContext,
  connectionId: string,
): Promise<GoogleConnection | null> {
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return null;
  const [row] = await db.select().from(googleConnections).where(eq(googleConnections.id, connectionId));
  if (!row) return null;
  const ownedByClient = row.scope === "client" && row.clientId === ctx.client.id;
  const agency = row.scope === "agency" && row.clientId === null;
  if (ownedByClient || (agency && ctx.isStaff)) return row;
  return null;
}

export async function saveConnection(input: {
  scope: "agency" | "client";
  clientId: string | null;
  googleEmail: string;
  googleSub: string;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  grantedScopes: string;
  userId: string;
}): Promise<string> {
  const values = {
    googleEmail: input.googleEmail,
    refreshTokenEnc: encrypt(input.refreshToken),
    accessTokenEnc: encrypt(input.accessToken),
    accessTokenExpiresAt: new Date(Date.now() + input.expiresIn * 1000),
    grantedScopes: input.grantedScopes,
    status: "active",
    lastError: null,
    connectedByUserId: input.userId,
  };

  // Reconnecting the same Google account updates the existing connection.
  const [existing] = await db
    .select({ id: googleConnections.id })
    .from(googleConnections)
    .where(
      and(
        eq(googleConnections.scope, input.scope),
        eq(googleConnections.googleSub, input.googleSub),
        input.clientId
          ? eq(googleConnections.clientId, input.clientId)
          : isNull(googleConnections.clientId),
      ),
    );
  if (existing) {
    await db.update(googleConnections).set(values).where(eq(googleConnections.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(googleConnections)
    .values({ ...values, scope: input.scope, clientId: input.clientId, googleSub: input.googleSub })
    .returning({ id: googleConnections.id });
  return created!.id;
}

async function markBroken(connectionId: string, message: string) {
  await db
    .update(googleConnections)
    .set({ status: "error", lastError: message.slice(0, 500) })
    .where(eq(googleConnections.id, connectionId));
}

/** A valid access token for the connection, refreshed when needed. */
export async function getAccessToken(connectionId: string, forceRefresh = false): Promise<string> {
  const [row] = await db.select().from(googleConnections).where(eq(googleConnections.id, connectionId));
  if (!row) throw new GoogleAuthError("This Google connection no longer exists.");

  const stillValid =
    row.accessTokenEnc &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() - Date.now() > 90_000;
  if (stillValid && !forceRefresh) return decrypt(row.accessTokenEnc!);

  try {
    const fresh = await refreshAccessToken(decrypt(row.refreshTokenEnc));
    await db
      .update(googleConnections)
      .set({
        accessTokenEnc: encrypt(fresh.access_token),
        accessTokenExpiresAt: new Date(Date.now() + fresh.expires_in * 1000),
        status: "active",
        lastError: null,
        // Google occasionally rotates the refresh token.
        ...(fresh.refresh_token ? { refreshTokenEnc: encrypt(fresh.refresh_token) } : {}),
      })
      .where(eq(googleConnections.id, connectionId));
    return fresh.access_token;
  } catch (err) {
    if (err instanceof GoogleAuthError && err.code === "invalid_grant") {
      const message = `Google access for ${row.googleEmail} was revoked or has expired. Reconnect the account.`;
      await markBroken(connectionId, message);
      throw new GoogleAuthError(message, "invalid_grant");
    }
    throw err;
  }
}

type FetchOptions = { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number };

/** Authenticated JSON request to a Google API, retried once on an expired token. */
export async function googleFetch<T>(connectionId: string, url: string, opts: FetchOptions = {}): Promise<T> {
  const attempt = async (token: string) =>
    fetch(url, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });

  let res = await attempt(await getAccessToken(connectionId));
  if (res.status === 401) res = await attempt(await getAccessToken(connectionId, true));

  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as
      | { error?: { message?: string; status?: string } }
      | null;
    throw new GoogleApiError(
      json?.error?.message ?? `Google responded with ${res.status}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}
