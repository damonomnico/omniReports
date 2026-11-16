"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientIntegrations, googleConnections } from "@/db/schema";
import { requireClientAccess, requireStaff } from "@/lib/auth/guards";
import { decrypt } from "@/lib/crypto";
import { clearCache } from "@/lib/google/cache";
import { getUsableConnection, GoogleApiError } from "@/lib/google/connections";
import { listGa4Properties } from "@/lib/google/ga4";
import { listGbpLocations } from "@/lib/google/gbp";
import { describeGscSite, listGscSites } from "@/lib/google/gsc";
import { INTEGRATION_NAMES, type IntegrationType } from "@/lib/google/integrations";
import { GoogleAuthError, revokeToken, SCOPE_FOR } from "@/lib/google/oauth";
import { bareDomain } from "@/lib/format";

export type PropertyOption = {
  id: string;
  name: string;
  detail: string;
  /** Looks like the right one for this client. */
  suggested: boolean;
};

const TYPES: IntegrationType[] = ["gsc", "ga4", "gbp"];

/**
 * Revoking tells Google to cancel the whole grant for that Google account, so
 * only do it when no other connection here relies on the same account.
 */
async function revokeIfUnshared(connection: { id: string; googleSub: string; refreshTokenEnc: string }) {
  const sameAccount = await db
    .select({ id: googleConnections.id })
    .from(googleConnections)
    .where(eq(googleConnections.googleSub, connection.googleSub));
  if (sameAccount.length <= 1) await revokeToken(decrypt(connection.refreshTokenEnc));
}
const isType = (t: string): t is IntegrationType => (TYPES as string[]).includes(t);

function friendlyError(err: unknown, type: IntegrationType): string {
  if (err instanceof GoogleAuthError) return err.message;
  if (err instanceof GoogleApiError) {
    if (type === "gbp" && err.status === 429) {
      return "Google has not approved Business Profile API access for this project yet (the quota is zero until the access request is approved).";
    }
    if (err.status === 403) {
      return `Google refused the request. Check the ${INTEGRATION_NAMES[type]} API is enabled in Google Cloud and that this account has access. (${err.message})`;
    }
    return `Google could not list the properties: ${err.message}`;
  }
  return "The list could not be loaded. Please try again.";
}

async function listProperties(
  connectionId: string,
  type: IntegrationType,
  client: { domain: string; name: string; businessName: string | null },
): Promise<PropertyOption[]> {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const nameHints = [words(client.name), words(client.businessName ?? "")].filter((h) => h.length > 2);
  const looksLike = (text: string) => {
    const t = words(text);
    return nameHints.some((h) => t.includes(h) || h.includes(t)) || t.includes(words(client.domain.split(".")[0]!));
  };

  let options: PropertyOption[];
  if (type === "gsc") {
    options = (await listGscSites(connectionId)).map((s) => ({
      id: s.siteUrl,
      name: describeGscSite(s.siteUrl),
      detail: s.permissionLevel === "siteOwner" ? "Owner" : "User",
      suggested: bareDomain(s.siteUrl.replace(/^sc-domain:/, "")) === client.domain,
    }));
  } else if (type === "ga4") {
    options = (await listGa4Properties(connectionId)).map((p) => ({
      id: p.id,
      name: p.name,
      detail: `${p.account} · property ${p.id}`,
      suggested: looksLike(p.name) || looksLike(p.account),
    }));
  } else {
    options = (await listGbpLocations(connectionId)).map((l) => ({
      id: l.id,
      name: l.name,
      detail: l.address || "No address shown",
      suggested: looksLike(l.name),
    }));
  }
  return options.sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.name.localeCompare(b.name));
}

