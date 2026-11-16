import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { Users } from "lucide-react";
import { db } from "@/db";
import { clientUsers, users } from "@/db/schema";
import {
  AccessLinkDialog,
  InviteClientUserDialog,
  RemoveClientUserButton,
} from "@/components/settings/people";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { requireClientStaff } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Client logins" };

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function ClientUsersPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { client } = await requireClientStaff(clientId);

  const people = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      hasPassword: users.passwordHash,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
    })
    .from(clientUsers)
    .innerJoin(users, eq(users.id, clientUsers.userId))
    .where(eq(clientUsers.clientId, client.id))
    .orderBy(asc(users.name));

  return (
    <Card>
      <CardHeader
        title="Client logins"
        description={`People at ${client.name} who can sign in. They see this client's reports and nothing else.`}
        action={<InviteClientUserDialog clientId={client.id} clientName={client.name} />}
      />
      {people.length === 0 ? (
        <EmptyState icon={<Users className="h-5 w-5" />} title="No one has been invited yet">
          Invite your contact at {client.name} so they can open their dashboard whenever they like.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs text-muted">
                <th className="px-5 py-2.5 font-medium">Person</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Last signed in</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3">
                    <span className="block font-medium text-ink">{p.name}</span>
                    <span className="block text-xs text-muted">{p.email}</span>
                  </td>
                  <td className="px-3 py-3">
                    {!p.isActive ? (
                      <Badge tone="down">Deactivated</Badge>
                    ) : p.hasPassword ? (
                      <Badge tone="up">Active</Badge>
                    ) : (
                      <Badge tone="warn">Invite pending</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {p.lastLoginAt ? DATE.format(p.lastLoginAt) : "Never"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <AccessLinkDialog
                        kind="client"
                        clientId={client.id}
                        userId={p.id}
                        hasPassword={Boolean(p.hasPassword)}
                        name={p.name}
                      />
                      <RemoveClientUserButton clientId={client.id} userId={p.id} name={p.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
