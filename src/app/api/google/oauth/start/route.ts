import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isStaff } from "@/lib/auth/access";
import { requireClientAccess, requireUser } from "@/lib/auth/guards";
import { randomToken, signPayload } from "@/lib/crypto";
import { googleConfigured, isProduction } from "@/lib/env";
import { buildAuthUrl } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export type OAuthState = {
  /** "agency" = an omniSEO account, "client" = connected for one client. */
  scope: "agency" | "client";
  clientId: string | null;
  userId: string;
  nonce: string;
  issuedAt: number;
  returnTo: string;
};

/** Only same-site paths are accepted, so the flow cannot be used as an open redirect. */
function safeReturnPath(raw: string | null, fallback: string): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")) return raw;
  return fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "agency" ? "agency" : "client";
  const user = await requireUser();

  let clientId: string | null = null;
  let fallback = "/admin/google";
  if (scope === "agency") {
    if (!isStaff(user)) notFound();
  } else {
    // Staff or one of the client's own users may connect an account for it.
    const ctx = await requireClientAccess(url.searchParams.get("clientId") ?? "");
    clientId = ctx.client.id;
    fallback = ctx.isStaff ? `/c/${clientId}/settings/integrations` : `/c/${clientId}/connect`;
  }
  const returnTo = safeReturnPath(url.searchParams.get("returnTo"), fallback);

  if (!googleConfigured()) redirect(`${returnTo}?google_error=not_configured`);

  const nonce = randomToken(24);
  const state: OAuthState = { scope, clientId, userId: user.id, nonce, issuedAt: Date.now(), returnTo };

  // The nonce ties the round trip to this browser, which stops a forged
  // callback from attaching someone else's Google account.
  (await cookies()).set("or_oauth", nonce, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api/google/oauth",
    maxAge: 15 * 60,
  });

  redirect(buildAuthUrl(signPayload(state)));
}
