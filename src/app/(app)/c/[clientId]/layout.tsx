import { Archive, FlaskConical } from "lucide-react";
import { requireClientAccess } from "@/lib/auth/guards";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { client } = await requireClientAccess(clientId);

  return (
    <>
      {client.isDemo ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warn/20 bg-warn-bg px-4 py-3 text-sm text-warn">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong className="font-semibold">Demo client.</strong> Everything shown here is
            generated sample data so you can explore omniReports. It is not real performance data.
          </p>
        </div>
      ) : null}
      {client.status === "archived" ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm text-muted">
          <Archive className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            This client is archived. Rank checks and scheduled reports are paused and the client
            cannot sign in to see it. Restore it from Client settings.
          </p>
        </div>
      ) : null}
      {children}
    </>
  );
}
