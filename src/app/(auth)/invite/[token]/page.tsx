import type { Metadata } from "next";
import Link from "next/link";
import { SetPasswordForm } from "@/components/auth/forms";
import { peekUserToken } from "@/lib/auth/tokens";

export const metadata: Metadata = { title: "Set up your account" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await peekUserToken(token, "invite");

  if (!found) {
    return (
      <>
        <h2 className="font-display text-2xl font-semibold text-ink">This link no longer works</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          It has expired or was already used.{" "}
          Ask your contact at omniSEO to send a fresh invite.
        </p>
        <p className="mt-6 text-sm">
          <Link href="/login" className="text-brand-600 hover:underline">
            Go to sign in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h2 className="font-display text-2xl font-semibold text-ink">Welcome to omniReports</h2>
      <p className="mt-1 mb-6 text-sm text-muted">
        Hi {found.name}. Choose a password for {found.email} to open your reports.
      </p>
      <SetPasswordForm token={token} mode="invite" email={found.email} />
    </>
  );
}
