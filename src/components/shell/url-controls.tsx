"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";

function useParamSetter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const set = (param: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(param);
    else next.set(param, value);
    const qs = next.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { set, pending };
}

/** Segmented control that writes its choice to a URL parameter. */
export function UrlSegments({
  param,
  value,
  options,
  label,
}: {
  param: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
}) {
  const { set, pending } = useParamSetter();
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex rounded-lg border border-line-strong bg-surface p-0.5 text-[13px]", pending && "opacity-70")}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => set(param, o.value)}
          className={cn(
            "rounded-md px-2.5 py-1.5 font-medium",
            value === o.value ? "bg-brand-800 text-white" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Dropdown that writes its choice to a URL parameter. */
export function UrlSelect({
  param,
  value,
  options,
  label,
}: {
  param: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
}) {
  const { set, pending } = useParamSetter();
  return (
    <select
      aria-label={label}
      value={value}
      disabled={pending}
      onChange={(e) => set(param, e.target.value)}
      className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-ink"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
