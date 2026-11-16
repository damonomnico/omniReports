import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientIntegrations, googleConnections } from "@/db/schema";
import type { ClientContext } from "@/lib/auth/guards";
import { GoogleApiError } from "./connections";
import { GoogleAuthError } from "./oauth";
import type { ReportState } from "./types";

export type IntegrationType = "gsc" | "ga4" | "gbp";

export const INTEGRATION_NAMES: Record<IntegrationType, string> = {
  gsc: "Search Console",
  ga4: "Google Analytics",
  gbp: "Business Profile",
};

export type ActiveIntegration = {
  id: string;
  type: IntegrationType;
  connectionId: string;
  externalId: string;
  externalName: string;
  googleEmail: string;
  connectionStatus: string;
  connectionScope: "agency" | "client";
};

export async function getIntegration(
  ctx: ClientContext,
  type: IntegrationType,
): Promise<ActiveIntegration | null> {
  const [row] = await db
    .select({
      id: clientIntegrations.id,
      type: clientIntegrations.type,
      connectionId: clientIntegrations.connectionId,
      externalId: clientIntegrations.externalId,
      externalName: clientIntegrations.externalName,
      googleEmail: googleConnections.googleEmail,
      connectionStatus: googleConnections.status,
      connectionScope: googleConnections.scope,
    })
    .from(clientIntegrations)
    .innerJoin(googleConnections, eq(googleConnections.id, clientIntegrations.connectionId))
    .where(and(eq(clientIntegrations.clientId, ctx.client.id), eq(clientIntegrations.type, type)));
  return row ?? null;
}

export async function getIntegrations(ctx: ClientContext): Promise<ActiveIntegration[]> {
  return db
    .select({
      id: clientIntegrations.id,
      type: clientIntegrations.type,
      connectionId: clientIntegrations.connectionId,
      externalId: clientIntegrations.externalId,
      externalName: clientIntegrations.externalName,
      googleEmail: googleConnections.googleEmail,
      connectionStatus: googleConnections.status,
      connectionScope: googleConnections.scope,
    })
    .from(clientIntegrations)
    .innerJoin(googleConnections, eq(googleConnections.id, clientIntegrations.connectionId))
    .where(eq(clientIntegrations.clientId, ctx.client.id));
}

/**
 * Turns a failed API call into something safe to show. Staff get the detail;
 * client users get a plain explanation without internal specifics.
 */
export function describeFailure<T>(err: unknown, ctx: ClientContext, source: string): ReportState<T> {
  console.error(`[${source}] report failed for client ${ctx.client.id}`, err);

  if (err instanceof GoogleAuthError) {
    return {
      status: "error",
      needsReconnect: true,
      message: ctx.isStaff
        ? err.message
        : `The Google connection for ${source} needs renewing. omniSEO has what they need to fix it.`,
    };
  }
  if (err instanceof GoogleApiError) {
    const detail = ctx.isStaff ? ` Google said: ${err.message}` : "";
    if (err.status === 403) {
      return {
        status: "error",
        needsReconnect: false,
        message: `The connected Google account does not have access to this ${source} property.${detail}`,
      };
    }
    if (err.status === 429 && source === "Business Profile") {
      // Google gives new projects a quota of zero for these APIs until its
      // access request form has been approved.
      return {
        status: "error",
        needsReconnect: false,
        message: ctx.isStaff
          ? `Google has not approved Business Profile API access for this Google Cloud project yet, or the quota is used up. New projects have a quota of zero until the access request is approved.${detail}`
          : "Business Profile data is not available yet. omniSEO is waiting on Google to enable it.",
      };
    }
    if (err.status === 429) {
      return {
        status: "error",
        needsReconnect: false,
        message: `Google is limiting requests right now. Please try again in a few minutes.${detail}`,
      };
    }
    return {
      status: "error",
      needsReconnect: false,
      message: `Google could not return the ${source} data just now.${detail}`,
    };
  }
  return {
    status: "error",
    needsReconnect: false,
    message: `The ${source} data could not be loaded just now. Please try again shortly.`,
  };
}
