import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { IntegrationsPanel } from "@/components/google/integrations-panel";
import { PageHeader } from "@/components/shell/page-header";
import { requireClientAccess } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Connect Google" };

/** Where a client's own users connect their Google account. Staff use Client settings. */
export default async function ConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ connected?: string; google_error?: string }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const ctx = await requireClientAccess(clientId);
  if (ctx.isStaff) redirect(`/c/${ctx.client.id}/settings/integrations`);
  if (ctx.client.isDemo) redirect(`/c/${ctx.client.id}`);

  return (
    <>
      <PageHeader
        eyebrow={ctx.client.name}
        title="Connect your Google account"
        description="Link Search Console, Google Analytics and your Business Profile so their figures appear in your reports."
      />
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        <p>
          Google will ask you to confirm what omniReports may see. Access is read-only for Search Console
          and Analytics. Google only offers one level of access for Business Profile, which also allows
          edits, but omniReports only ever reads your figures and reviews. You can disconnect here at any
          time.
        </p>
      </div>
      <IntegrationsPanel
        ctx={ctx}
        returnTo={`/c/${ctx.client.id}/connect`}
        notice={{ connected: sp.connected, error: sp.google_error }}
      />
    </>
  );
}
