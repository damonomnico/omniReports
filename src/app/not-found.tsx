import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <Logo tone="light" />
      <h1 className="mt-10 font-display text-3xl font-semibold text-ink">Page not found</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        This page does not exist, or your login does not have access to it. If you followed a link from
        omniSEO and expected to see a report, let us know and we will put it right.
      </p>
      <Link href="/" className={buttonClass("primary", "md", "mt-8")}>
        Back to your reports
      </Link>
    </main>
  );
}
