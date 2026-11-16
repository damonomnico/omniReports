import type { Metadata } from "next";
import Link from "next/link";
import { SetPasswordForm } from "@/components/auth/forms";
import { peekUserToken } from "@/lib/auth/tokens";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await peekUserToken(token, "reset");

  if (!found) {
    return (
      <>
        <h2 className="font-display text-2xl font-semibold text-ink">This link no longer works</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          It has expired or was already used.{" "}
          You can request a new one below.
        </p>
        <p className="mt-6 text-sm">
          <Link href="/forgot-password" className="text-brand-600 hover:underline">
            Request a new link
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h2 className="font-display text-2xl font-semibold text-ink">Choose a new password</h2>
      <p className="mt-1 mb-6 text-sm text-muted">
        Set a new password for {found.email}.
      </p>
      <SetPasswordForm token={token} mode="reset" email={found.email} />
    </>
  );
}
