import { AlertTriangle, BarChart3, CheckCircle2, MapPin, Search } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import type { ClientContext } from "@/lib/auth/guards";
import { googleConfigured } from "@/lib/env";
import { listUsableConnections } from "@/lib/google/connections";
import { getIntegrations, INTEGRATION_NAMES, type IntegrationType } from "@/lib/google/integrations";
import { SCOPE_FOR } from "@/lib/google/oauth";
import {
  DisconnectGoogleButton,
  PropertyPicker,
  RemoveIntegrationButton,
} from "./property-picker";

const SOURCES: { type: IntegrationType; icon: typeof Search; what: string }[] = [
  { type: "gsc", icon: Search, what: "Clicks, impressions and the searches that bring people to the website." },
  { type: "ga4", icon: BarChart3, what: "Visits, where visitors came from and what they did on the website." },
  { type: "gbp", icon: MapPin, what: "Views, calls, direction requests and reviews from Google Search and Maps." },
];

const ERRORS: Record<string, string> = {
  not_configured: "Google sign-in has not been set up on this server yet.",
  expired: "That took too long or was opened in a different browser. Please try connecting again.",
  denied: "Google access was not granted, so nothing was connected.",
  not_allowed: "You do not have permission to connect an account here.",
  no_refresh_token:
    "Google did not provide long-term access. Remove omniReports from your Google account's third-party access page, then connect again.",
  no_scopes: "No data permissions were ticked on Google's screen. Connect again and tick every box.",
  failed: "Google could not complete the connection. Please try again.",
};

/**
 * Shows which Google account and property feed each section of a client's
 * dashboard. Used by staff (client settings) and by the client's own users.
 */
export async function IntegrationsPanel({
  ctx,
  returnTo,
  notice,
}: {
  ctx: ClientContext;
  /** Where Google should send people back to after connecting. */
  returnTo: string;
  notice: { connected?: string; error?: string };
}) {
  const { client, isStaff } = ctx;
  const [connections, integrations] = await Promise.all([
    listUsableConnections(ctx),
    getIntegrations(ctx),
  ]);
  const configured = googleConfigured();
  const connectHref = `/api/google/oauth/start?scope=client&clientId=${client.id}&returnTo=${encodeURIComponent(returnTo)}`;
  const own = connections.filter((c) => c.scope === "client");

  return (
    <div className="space-y-5">
      {notice.connected ? (
        <p className="flex items-start gap-2.5 rounded-xl bg-up-bg px-4 py-3 text-sm text-up">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Google account connected. Now choose which property to use for each section below.
        </p>
      ) : null}
      {notice.error ? (
        <p className="flex items-start gap-2.5 rounded-xl bg-down-bg px-4 py-3 text-sm text-down">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {ERRORS[notice.error] ?? ERRORS.failed}
        </p>
      ) : null}
      {!configured && isStaff ? (
        <p className="flex items-start gap-2.5 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Google sign-in is not set up yet. Add <code>GOOGLE_CLIENT_ID</code> and{" "}
            <code>GOOGLE_CLIENT_SECRET</code> to the hosting environment (see the setup guide in the
            README), then redeploy.
          </span>
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Data sources"
          description={
            isStaff
              ? "Choose the Google property that belongs to this client for each section."
              : "Choose which of your Google properties to show in each section."
          }
        />
        <ul className="divide-y divide-line border-t border-line">
          {SOURCES.map(({ type, icon: Icon, what }) => {
            const active = integrations.find((i) => i.type === type);
            const broken = active && active.connectionStatus !== "active";
            const managedByAgency = active?.connectionScope === "agency";
            const pickerConnections = connections.map((c) => ({
              id: c.id,
              label: `${c.googleEmail}${c.scope === "agency" ? " (omniSEO account)" : " (client's account)"}`,
              usable: c.status === "active" && c.grantedScopes.includes(SCOPE_FOR[type]),
            }));
            return (
              <li key={type} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {INTEGRATION_NAMES[type]}
                    {active ? (
                      broken ? (
                        <Badge tone="down">Needs reconnecting</Badge>
                      ) : (
                        <Badge tone="up">Connected</Badge>
                      )
                    ) : (
                      <Badge>Not connected</Badge>
                    )}
                  </p>
                  {active ? (
                    <p className="mt-0.5 text-sm break-all text-muted">
                      {active.externalName}
                      <span className="text-subtle">
                        {" "}
                        via {isStaff || !managedByAgency ? active.googleEmail : "omniSEO"}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-muted">{what}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {connections.length > 0 && (isStaff || !managedByAgency) ? (
                    <PropertyPicker
                      clientId={client.id}
                      type={type}
                      sourceName={INTEGRATION_NAMES[type]}
                      connections={pickerConnections}
                      currentConnectionId={
                        active && connections.some((c) => c.id === active.connectionId)
                          ? active.connectionId
                          : null
                      }
                      currentExternalId={active?.externalId ?? null}
                    />
                  ) : null}
                  {active && (isStaff || !managedByAgency) ? (
                    <RemoveIntegrationButton
                      clientId={client.id}
                      type={type}
                      sourceName={INTEGRATION_NAMES[type]}
                    />
                  ) : null}
                  {active && managedByAgency && !isStaff ? (
                    <span className="text-xs text-muted">Managed by omniSEO</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {connections.length === 0 ? (
          <p className="border-t border-line px-5 py-3 text-sm text-muted">
            {isStaff
              ? "Connect a Google account first: an omniSEO account under Google accounts, or one just for this client below."
              : "Connect your Google account below to get started."}
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title={isStaff ? "Google accounts for this client" : "Your Google account"}
          description={
            isStaff
              ? "omniSEO accounts work for every client. An account connected here is used for this client only."
              : "omniReports only ever reads your figures. It never changes anything in your Google account, and you can disconnect at any time."
          }
          action={
            configured ? (
              <a href={connectHref} className={buttonClass("secondary", "sm")}>
                {own.length > 0 ? "Connect another account" : isStaff ? "Connect an account for this client" : "Connect Google account"}
              </a>
            ) : undefined
          }
        />
        {connections.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">No Google accounts are connected yet.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {connections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    <span className="break-all">{c.googleEmail}</span>
                    <Badge tone={c.scope === "agency" ? "brand" : "neutral"}>
                      {c.scope === "agency" ? "omniSEO account" : isStaff ? "This client only" : "Your account"}
                    </Badge>
                    {c.status !== "active" ? <Badge tone="down">Needs reconnecting</Badge> : null}
                  </p>
                  {c.lastError ? <p className="mt-0.5 text-xs text-down">{c.lastError}</p> : null}
                </div>
                {c.scope === "client" ? (
                  <DisconnectGoogleButton
                    connectionId={c.id}
                    clientId={client.id}
                    email={c.googleEmail}
                    warning="Any section using it will stop showing data."
                  />
                ) : (
                  <a href="/admin/google" className="text-[13px] font-medium text-brand-600 hover:underline">
                    Manage
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
