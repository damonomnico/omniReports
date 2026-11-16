import "server-only";

/** Public base URL of the app with no trailing slash. */
export function appUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function appSecret(): Buffer {
  const hex = process.env.APP_SECRET ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "APP_SECRET must be 64 hex characters. Generate one with: openssl rand -hex 32",
    );
  }
  return Buffer.from(hex, "hex");
}

export function appSecretConfigured(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(process.env.APP_SECRET ?? "");
}

export function cronSecret(): string | null {
  const s = process.env.CRON_SECRET;
  return s && s.length >= 16 ? s : null;
}

export const isProduction = process.env.NODE_ENV === "production";

export function dataForSeoConfigured(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
