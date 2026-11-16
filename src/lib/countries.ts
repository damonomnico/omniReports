/**
 * Countries offered when adding a client. `numeric` is the ISO 3166-1 numeric
 * code: Google (and DataForSEO) country location codes are 2000 + numeric.
 */
export const COUNTRIES = [
  { code: "GB", name: "United Kingdom", numeric: 826, language: "en", timezone: "Europe/London" },
  { code: "IE", name: "Ireland", numeric: 372, language: "en", timezone: "Europe/Dublin" },
  { code: "US", name: "United States", numeric: 840, language: "en", timezone: "America/New_York" },
  { code: "CA", name: "Canada", numeric: 124, language: "en", timezone: "America/Toronto" },
  { code: "AU", name: "Australia", numeric: 36, language: "en", timezone: "Australia/Sydney" },
  { code: "NZ", name: "New Zealand", numeric: 554, language: "en", timezone: "Pacific/Auckland" },
  { code: "ZA", name: "South Africa", numeric: 710, language: "en", timezone: "Africa/Johannesburg" },
  { code: "AE", name: "United Arab Emirates", numeric: 784, language: "en", timezone: "Asia/Dubai" },
  { code: "DE", name: "Germany", numeric: 276, language: "de", timezone: "Europe/Berlin" },
  { code: "FR", name: "France", numeric: 250, language: "fr", timezone: "Europe/Paris" },
  { code: "ES", name: "Spain", numeric: 724, language: "es", timezone: "Europe/Madrid" },
  { code: "IT", name: "Italy", numeric: 380, language: "it", timezone: "Europe/Rome" },
  { code: "NL", name: "Netherlands", numeric: 528, language: "nl", timezone: "Europe/Amsterdam" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

export function findCountry(code: string) {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

export function countryLocationCode(code: string): number {
  return 2000 + findCountry(code).numeric;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const COMMON_TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Africa/Johannesburg",
  "Asia/Dubai",
];

const ALPHA3_TO_2: Record<string, string> = {
  GBR: "GB", IRL: "IE", USA: "US", CAN: "CA", AUS: "AU", NZL: "NZ", ZAF: "ZA", ARE: "AE",
  DEU: "DE", FRA: "FR", ESP: "ES", ITA: "IT", NLD: "NL", BEL: "BE", PRT: "PT", POL: "PL",
  SWE: "SE", NOR: "NO", DNK: "DK", FIN: "FI", CHE: "CH", AUT: "AT", IND: "IN", PAK: "PK",
  BGD: "BD", PHL: "PH", SGP: "SG", MYS: "MY", HKG: "HK", JPN: "JP", CHN: "CN", KOR: "KR",
  BRA: "BR", MEX: "MX", ARG: "AR", NGA: "NG", KEN: "KE", EGY: "EG", TUR: "TR", ROU: "RO",
  GRC: "GR", CZE: "CZ", HUN: "HU", UKR: "UA", RUS: "RU", SAU: "SA", ISR: "IL", IDN: "ID",
  THA: "TH", VNM: "VN",
};

const REGION_NAMES = new Intl.DisplayNames(["en-GB"], { type: "region" });

/** Search Console reports countries as three-letter codes. */
export function countryNameFromAlpha3(code: string): string {
  const alpha2 = ALPHA3_TO_2[code.toUpperCase()];
  if (!alpha2) return code.toUpperCase();
  try {
    return REGION_NAMES.of(alpha2) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
