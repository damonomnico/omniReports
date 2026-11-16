import "server-only";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { fetchLocations } from "@/lib/dataforseo/client";
import { countryLocationCode, findCountry } from "@/lib/countries";
import { dataForSeoConfigured } from "@/lib/env";

export type LocationOption = { code: number; name: string; type: string };

/** The whole-country option, which always works without a location sync. */
export function countryOption(countryCode: string): LocationOption {
  const c = findCountry(countryCode);
  return { code: countryLocationCode(c.code), name: c.name, type: "Country" };
}

/** Downloads a country's location list from DataForSEO (free) into our table. */
export async function syncLocations(countryCode: string): Promise<number> {
  if (!dataForSeoConfigured()) return 0;
  const rows = await fetchLocations(countryCode);
  if (rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += 1000) {
    await db
      .insert(locations)
      .values(
        rows.slice(i, i + 1000).map((r) => ({
          code: r.location_code,
          name: r.location_name,
          type: r.location_type,
          countryIso: r.country_iso_code,
          parentCode: r.location_code_parent,
        })),
      )
      .onConflictDoUpdate({
        target: locations.code,
        set: { name: sql`excluded.name`, type: sql`excluded.type` },
      });
  }
  return rows.length;
}

export async function hasLocations(countryCode: string): Promise<boolean> {
  const [row] = await db
    .select({ code: locations.code })
    .from(locations)
    .where(eq(locations.countryIso, countryCode.toUpperCase()))
    .limit(1);
  return Boolean(row);
}

/**
 * Towns, cities, counties and regions matching the search text. Syncs the
 * country's list on first use. Returns `synced: false` when the list could not
 * be loaded, in which case only the whole-country option is available.
 */
export async function searchLocations(
  countryCode: string,
  query: string,
): Promise<{ options: LocationOption[]; synced: boolean; error?: string }> {
  const iso = countryCode.toUpperCase();
  let synced = await hasLocations(iso);
  let error: string | undefined;
  if (!synced) {
    try {
      synced = (await syncLocations(iso)) > 0;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  if (!synced) return { options: [countryOption(iso)], synced: false, error };

  const q = query.trim().slice(0, 60);
  const rows = await db
    .select({ code: locations.code, name: locations.name, type: locations.type })
    .from(locations)
    .where(and(eq(locations.countryIso, iso), q ? ilike(locations.name, `${q}%`) : undefined))
    .orderBy(
      // Countries and big areas first, then alphabetical.
      sql`case ${locations.type}
            when 'Country' then 0 when 'Region' then 1 when 'County' then 2
            when 'City' then 3 else 4 end`,
      asc(locations.name),
    )
    .limit(25);
  return { options: rows, synced: true };
}
