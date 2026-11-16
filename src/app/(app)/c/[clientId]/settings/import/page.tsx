import type { Metadata } from "next";
import { RankImportForm } from "@/components/settings/import-form";
import { Card, CardHeader } from "@/components/ui/card";
import { requireClientStaff } from "@/lib/auth/guards";
import { todayInTz } from "@/lib/dates";

export const metadata: Metadata = { title: "Import history" };

export default async function ImportPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { client } = await requireClientStaff(clientId);

  if (client.isDemo) {
    return (
      <p className="rounded-xl border border-line bg-surface px-5 py-4 text-sm text-muted">
        The demo client uses generated data, so there is nothing to import.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Import ranking history"
          description="Bring a client's existing keywords and positions across from AgencyAnalytics or another tool, so their charts do not start from zero."
        />
        <div className="px-5 pb-5">
          <RankImportForm
            clientId={client.id}
            today={todayInTz(client.timezone)}
            locationName={client.defaultLocationName}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="What the file should look like" />
        <div className="grid gap-5 px-5 pb-5 text-sm text-muted md:grid-cols-3">
          <div>
            <h3 className="font-medium text-ink">One row per keyword per date</h3>
            <p className="mt-1 leading-relaxed">
              Columns named <strong>Keyword</strong>, <strong>Date</strong> and <strong>Position</strong>.
              Best for full history.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-ink">One column per date</h3>
            <p className="mt-1 leading-relaxed">
              A <strong>Keyword</strong> column, then a column for each date with the date as its heading.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-ink">Current positions only</h3>
            <p className="mt-1 leading-relaxed">
              <strong>Keyword</strong> and <strong>Position</strong> (or <strong>Google</strong>) with no
              dates. Set the date the positions were recorded on above.
            </p>
          </div>
          <p className="leading-relaxed md:col-span-3">
            Optional columns are picked up when present: <strong>URL</strong>, <strong>Search volume</strong>{" "}
            and <strong>Tags</strong>. Dates can be written as 31/10/2026, 2026-10-31 or 31 Oct 2026. Blank,
            a dash, or &gt;100 means not ranking. Importing the same file twice is safe, and positions
            omniReports checked itself are never overwritten.
          </p>
        </div>
      </Card>
    </div>
  );
}
