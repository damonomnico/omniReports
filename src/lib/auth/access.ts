import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clients, clientUsers, type Client } from "@/db/schema";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "staff" | "client";
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** omniSEO team members (admin or staff) can see every client. */
export function isStaff(user: SessionUser): boolean {
  return user.role === "admin" || user.role === "staff";
}

/**
 * The single place that decides whether a user may see a client.
 * Staff see every client. Client users only see active clients they have been
 * explicitly added to. Returns null for "no such client" and "not allowed"
 * alike, so callers cannot leak which client ids exist.
 */
export async function resolveClientAccess(
  user: SessionUser,
  clientId: string,
): Promise<Client | null> {
  if (!isUuid(clientId)) return null;

  if (isStaff(user)) {
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    return client ?? null;
  }

  const [row] = await db
    .select({ client: clients })
    .from(clientUsers)
    .innerJoin(clients, eq(clients.id, clientUsers.clientId))
    .where(
      and(
        eq(clientUsers.userId, user.id),
        eq(clientUsers.clientId, clientId),
        eq(clients.status, "active"),
      ),
    );
  return row?.client ?? null;
}

/** Every client the user may open, alphabetically. */
export async function listAccessibleClients(
  user: SessionUser,
  opts: { includeArchived?: boolean } = {},
): Promise<Client[]> {
  if (isStaff(user)) {
    return db
      .select()
      .from(clients)
      .where(
        opts.includeArchived
          ? undefined
          : inArray(clients.status, ["active"]),
      )
      .orderBy(asc(clients.name));
  }
  const rows = await db
    .select({ client: clients })
    .from(clientUsers)
    .innerJoin(clients, eq(clients.id, clientUsers.clientId))
    .where(and(eq(clientUsers.userId, user.id), eq(clients.status, "active")))
    .orderBy(asc(clients.name));
  return rows.map((r) => r.client);
}
