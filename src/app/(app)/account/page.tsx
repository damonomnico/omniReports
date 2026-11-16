import type { Metadata } from "next";
import { AccountNameForm, ChangePasswordForm } from "@/components/settings/account-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Your account" />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile" />
          <div className="px-5 pb-5">
            <AccountNameForm name={user.name} email={user.email} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Password"
            description="Changing your password signs you out on every other device."
          />
          <div className="px-5 pb-5">
            <ChangePasswordForm email={user.email} />
          </div>
        </Card>
      </div>
    </>
  );
}
