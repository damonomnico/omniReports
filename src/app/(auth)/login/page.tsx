import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/forms";
import { getCurrentUser } from "@/lib/auth/session";
import { needsSetup } from "@/lib/auth/setup-state";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  // A brand new installation has nobody to sign in as yet.
  if (await needsSetup()) redirect("/setup");
  return (
    <>
      <h2 className="font-display text-2xl font-semibold text-ink">Sign in</h2>
      <p className="mt-1 mb-6 text-sm text-muted">
        Welcome back. Sign in to see your reports.
      </p>
      <LoginForm />
    </>
  );
}
