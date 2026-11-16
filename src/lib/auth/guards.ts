import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Client } from "@/db/schema";
import { isStaff, resolveClientAccess, type SessionUser } from "./access";
import { getCurrentUser } from "./session";

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** omniSEO team only. Client users get a 404, not a hint that the page exists. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user)) notFound();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}

/**
 * Proof that the current user may see this client. Every function that reads
 * or writes client data takes one of these, so tenant checks cannot be skipped.
 */
export type ClientContext = {
  readonly user: SessionUser;
  readonly client: Client;
  /** True for omniSEO team members, false for the client's own users. */
  readonly isStaff: boolean;
};

export const requireClientAccess = cache(
  async (clientId: string): Promise<ClientContext> => {
    const user = await requireUser();
    const client = await resolveClientAccess(user, clientId);
    if (!client) notFound();
    return { user, client, isStaff: isStaff(user) };
  },
);

/** Staff-only actions on a client (settings, keywords, links, users). */
export async function requireClientStaff(clientId: string): Promise<ClientContext> {
  const ctx = await requireClientAccess(clientId);
  if (!ctx.isStaff) notFound();
  return ctx;
}
