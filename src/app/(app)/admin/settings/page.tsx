import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { db } from "@/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { requireStaff } from "@/lib/auth/guards";
import { getAccountStatus } from "@/lib/dataforseo/client";
import {
  appUrl,
  cronSecret,
  dataForSeoConfigured,
  emailConfigured,
  googleConfigured,
} from "@/lib/env";
import { formatInt, formatMoney } from "@/lib/format";
import { redirectUri } from "@/lib/google/oauth";
import { postbackUrl } from "@/lib/rank/dispatch";

export const metadata: Metadata = { title: "Settings" };

type Status = "ok" | "warn" | "off";

function Row({
  status,
  title,
  children,
}: {
  status: Status;
  title: string;
  children: React.ReactNode;
}) {
  const Icon = status === "ok" ? CheckCircle2 : status === "warn" ? AlertTriangle : CircleDashed;
  const tone = status === "ok" ? "text-up" : status === "warn" ? "text-warn" : "text-subtle";
  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium text-ink">
          {title}
          <span className="sr-only">
            : {status === "ok" ? "working" : status === "warn" ? "needs attention" : "not set up"}
          </span>
        </p>
        <div className="mt-0.5 text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

export default async function SettingsPage() {
  await requireStaff();

  const dfsOn = dataForSeoConfigured();
  const [dfs, usage] = await Promise.all([
    dfsOn ? getAccountStatus() : Promise.resolve(null),
    db.execute<{ keywords: number; checks_30d: number; cost_30d: string | null; pending: number; failed_3d: number }>(sql`
      select
        (select count(*)::int from keywords k join clients c on c.id = k.client_id
          where k.is_active and c.status = 'active' and not c.is_demo) as keywords,
        (select count(*)::int from rank_tasks where posted_at > now() - interval '30 days') as checks_30d,
        (select sum(cost)::text from rank_tasks where posted_at > now() - interval '30 days') as cost_30d,
        (select count(*)::int from rank_tasks where status = 'posted') as pending,
        (select count(*)::int from rank_tasks where status = 'failed' and completed_at > now() - interval '3 days') as failed_3d
    `),
  ]);
  const u = usage.rows[0];
  const webhook = postbackUrl("organic");
  const hasCron = cronSecret() !== null;

  return (
    <>
      <PageHeader
        title="Settings"
        description="What omniReports is connected to. Keys and secrets are set in the hosting environment, never here."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader title="System status" />
          <ul className="divide-y divide-line border-t border-line">
            <Row
              status={!dfsOn ? "off" : dfs?.ok ? ((dfs.balance ?? 0) < 5 ? "warn" : "ok") : "warn"}
              title="DataForSEO (rank tracking)"
            >
              {!dfsOn ? (
                <>
                  Not connected. Add <code>DATAFORSEO_LOGIN</code> and <code>DATAFORSEO_PASSWORD</code>.
                </>
              ) : dfs?.ok ? (
                <>
                  Connected{dfs.login ? ` as ${dfs.login}` : ""}. Balance:{" "}
                  <strong className="text-ink">
                    {dfs.balance === null ? "unknown" : formatMoney(dfs.balance, "USD")}
                  </strong>
                  .
                  {(dfs.balance ?? 0) < 5
                    ? " This is low: top up in the DataForSEO dashboard so checks keep running."
                    : ""}
                </>
              ) : (
                <>DataForSEO rejected the request: {dfs?.message}</>
              )}
            </Row>
            <Row status={googleConfigured() ? "ok" : "off"} title="Google sign-in (Search Console, Analytics, Business Profile)">
              {googleConfigured() ? (
                <>OAuth client configured. Connect accounts under Google accounts.</>
              ) : (
                <>
                  Not set up. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>.
                </>
              )}
            </Row>
            <Row status={emailConfigured() ? "ok" : "off"} title="Email (invites, password resets, scheduled reports)">
              {emailConfigured() ? (
                <>Sending through Resend as {process.env.EMAIL_FROM ?? "the default sender"}.</>
              ) : (
                <>
                  Not set up, so nothing is emailed. Invite links can still be copied by hand. Add{" "}
                  <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> to switch email on.
                </>
              )}
            </Row>
            <Row status={hasCron ? "ok" : "warn"} title="Scheduled jobs (daily rank checks and reports)">
              {hasCron ? (
                <>The cron secret is set. On Vercel the jobs in vercel.json run automatically.</>
              ) : (
                <>
                  <code>CRON_SECRET</code> is missing or shorter than 16 characters, so scheduled rank
                  checks and reports are refused.
                </>
              )}
            </Row>
            <Row status={webhook ? "ok" : "warn"} title="Rank check results webhook">
              {webhook ? (
                <>DataForSEO delivers results straight to this app as each check finishes.</>
              ) : (
                <>
                  This address ({appUrl()}) is not reachable from the internet over HTTPS, so results are
                  collected by polling instead. This is normal in local development.
                </>
              )}
            </Row>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Rank tracking usage" description="Across all real clients." />
          <dl className="grid gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Active keywords", formatInt(u?.keywords ?? 0)],
              ["Checks in the last 30 days", formatInt(u?.checks_30d ?? 0)],
              ["DataForSEO cost, last 30 days", formatMoney(Number(u?.cost_30d ?? 0), "USD")],
              ["Checks in progress / failed (3 days)", `${formatInt(u?.pending ?? 0)} / ${formatInt(u?.failed_3d ?? 0)}`],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface px-5 py-4">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-1 font-display text-xl font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Addresses to give other services"
            description="Copy these when setting up Google Cloud."
          />
          <div className="max-w-2xl space-y-4 px-5 pb-5">
            <CopyField value={appUrl()} label="App address (APP_URL)" />
            <CopyField value={redirectUri()} label="Google OAuth authorised redirect URI" />
          </div>
        </Card>
      </div>
    </>
  );
}
