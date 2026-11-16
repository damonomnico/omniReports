/** Shown while a client section is fetching its data. */
export default function Loading() {
  return (
    <div className="flex items-center gap-3 py-24 text-sm text-muted" role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-800" aria-hidden="true" />
      Loading the latest figures...
    </div>
  );
}
