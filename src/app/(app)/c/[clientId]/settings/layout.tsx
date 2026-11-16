import { PageHeader } from "@/components/shell/page-header";
import { Tabs } from "@/components/shell/tabs";
import { requireClientStaff } from "@/lib/auth/guards";

export default async function ClientSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { client } = await requireClientStaff(clientId);
  const base = `/c/${client.id}/settings`;

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Client settings"
        description="Only the omniSEO team can see these pages."
      />
      <Tabs
        tabs={[
          { href: base, label: "General", exact: true },
          { href: `${base}/integrations`, label: "Google connections" },
          { href: `${base}/users`, label: "Client logins" },
          { href: `${base}/reports`, label: "Scheduled reports" },
          { href: `${base}/import`, label: "Import history" },
        ]}
      />
      {children}
    </>
  );
}
