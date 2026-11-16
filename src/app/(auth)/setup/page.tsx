import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SetupForm } from "@/components/auth/setup-form";
import { needsSetup } from "@/lib/auth/setup-state";

export const metadata: Metadata = { title: "Set up omniReports" };
export const dynamic = "force-dynamic";

/** First-run only: disappears as soon as the first admin exists. */
export default async function SetupPage() {
  if (!(await needsSetup())) notFound();
  return (
    <>
      <h2 className="font-display text-2xl font-semibold text-ink">Set up omniReports</h2>
      <p className="mt-1 mb-6 text-sm leading-relaxed text-muted">
        Create the first admin login. You will need the setup key, which is the CRON_SECRET value from
        your hosting settings.
      </p>
      <SetupForm />
    </>
  );
}
