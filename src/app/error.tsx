"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui/button";

/** Shown when a page fails to render. The details are logged, not displayed. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        This page could not be loaded just now. Trying again usually fixes it. If it keeps happening,
        please let omniSEO know
        {error.digest ? (
          <>
            {" "}
            and quote reference <code className="rounded bg-paper px-1.5 py-0.5 text-xs">{error.digest}</code>
          </>
        ) : null}
        .
      </p>
      <button type="button" onClick={reset} className={buttonClass("primary", "md", "mt-8")}>
        Try again
      </button>
    </main>
  );
}
