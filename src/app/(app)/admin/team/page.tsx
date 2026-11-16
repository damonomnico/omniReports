import type { Metadata } from "next";
import { asc, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AccessLinkDialog, InviteStaffDialog, StaffControls } from "@/components/settings/people";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Team" };

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function TeamPage() {
  const me = await requireStaff();
  const isAdmin = me.role === "admin";

  const team = await db
    .select()
    .from(users)
    .where(ne(users.role, "client"))
    .orderBy(asc(users.name));

  return (
    <>
      <PageHeader
        title="Team"
        description="omniSEO team members. Everyone here can see and manage every client."
        actions={isAdmin ? <InviteStaffDialog /> : undefined}
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">Person</th>
                <th className="px-3 py-3 font-medium">Role</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Last signed in</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {team.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3">
                    <span className="block font-medium text-ink">{p.name}</span>
                    <span className="block text-xs text-muted">{p.email}</span>
                  </td>
                  <td className="px-3 py-3 capitalize">{p.role}</td>
                  <td className="px-3 py-3">
                    {!p.isActive ? (
                      <Badge tone="down">Deactivated</Badge>
                    ) : p.passwordHash ? (
                      <Badge tone="up">Active</Badge>
                    ) : (
                      <Badge tone="warn">Invite pending</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {p.lastLoginAt ? DATE.format(p.lastLoginAt) : "Never"}
                  </td>
                  <td className="px-5 py-3">
                    {isAdmin ? (
                      <div className="flex items-center justify-end gap-1">
                        {p.id !== me.id ? (
                          <AccessLinkDialog
                            kind="staff"
                            userId={p.id}
                            hasPassword={Boolean(p.passwordHash)}
                            name={p.name}
                          />
                        ) : null}
                        <StaffControls
                          userId={p.id}
                          role={p.role as "admin" | "staff"}
                          isActive={p.isActive}
                          isSelf={p.id === me.id}
                        />
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {!isAdmin ? (
        <p className="mt-3 text-xs text-muted">Only admins can invite or change team members.</p>
      ) : null}
    </>
  );
}
