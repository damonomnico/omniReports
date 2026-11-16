import type { Metadata } from "next";
import { IntegrationsPanel } from "@/components/google/integrations-panel";
import { requireClientStaff } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Google connections" };

export default async function ClientIntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ connected?: string; google_error?: string }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const ctx = await requireClientStaff(clientId);

  if (ctx.client.isDemo) {
    return (
      <p className="rounded-xl border border-line bg-surface px-5 py-4 text-sm text-muted">
        The demo client shows generated sample data for Search Console, Analytics and Business Profile, so
        there is nothing to connect here.
      </p>
    );
  }
  return (
    <IntegrationsPanel
      ctx={ctx}
      returnTo={`/c/${ctx.client.id}/settings/integrations`}
      notice={{ connected: sp.connected, error: sp.google_error }}
    />
  );
}
