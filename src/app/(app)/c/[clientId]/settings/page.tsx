import type { Metadata } from "next";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { keywords } from "@/db/schema";
import { ClientGeneralForm, DeleteClientDialog } from "@/components/settings/client-general-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { setClientStatusAction } from "@/lib/actions/clients";
import { requireClientStaff } from "@/lib/auth/guards";
import { PRICE_PER_PAGE_STANDARD } from "@/lib/dataforseo/pricing";

export const metadata: Metadata = { title: "Client settings" };

export default async function ClientSettingsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { client, user } = await requireClientStaff(clientId);

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      maps: sql<number>`count(*) filter (where ${keywords.trackMaps})::int`,
    })
    .from(keywords)
    .where(and(eq(keywords.clientId, client.id), eq(keywords.isActive, true)));

  const archived = client.status === "archived";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Client details" />
        <div className="px-5 pb-5">
          <ClientGeneralForm
            client={{
              id: client.id,
              name: client.name,
              websiteUrl: client.websiteUrl,
              businessName: client.businessName,
              timezone: client.timezone,
              countryCode: client.countryCode,
              rankFrequency: client.rankFrequency,
              rankDepth: client.rankDepth,
              rankWeekday: client.rankWeekday,
            }}
            keywordCount={counts?.total ?? 0}
            mapsKeywordCount={counts?.maps ?? 0}
            pricePerPage={PRICE_PER_PAGE_STANDARD}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={archived ? "Restore this client" : "Archive this client"}
          description={
            archived
              ? "Restoring resumes rank checks and scheduled reports and lets the client sign in again."
              : "Archiving pauses rank checks and scheduled reports and hides the client from its own logins. Nothing is deleted."
          }
        />
        <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
          <form action={setClientStatusAction.bind(null, client.id, archived ? "active" : "archived")}>
            <Button type="submit" variant="secondary">
              {archived ? "Restore client" : "Archive client"}
            </Button>
          </form>
          {user.role === "admin" ? (
            <DeleteClientDialog clientId={client.id} clientName={client.name} />
          ) : null}
        </div>
      </Card>
    </div>
  );
}
