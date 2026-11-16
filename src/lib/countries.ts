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
