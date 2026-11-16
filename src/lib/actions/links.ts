"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { links } from "@/db/schema";
import { requireClientStaff } from "@/lib/auth/guards";
import { parseCsv } from "@/lib/csv";
import { isIsoDate, todayInTz } from "@/lib/dates";
import { bareDomain } from "@/lib/format";
import { LINK_RELS, LINK_STATUSES, LINK_TYPES } from "@/lib/links/types";
import type { ActionState } from "./types";

function normaliseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const enumValues = <T extends readonly { value: string }[]>(items: T) =>
  items.map((i) => i.value) as [string, ...string[]];

const linkSchema = z.object({
  sourceUrl: z.string().trim().min(4, "Enter the page that links to the client.").max(2000),
  targetUrl: z.string().trim().max(2000).optional(),
  anchorText: z.string().trim().max(300).default(""),
  linkType: z.enum(enumValues(LINK_TYPES)),
  rel: z.enum(enumValues(LINK_RELS)),
  status: z.enum(enumValues(LINK_STATUSES)),
  builtOn: z.string().refine(isIsoDate, "Enter the date the link went live."),
  domainRating: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(100)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  cost: z
    .union([z.literal(""), z.coerce.number().min(0).max(1_000_000)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  clientNote: z.string().trim().max(500).default(""),
  internalNote: z.string().trim().max(1000).default(""),
});

function readLinkForm(formData: FormData) {
  return linkSchema.safeParse({
    sourceUrl: formData.get("sourceUrl"),
    targetUrl: formData.get("targetUrl") || undefined,
    anchorText: formData.get("anchorText") ?? "",
    linkType: formData.get("linkType"),
    rel: formData.get("rel"),
    status: formData.get("status"),
    builtOn: formData.get("builtOn"),
    domainRating: formData.get("domainRating") ?? "",
    cost: formData.get("cost") ?? "",
    clientNote: formData.get("clientNote") ?? "",
    internalNote: formData.get("internalNote") ?? "",
  });
}

export async function saveLinkAction(
  clientId: string,
  linkId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  const parsed = readLinkForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const sourceUrl = normaliseUrl(parsed.data.sourceUrl);
  if (!sourceUrl) return { error: "The linking page does not look like a web address." };
  const targetUrl = normaliseUrl(parsed.data.targetUrl || ctx.client.websiteUrl);
  if (!targetUrl) return { error: "The client page does not look like a web address." };

  const values = {
    sourceUrl,
    sourceDomain: bareDomain(sourceUrl),
    targetUrl,
    anchorText: parsed.data.anchorText,
    linkType: parsed.data.linkType,
    rel: parsed.data.rel,
    status: parsed.data.status as "live" | "pending" | "lost",
    builtOn: parsed.data.builtOn,
    domainRating: parsed.data.domainRating,
    cost: parsed.data.cost === null ? null : String(parsed.data.cost),
    clientNote: parsed.data.clientNote,
    internalNote: parsed.data.internalNote,
  };

  if (linkId) {
    const updated = await db
      .update(links)
      .set(values)
      .where(and(eq(links.clientId, ctx.client.id), eq(links.id, linkId)))
      .returning({ id: links.id });
    if (updated.length === 0) return { error: "That link was not found." };
  } else {
    await db
      .insert(links)
      .values({ ...values, clientId: ctx.client.id, createdByUserId: ctx.user.id });
  }
  revalidatePath(`/c/${ctx.client.id}`, "layout");
  return { ok: true, message: linkId ? "Saved." : "Link added." };
}

export async function deleteLinkAction(clientId: string, linkId: string): Promise<void> {
  const ctx = await requireClientStaff(clientId);
  await db.delete(links).where(and(eq(links.clientId, ctx.client.id), eq(links.id, linkId)));
  revalidatePath(`/c/${ctx.client.id}`, "layout");
}

/* ------------------------------- CSV import ------------------------------ */

const HEADER_ALIASES: Record<string, string[]> = {
  sourceUrl: ["source url", "source", "linking page", "linking url", "link url", "url", "live link", "live url", "link", "backlink", "referring page"],
  targetUrl: ["target url", "target", "target page", "destination", "destination url", "links to", "client url", "landing page"],
  anchorText: ["anchor text", "anchor", "link text"],
  builtOn: ["date", "built on", "date built", "live date", "date live", "published", "publish date", "date published", "month"],
  linkType: ["type", "link type", "category"],
  domainRating: ["dr", "domain rating", "da", "domain authority", "authority", "rating"],
  status: ["status", "state"],
  rel: ["rel", "follow", "follow type", "dofollow"],
  cost: ["cost", "price", "spend"],
  clientNote: ["note", "notes", "comment", "comments"],
};

function parseLooseDate(raw: string): string | null {
  const s: string = raw.trim();
  const alreadyIso: boolean = isIsoDate(s);
  if (alreadyIso) return s;
  // UK style: 31/10/2026, 31-10-26, 31.10.2026
  const uk = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (uk) {
    const year = uk[3]!.length === 2 ? `20${uk[3]}` : uk[3]!;
    const iso = `${year}-${uk[2]!.padStart(2, "0")}-${uk[1]!.padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : null;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

function matchType(raw: string): string {
  const s = raw.toLowerCase();
  if (/guest/.test(s)) return "guest_post";
  if (/niche|insert|edit/.test(s)) return "niche_edit";
  if (/pr\b|press|digital/.test(s)) return "digital_pr";
  if (/citation|director|listing/.test(s)) return "citation";
  if (/resource/.test(s)) return "resource";
  if (/social|profile/.test(s)) return "social";
  return LINK_TYPES.some((t) => t.value === s) ? s : "other";
}

/** Bulk-adds links from pasted spreadsheet rows (the first row must be headings). */
export async function importLinksAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  const text = String(formData.get("csv") ?? "");
  if (text.length > 2_000_000) return { error: "That is too much data in one go. Import it in parts." };

  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { error: "Paste the heading row and at least one link." };
  }
  const headers = rows[0]!.map((h) => h.toLowerCase().replace(/[_-]+/g, " ").trim());
  const column = (field: string) =>
    headers.findIndex((h) => HEADER_ALIASES[field]!.includes(h));
  const idx = Object.fromEntries(Object.keys(HEADER_ALIASES).map((f) => [f, column(f)]));
  if (idx.sourceUrl < 0) {
    return {
      error: `Could not find a column for the linking page. Name it "Source URL". Found: ${rows[0]!.join(", ").slice(0, 200)}`,
    };
  }

  const today = todayInTz(ctx.client.timezone);
  const values: (typeof links.$inferInsert)[] = [];
  const problems: string[] = [];
  const get = (row: string[], field: string) => (idx[field]! >= 0 ? (row[idx[field]!] ?? "") : "");

  rows.slice(1, 2001).forEach((row, i) => {
    const sourceUrl = normaliseUrl(get(row, "sourceUrl"));
    if (!sourceUrl) {
      if (problems.length < 5) problems.push(`Row ${i + 2}: no valid linking page`);
      return;
    }
    const dateRaw = get(row, "builtOn");
    const builtOn = dateRaw ? parseLooseDate(dateRaw) : today;
    if (!builtOn) {
      if (problems.length < 5) problems.push(`Row ${i + 2}: could not read the date "${dateRaw.slice(0, 20)}"`);
      return;
    }
    const dr = Number.parseInt(get(row, "domainRating"), 10);
    const cost = Number.parseFloat(get(row, "cost").replace(/[^0-9.]/g, ""));
    const statusRaw = get(row, "status").toLowerCase();
    const relRaw = get(row, "rel").toLowerCase();
    values.push({
      clientId: ctx.client.id,
      sourceUrl,
      sourceDomain: bareDomain(sourceUrl),
      targetUrl: normaliseUrl(get(row, "targetUrl")) ?? ctx.client.websiteUrl,
      anchorText: get(row, "anchorText").slice(0, 300),
      linkType: matchType(get(row, "linkType")),
      rel: /no\s*follow|^no$|false/.test(relRaw) ? "nofollow" : /sponsor/.test(relRaw) ? "sponsored" : "dofollow",
      status: /lost|removed|dead/.test(statusRaw) ? "lost" : /pend|await|progress/.test(statusRaw) ? "pending" : "live",
      builtOn,
      domainRating: Number.isFinite(dr) && dr >= 0 && dr <= 100 ? dr : null,
      cost: Number.isFinite(cost) ? String(cost) : null,
      clientNote: get(row, "clientNote").slice(0, 500),
      createdByUserId: ctx.user.id,
    });
  });

  if (values.length === 0) {
    return { error: `No links could be imported. ${problems.join(". ")}` };
  }

  // Skip rows that are already recorded (same linking page and client page).
  const existing = await db
    .select({ sourceUrl: links.sourceUrl, targetUrl: links.targetUrl })
    .from(links)
    .where(eq(links.clientId, ctx.client.id));
  const seen = new Set(existing.map((e) => `${e.sourceUrl}|${e.targetUrl}`));
  const fresh = values.filter((v) => {
    const key = `${v.sourceUrl}|${v.targetUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (let i = 0; i < fresh.length; i += 500) {
    await db.insert(links).values(fresh.slice(i, i + 500));
  }
  revalidatePath(`/c/${ctx.client.id}`, "layout");

  const duplicates = values.length - fresh.length;
  return {
    ok: true,
    message:
      `Imported ${fresh.length} link${fresh.length === 1 ? "" : "s"}.` +
      (duplicates > 0 ? ` Skipped ${duplicates} already recorded.` : "") +
      (problems.length > 0 ? ` Problems: ${problems.join("; ")}.` : ""),
  };
}