/** Properties the chosen Google account can read, for the picker. */
export async function loadPropertiesAction(
  clientId: string,
  connectionId: string,
  type: string,
): Promise<{ options: PropertyOption[]; error?: string }> {
  const ctx = await requireClientAccess(clientId);
  if (!isType(type)) return { options: [], error: "Unknown data source." };
  const connection = await getUsableConnection(ctx, connectionId);
  if (!connection) return { options: [], error: "That Google account is not available for this client." };
  if (!connection.grantedScopes.split(" ").includes(SCOPE_FOR[type])) {
    return {
      options: [],
      error: `${connection.googleEmail} did not grant access to ${INTEGRATION_NAMES[type]}. Reconnect the account and tick every box on Google's permission screen.`,
    };
  }
  try {
    return { options: await listProperties(connection.id, type, ctx.client) };
  } catch (err) {
    console.error("[google] listing properties failed", err);
    return { options: [], error: friendlyError(err, type) };
  }
}

export async function setIntegrationAction(
  clientId: string,
  type: string,
  connectionId: string,
  externalId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireClientAccess(clientId);
  if (!isType(type)) return { error: "Unknown data source." };
  const connection = await getUsableConnection(ctx, connectionId);
  if (!connection) return { error: "That Google account is not available for this client." };

  // Only accept a property the account can really read: never trust the id sent by the browser.
  let chosen: PropertyOption | undefined;
  try {
    chosen = (await listProperties(connection.id, type, ctx.client)).find((o) => o.id === externalId);
  } catch (err) {
    return { error: friendlyError(err, type) };
  }
  if (!chosen) return { error: "That property is not available to the selected Google account." };

  const values = { connectionId: connection.id, externalId: chosen.id, externalName: chosen.name };
  await db
    .insert(clientIntegrations)
    .values({ clientId: ctx.client.id, type, ...values })
    .onConflictDoUpdate({ target: [clientIntegrations.clientId, clientIntegrations.type], set: values });
  await clearCache(ctx.client.id, type);
  revalidatePath(`/c/${ctx.client.id}`, "layout");
  return { ok: true };
}

export async function removeIntegrationAction(clientId: string, type: string): Promise<{ error?: string }> {
  const ctx = await requireClientAccess(clientId);
  if (!isType(type)) return { error: "Unknown data source." };

  const [row] = await db
    .select({ id: clientIntegrations.id, scope: googleConnections.scope })
    .from(clientIntegrations)
    .innerJoin(googleConnections, eq(googleConnections.id, clientIntegrations.connectionId))
    .where(and(eq(clientIntegrations.clientId, ctx.client.id), eq(clientIntegrations.type, type)));
  if (!row) return {};
  // A client can undo their own connection, but not one omniSEO set up.
  if (!ctx.isStaff && row.scope !== "client") {
    return { error: "omniSEO set this connection up. Please ask us if you would like it changed." };
  }
  await db.delete(clientIntegrations).where(eq(clientIntegrations.id, row.id));
  await clearCache(ctx.client.id, type);
  revalidatePath(`/c/${ctx.client.id}`, "layout");
  return {};
}

/** Removes a Google account connected for one client, and every data source using it. */
export async function disconnectClientGoogleAction(clientId: string, connectionId: string): Promise<{ error?: string }> {
  const ctx = await requireClientAccess(clientId);
  const connection = await getUsableConnection(ctx, connectionId);
  if (!connection || connection.scope !== "client") return { error: "That Google account was not found." };

  await revokeIfUnshared(connection);
  await db.delete(googleConnections).where(eq(googleConnections.id, connection.id));
  for (const t of TYPES) await clearCache(ctx.client.id, t);
  revalidatePath(`/c/${ctx.client.id}`, "layout");
  return {};
}

/** Removes an omniSEO Google account. Every client using it loses that data source. */
export async function disconnectAgencyGoogleAction(connectionId: string): Promise<{ error?: string }> {
  await requireStaff();
  const [connection] = await db
    .select()
    .from(googleConnections)
    .where(and(eq(googleConnections.id, connectionId), eq(googleConnections.scope, "agency")));
  if (!connection) return { error: "That Google account was not found." };

  const affected = await db
    .select({ clientId: clientIntegrations.clientId, type: clientIntegrations.type })
    .from(clientIntegrations)
    .where(eq(clientIntegrations.connectionId, connection.id));

  await revokeIfUnshared(connection);
  await db.delete(googleConnections).where(eq(googleConnections.id, connection.id));
  for (const a of affected) await clearCache(a.clientId, a.type);
  revalidatePath("/", "layout");
  return {};
}
