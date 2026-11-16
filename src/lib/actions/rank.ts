"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { competitors, keywords } from "@/db/schema";
import { requireClientStaff } from "@/lib/auth/guards";
import { dataForSeoConfigured } from "@/lib/env";
import { bareDomain } from "@/lib/format";
import { collectForClient } from "@/lib/rank/collect";
import { countPendingTasks, dispatchRankChecks } from "@/lib/rank/dispatch";
import { searchLocations, type LocationOption } from "@/lib/rank/locations";
import { refreshSearchVolumes } from "@/lib/rank/volume";
import type { ActionState } from "./types";

const MAX_KEYWORDS_PER_ADD = 500;

function parseTags(raw: unknown): string[] {
  return [
    ...new Set(
      String(raw ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase().slice(0, 40))
        .filter(Boolean),
    ),
  ].slice(0, 10);
}

function revalidateRankings(clientId: string) {
  revalidatePath(`/c/${clientId}`, "layout");
}

const addSchema = z.object({
  locationCode: z.coerce.number().int().positive(),
  locationName: z.string().trim().min(2).max(200),
  languageCode: z.string().trim().min(2).max(8),
});

export async function addKeywordsAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);

  const lines = [
    ...new Set(
      String(formData.get("keywords") ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim().replace(/\s+/g, " ").toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (lines.length === 0) return { error: "Enter at least one keyword, one per line." };
  if (lines.length > MAX_KEYWORDS_PER_ADD) {
    return { error: `Add up to ${MAX_KEYWORDS_PER_ADD} keywords at a time.` };
  }
  const tooLong = lines.find((l) => l.length > 120);
  if (tooLong) return { error: `"${tooLong.slice(0, 40)}..." is too long (120 characters max).` };

  const parsed = addSchema.safeParse({
    locationCode: formData.get("locationCode"),
    locationName: formData.get("locationName"),
    languageCode: formData.get("languageCode") || ctx.client.defaultLanguageCode,
  });
  if (!parsed.success) return { error: "Choose a location for these keywords." };

  const devices = (["desktop", "mobile"] as const).filter((d) => formData.get(`device_${d}`));
  if (devices.length === 0) return { error: "Choose desktop, mobile or both." };

  const tags = parseTags(formData.get("tags"));
  const trackMaps = Boolean(formData.get("trackMaps"));

  const values = lines.flatMap((keyword) =>
    devices.map((device) => ({
      clientId: ctx.client.id,
      keyword,
      locationCode: parsed.data.locationCode,
      locationName: parsed.data.locationName,
      languageCode: parsed.data.languageCode,
      device,
      tags,
      trackMaps,
    })),
  );

  const inserted = await db
    .insert(keywords)
    .values(values)
    .onConflictDoUpdate({
      target: [
        keywords.clientId,
        keywords.keyword,
        keywords.locationCode,
        keywords.languageCode,
        keywords.device,
      ],
      // Re-adding a keyword that was removed brings it back with its history.
      set: { isActive: true },
      setWhere: eq(keywords.isActive, false),
    })
    .returning({ id: keywords.id });

  revalidateRankings(ctx.client.id);
  const skipped = values.length - inserted.length;
  return {
    ok: true,
    message:
      `Added ${inserted.length} keyword${inserted.length === 1 ? "" : "s"}` +
      (skipped > 0 ? ` (${skipped} already tracked)` : "") +
      ". Their first positions arrive with the next rank check.",
  };
}

export async function deleteKeywordsAction(clientId: string, ids: string[]): Promise<{ deleted: number }> {
  const ctx = await requireClientStaff(clientId);
  const safeIds = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 1000);
  if (safeIds.length === 0) return { deleted: 0 };
  // Scoped to this client: ids from another client are silently ignored.
  const rows = await db
    .delete(keywords)
    .where(and(eq(keywords.clientId, ctx.client.id), inArray(keywords.id, safeIds)))
    .returning({ id: keywords.id });
  revalidateRankings(ctx.client.id);
  return { deleted: rows.length };
}

export async function updateKeywordAction(
  clientId: string,
  keywordId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  const rows = await db
    .update(keywords)
    .set({ tags: parseTags(formData.get("tags")), trackMaps: Boolean(formData.get("trackMaps")) })
    .where(and(eq(keywords.clientId, ctx.client.id), eq(keywords.id, keywordId)))
    .returning({ id: keywords.id });
  if (rows.length === 0) return { error: "That keyword was not found." };
  revalidateRankings(ctx.client.id);
  return { ok: true, message: "Saved." };
}

/** Applies tags to many keywords at once. mode "add" keeps existing tags. */
export async function tagKeywordsAction(
  clientId: string,
  ids: string[],
  rawTags: string,
  mode: "add" | "replace",
): Promise<{ updated: number }> {
  const ctx = await requireClientStaff(clientId);
  const tags = parseTags(rawTags);
  const safeIds = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 1000);
  if (safeIds.length === 0 || (tags.length === 0 && mode === "add")) return { updated: 0 };

  const tagArray = sql`array[${sql.join(
    tags.map((t) => sql`${t}`),
    sql`, `,
  )}]::text[]`;
  const rows = await db
    .update(keywords)
    .set({
      tags:
        mode === "replace"
          ? tags
          : sql`(select coalesce(array_agg(distinct t order by t), '{}') from unnest(${keywords.tags} || ${tagArray}) as t)`,
    })
    .where(and(eq(keywords.clientId, ctx.client.id), inArray(keywords.id, safeIds)))
    .returning({ id: keywords.id });
  revalidateRankings(ctx.client.id);
  return { updated: rows.length };
}

