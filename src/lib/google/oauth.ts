import "server-only";
import { appUrl } from "@/lib/env";

/**
 * Google OAuth 2.0 (web server flow). One consent covers the three read-only
 * data sources. Tokens never leave the server and are stored encrypted.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/business.manage",
] as const;

export const SCOPE_FOR = {
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  gbp: "https://www.googleapis.com/auth/business.manage",
} as const;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    /** Google's error code, e.g. "invalid_grant" when access was revoked. */
    readonly code?: string,
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export function redirectUri(): string {
  return `${appUrl()}/api/google/oauth/callback`;
}

function credentials() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new GoogleAuthError("Google sign-in is not set up. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  return { id, secret };
}

export function buildAuthUrl(state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: credentials().id,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // offline + consent makes Google return a refresh token every time.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as
    | (TokenResponse & { error?: string; error_description?: string })
    | null;
  if (!res.ok || !json || json.error || !json.access_token) {
    throw new GoogleAuthError(
      json?.error_description ?? json?.error ?? `Google token request failed (${res.status})`,
      json?.error,
    );
  }
  return json;
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

export async function fetchUserInfo(accessToken: string): Promise<{ sub: string; email: string }> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as { sub?: string; email?: string } | null;
  if (!res.ok || !json?.sub || !json.email) {
    throw new GoogleAuthError("Could not read the Google account details.");
  }
  return { sub: json.sub, email: json.email };
}

/** Best effort: tells Google to forget the grant when a connection is removed. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* the connection is removed locally either way */
  }
}
