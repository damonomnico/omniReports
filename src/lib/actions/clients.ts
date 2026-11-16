"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireAdmin, requireClientStaff, requireStaff } from "@/lib/auth/guards";
import {
  COUNTRIES,
  countryLocationCode,
  findCountry,
  isValidTimezone,
} from "@/lib/countries";
import { bareDomain } from "@/lib/format";
import type { ActionState } from "./types";

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function normaliseWebsite(input: string): { domain: string; websiteUrl: string } | null {
  const domain = bareDomain(input);
  if (!DOMAIN_RE.test(domain)) return null;
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return { domain, websiteUrl: `${url.protocol}//${url.host}/` };
  } catch {
    return null;
  }
}

const baseFields = {
  name: z.string().trim().min(2, "Enter the client's name.").max(120),
  website: z.string().trim().min(4, "Enter the client's website.").max(300),
  businessName: z.string().trim().max(160).optional(),
  timezone: z.string().refine(isValidTimezone, "Choose a valid timezone."),
  countryCode: z.enum(COUNTRIES.map((c) => c.code) as [string, ...string[]]),
};

const createSchema = z.object(baseFields);

export async function createClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    website: formData.get("website"),
    businessName: formData.get("businessName") || undefined,
    timezone: formData.get("timezone"),
    countryCode: formData.get("countryCode"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const site = normaliseWebsite(parsed.data.website);
  if (!site) return { error: "That website address does not look right. Try example.co.uk." };

  const existing = await db.select({ id: clients.id }).from(clients).where(eq(clients.domain, site.domain));
  if (existing.length > 0) {
    return { error: `A client with the website ${site.domain} already exists.` };
  }

  const country = findCountry(parsed.data.countryCode);
  const [created] = await db
    .insert(clients)
    .values({
      name: parsed.data.name,
      domain: site.domain,
      websiteUrl: site.websiteUrl,
      businessName: parsed.data.businessName || parsed.data.name,
      timezone: parsed.data.timezone,
      countryCode: country.code,
      defaultLocationCode: countryLocationCode(country.code),
      defaultLocationName: country.name,
      defaultLanguageCode: country.language,
    })
    .returning({ id: clients.id });

  revalidatePath("/clients");
  redirect(`/c/${created!.id}/settings`);
}

const updateSchema = z.object({
  ...baseFields,
  rankFrequency: z.enum(["daily", "weekly", "monthly", "manual"]),
  rankDepth: z.coerce.number().int().min(10).max(100),
  rankWeekday: z.coerce.number().int().min(1).max(7),
});

export async function updateClientAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireClientStaff(clientId);
  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    website: formData.get("website"),
    businessName: formData.get("businessName") || undefined,
    timezone: formData.get("timezone"),
    countryCode: formData.get("countryCode"),
    rankFrequency: formData.get("rankFrequency"),
    rankDepth: formData.get("rankDepth"),
    rankWeekday: formData.get("rankWeekday") ?? 1,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const site = normaliseWebsite(parsed.data.website);
  if (!site) return { error: "That website address does not look right. Try example.co.uk." };

  const country = findCountry(parsed.data.countryCode);
  const countryChanged = country.code !== ctx.client.countryCode;

  await db
    .update(clients)
    .set({
      name: parsed.data.name,
      domain: site.domain,
      websiteUrl: site.websiteUrl,
      businessName: parsed.data.businessName || null,
      timezone: parsed.data.timezone,
      countryCode: country.code,
      rankFrequency: parsed.data.rankFrequency,
      // Depth is billed per page of ten results, so keep it a multiple of ten.
      rankDepth: Math.ceil(parsed.data.rankDepth / 10) * 10,
      rankWeekday: parsed.data.rankWeekday,
      ...(countryChanged
        ? {
            defaultLocationCode: countryLocationCode(country.code),
            defaultLocationName: country.name,
            defaultLanguageCode: country.language,
          }
        : {}),
    })
    .where(eq(clients.id, ctx.client.id));

  revalidatePath(`/c/${ctx.client.id}`, "layout");
  revalidatePath("/clients");
  return { ok: true, message: "Saved." };
}

export async function setClientStatusAction(
  clientId: string,
  status: "active" | "archived",
): Promise<void> {
  const ctx = await requireClientStaff(clientId);
  await db.update(clients).set({ status }).where(eq(clients.id, ctx.client.id));
  revalidatePath("/clients");
  revalidatePath(`/c/${ctx.client.id}`, "layout");
}

/** Permanently removes a client and all of its data. Admins only. */
export async function deleteClientAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const ctx = await requireClientStaff(clientId);
  const typed = String(formData.get("confirm") ?? "").trim();
  if (typed !== ctx.client.name) {
    return { error: "Type the client's name exactly to confirm." };
  }
  await db.delete(clients).where(eq(clients.id, ctx.client.id));
  revalidatePath("/clients");
  redirect("/clients");
}
