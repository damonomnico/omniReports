import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isStaff, resolveClientAccess } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/guards";
import { safeEqual, verifyPayload } from "@/lib/crypto";
import { saveConnection } from "@/lib/google/connections";
import { exchangeCode, fetchUserInfo, SCOPE_FOR } from "@/lib/google/oauth";
import type { OAuthState } from "../start/route";

export const dynamic = "force-dynamic";

const STATE_LIFETIME_MS = 15 * 60_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await requireUser();
  const jar = await cookies();
  const nonce = jar.get("or_oauth")?.value;
  jar.delete({ name: "or_oauth", path: "/api/google/oauth" });

  const state = verifyPayload<OAuthState>(url.searchParams.get("state") ?? "");
  const finish = (path: string, key: string, value: string): never =>
    redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`);

  // Anything wrong with the state means we cannot trust where to return to.
  if (
    !state ||
    !nonce ||
    !safeEqual(nonce, state.nonce) ||
    state.userId !== user.id ||
    Date.now() - state.issuedAt > STATE_LIFETIME_MS
  ) {
    return finish(isStaff(user) ? "/admin/google" : "/", "google_error", "expired");
  }
  const back = state.returnTo;

  // Re-check permission now, not just when the flow started.
  if (state.scope === "agency") {
    if (!isStaff(user)) return finish("/", "google_error", "not_allowed");
  } else if (!state.clientId || !(await resolveClientAccess(user, state.clientId))) {
    return finish("/", "google_error", "not_allowed");
  }

  if (url.searchParams.get("error")) {
    return finish(back, "google_error", url.searchParams.get("error") === "access_denied" ? "denied" : "failed");
  }
  const code = url.searchParams.get("code");
  if (!code) return finish(back, "google_error", "failed");

  // redirect() works by throwing, so decide the outcome first and redirect after.
  let outcome: { key: "connected" | "google_error"; value: string };
  try {
    const tokens = await exchangeCode(code);
    const granted = tokens.scope ?? "";
    const hasAnyData = Object.values(SCOPE_FOR).some((s) => granted.split(" ").includes(s));

    if (!tokens.refresh_token) {
      outcome = { key: "google_error", value: "no_refresh_token" };
    } else if (!hasAnyData) {
      outcome = { key: "google_error", value: "no_scopes" };
    } else {
      const profile = await fetchUserInfo(tokens.access_token);
      const connectionId = await saveConnection({
        scope: state.scope,
        clientId: state.scope === "client" ? state.clientId : null,
        googleEmail: profile.email,
        googleSub: profile.sub,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        expiresIn: tokens.expires_in,
        grantedScopes: granted,
        userId: user.id,
      });
      outcome = { key: "connected", value: connectionId };
    }
  } catch (err) {
    console.error("[google oauth] callback failed", err);
    outcome = { key: "google_error", value: "failed" };
  }
  return finish(back, outcome.key, outcome.value);
}