/** Town and city search for the location picker. */
export async function searchLocationsAction(
  clientId: string,
  query: string,
): Promise<{ options: LocationOption[]; synced: boolean; error?: string }> {
  const ctx = await requireClientStaff(clientId);
  return searchLocations(ctx.client.countryCode, query);
}

/* ------------------------------ Rank checks ------------------------------ */

export async function checkRankingsNowAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  if (ctx.client.isDemo) return { error: "Demo clients use sample data and are never checked." };
  if (ctx.client.status !== "active") return { error: "Restore this client before checking rankings." };
  if (!dataForSeoConfigured()) {
    return { error: "DataForSEO is not connected yet. Add the API login and password in the hosting settings." };
  }

  const summary = await dispatchRankChecks({
    clientId: ctx.client.id,
    force: formData.get("mode") === "all",
    priority: 2,
  });
  revalidateRankings(ctx.client.id);

  if (summary.posted === 0 && summary.errors.length > 0) {
    return { error: `DataForSEO did not accept the checks: ${summary.errors[0]}` };
  }
  if (summary.posted === 0) {
    return {
      ok: true,
      message:
        summary.skipped > 0
          ? "Every keyword has already been checked today. Choose \"Re-check everything\" to run them again."
          : "There are no keywords to check yet.",
    };
  }
  return {
    ok: true,
    message:
      `Queued ${summary.posted} check${summary.posted === 1 ? "" : "s"}` +
      (summary.failed > 0 ? ` (${summary.failed} could not be queued)` : "") +
      ". Results usually arrive within a couple of minutes.",
  };
}

/** Pulls in any finished checks and reports how many are still running. */
export async function refreshPendingAction(clientId: string): Promise<{ pending: number; stored: number; error?: string }> {
  const ctx = await requireClientStaff(clientId);
  const summary = await collectForClient(ctx.client.id);
  if (summary.stored > 0 || summary.failed > 0) revalidateRankings(ctx.client.id);
  return {
    pending: await countPendingTasks(ctx.client.id),
    stored: summary.stored,
    error: summary.errors[0],
  };
}

export async function fetchSearchVolumesAction(clientId: string, _prev: ActionState): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  if (ctx.client.isDemo) return { error: "Demo clients use sample data." };
  if (!dataForSeoConfigured()) return { error: "DataForSEO is not connected yet." };
  const summary = await refreshSearchVolumes({ clientId: ctx.client.id });
  revalidateRankings(ctx.client.id);
  if (summary.errors.length > 0) return { error: `DataForSEO: ${summary.errors[0]}` };
  return {
    ok: true,
    message:
      summary.updated > 0
        ? `Updated search volume for ${summary.updated} keyword${summary.updated === 1 ? "" : "s"}.`
        : "Search volumes are already up to date.",
  };
}

/* ------------------------------ Competitors ------------------------------ */

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export async function addCompetitorAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  const domain = bareDomain(String(formData.get("domain") ?? ""));
  if (!DOMAIN_RE.test(domain)) return { error: "Enter a competitor website, for example rival.co.uk." };
  if (domain === ctx.client.domain) return { error: "That is the client's own website." };

  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(competitors)
    .where(eq(competitors.clientId, ctx.client.id));
  if ((count?.n ?? 0) >= 7) return { error: "You can track up to 7 competitors per client." };

  const label = String(formData.get("label") ?? "").trim().slice(0, 80) || domain;
  const inserted = await db
    .insert(competitors)
    .values({ clientId: ctx.client.id, domain, label })
    .onConflictDoNothing()
    .returning({ id: competitors.id });
  if (inserted.length === 0) return { error: `${domain} is already tracked.` };

  revalidateRankings(ctx.client.id);
  return {
    ok: true,
    message: `Now tracking ${domain}. Their positions are recorded from the next rank check, at no extra cost.`,
  };
}

export async function removeCompetitorAction(clientId: string, competitorId: string): Promise<void> {
  const ctx = await requireClientStaff(clientId);
  await db
    .delete(competitors)
    .where(and(eq(competitors.clientId, ctx.client.id), eq(competitors.id, competitorId)));
  revalidateRankings(ctx.client.id);
}

/** Removes one keyword (and its history) from the keyword page, then returns to the list. */
export async function deleteKeywordAndReturnAction(clientId: string, keywordId: string): Promise<void> {
  const ctx = await requireClientStaff(clientId);
  await db
    .delete(keywords)
    .where(and(eq(keywords.clientId, ctx.client.id), eq(keywords.id, keywordId)));
  revalidateRankings(ctx.client.id);
  redirect(`/c/${ctx.client.id}/rankings`);
}
