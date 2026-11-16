import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8", className)} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1e3a44" />
      <circle cx="29" cy="30" r="14" fill="none" stroke="#fff" strokeWidth="8" />
      <circle cx="50" cy="48" r="5.5" fill="#bfff36" />
    </svg>
  );
}

/** Wordmark. `tone` picks colours for dark or light backgrounds. */
export function Logo({
  tone = "dark",
  className,
}: {
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span
        className={cn(
          "font-display text-[1.15rem] font-bold leading-none tracking-tight",
          tone === "dark" ? "text-white" : "text-ink",
        )}
      >
        omni
        <span className={tone === "dark" ? "text-lime" : "text-brand-600"}>Reports</span>
      </span>
    </span>
  );
}
