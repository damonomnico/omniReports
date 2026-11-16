import type { Metadata } from "next";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, KeyRound } from "lucide-react";
import { db } from "@/db";
import { googleConnections } from "@/db/schema";
import { DisconnectGoogleButton } from "@/components/google/property-picker";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { requireStaff } from "@/lib/auth/guards";
import { googleConfigured } from "@/lib/env";
import { redirectUri, SCOPE_FOR } from "@/lib/google/oauth";

export const metadata: Metadata = { title: "Google accounts" };

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

const ERRORS: Record<string, string> = {
  not_configured: "Google sign-in has not been set up on this server yet.",
  expired: "That took too long or was opened in a different browser. Please try again.",
  denied: "Google access was not granted, so nothing was connected.",
  no_refresh_token:
    "Google did not provide long-term access. Remove omniReports under the Google account's third-party access, then connect again.",
  no_scopes: "No data permissions were ticked on Google's screen. Connect again and tick every box.",
  failed: "Google could not complete the connection. Please try again.",
};

export default async function GoogleAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; google_error?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const configured = googleConfigured();

  const accounts = await db
    .select({
      connection: googleConnections,
      clients: sql<number>`(select count(distinct ci.client_id)::int from client_integrations ci where ci.connection_id = ${googleConnections.id})`,
    })
    .from(googleConnections)
    .where(and(eq(googleConnections.scope, "agency"), isNull(googleConnections.clientId)))
    .orderBy(asc(googleConnections.googleEmail));

  return (
    <>
      <PageHeader
        title="Google accounts"
        description="omniSEO Google accounts that already have access to client properties. Connect one once and use it for any client."
        actions={
          configured ? (
            <a href="/api/google/oauth/start?scope=agency" className={buttonClass("primary")}>
              Connect a Google account
            </a>
          ) : undefined
        }
      />

      {sp.connected ? (
        <p className="mb-5 flex items-start gap-2.5 rounded-xl bg-up-bg px-4 py-3 text-sm text-up">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Google account connected. Open a client&apos;s settings to choose its properties.
        </p>
      ) : null}
      {sp.google_error ? (
        <p className="mb-5 flex items-start gap-2.5 rounded-xl bg-down-bg px-4 py-3 text-sm text-down">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {ERRORS[sp.google_error] ?? ERRORS.failed}
        </p>
      ) : null}

      {!configured ? (
        <Card className="mb-5">
          <CardHeader
            title="Google sign-in is not set up yet"
            description="Create an OAuth client in Google Cloud, then add its ID and secret to the hosting environment as GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. The README has the full steps."
          />
          <div className="max-w-2xl px-5 pb-5">
            <CopyField value={redirectUri()} label="Authorised redirect URI to enter in Google Cloud" />
          </div>
        </Card>
      ) : null}

      <Card>
        {accounts.length === 0 ? (
          <EmptyState icon={<KeyRound className="h-5 w-5" />} title="No omniSEO Google accounts connected">
            Connect the Google account your team uses to access clients&apos; Search Console, Analytics and
            Business Profiles. You can connect more than one.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {accounts.map(({ connection: c, clients }) => {
              const scopes = c.grantedScopes.split(" ");
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      <span className="break-all">{c.googleEmail}</span>
                      {c.status === "active" ? (
                        <Badge tone="up">Connected</Badge>
                      ) : (
                        <Badge tone="down">Needs reconnecting</Badge>
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {(
                        [
                          ["gsc", "Search Console"],
                          ["ga4", "Analytics"],
                          ["gbp", "Business Profile"],
                        ] as const
                      ).map(([key, label]) =>
                        scopes.includes(SCOPE_FOR[key]) ? (
                          <Badge key={key} tone="brand">
                            {label}
                          </Badge>
                        ) : (
                          <Badge key={key} tone="warn">
                            {label} not granted
                          </Badge>
                        ),
                      )}
                      <span>
                        Used by {clients} client{clients === 1 ? "" : "s"} · connected{" "}
                        {DATE.format(c.createdAt)}
                      </span>
                    </p>
                    {c.lastError ? <p className="mt-1 text-xs text-down">{c.lastError}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <a href="/api/google/oauth/start?scope=agency" className={buttonClass("secondary", "sm")}>
                      Reconnect
                    </a>
                    <DisconnectGoogleButton
                      connectionId={c.id}
                      email={c.googleEmail}
                      warning={
                        clients > 0
                          ? `${clients} client${clients === 1 ? "" : "s"} will lose the data sources that use it.`
                          : "No clients are using it."
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
