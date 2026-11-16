import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/forms";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
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
