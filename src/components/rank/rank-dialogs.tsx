"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MapPin, Plus, RefreshCw, X } from "lucide-react";
import {
  addCompetitorAction,
  addKeywordsAction,
  checkRankingsNowAction,
  fetchSearchVolumesAction,
  refreshPendingAction,
  removeCompetitorAction,
  searchLocationsAction,
  updateKeywordAction,
} from "@/lib/actions/rank";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useServerForm } from "@/components/ui/use-server-form";
import { formatMoney } from "@/lib/format";

type Location = { code: number; name: string; type?: string };

/** Search-as-you-type picker for the town, city or region to check rankings from. */
export function LocationPicker({ clientId, initial }: { clientId: string; initial: Location }) {
  const [selected, setSelected] = useState<Location>(initial);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchLocationsAction(clientId, query);
        if (id !== requestId.current) return;
        setOptions(res.options);
        setNotice(
          res.synced
            ? null
            : "Town and city targeting becomes available once DataForSEO is connected. Using the whole country for now.",
        );
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query, open, clientId]);

  return (
    <div className="relative">
      <input type="hidden" name="locationCode" value={selected.code} />
      <input type="hidden" name="locationName" value={selected.name} />
      <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm">
        <MapPin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{selected.name}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[13px] font-medium text-brand-600 hover:underline"
        >
          {open ? "Done" : "Change"}
        </button>
      </div>
      {open ? (
        <div className="mt-2 rounded-lg border border-line">
          <div className="relative border-b border-line p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search towns, cities, counties..."
              aria-label="Search locations"
              className="h-9 w-full rounded-md border border-line-strong px-2.5 text-sm focus:border-brand-500 focus:outline-none"
            />
            {loading ? (
              <Loader2 className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 animate-spin text-subtle" />
            ) : null}
          </div>
          <ul className="max-h-44 overflow-y-auto py-1" role="listbox">
            {options.length === 0 && !loading ? (
              <li className="px-3 py-2 text-sm text-muted">No locations match.</li>
            ) : (
              options.map((o) => (
                <li key={o.code} role="option" aria-selected={o.code === selected.code}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(o);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-brand-50"
                  >
                    <span className="truncate text-ink">{o.name}</span>
                    {o.type ? <span className="shrink-0 text-xs text-subtle">{o.type}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
          {notice ? <p className="border-t border-line px-3 py-2 text-xs text-muted">{notice}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function AddKeywordsDialog({
  clientId,
  defaultLocation,
  languageCode,
  depth,
  pricePerPage,
}: {
  clientId: string;
  defaultLocation: Location;
  languageCode: string;
  depth: number;
  pricePerPage: number;
}) {
  const [text, setText] = useState("");
  const [devices, setDevices] = useState({ desktop: true, mobile: false });
  const [maps, setMaps] = useState(false);

  const count = new Set(
    text
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
  ).size;
  const deviceCount = Number(devices.desktop) + Number(devices.mobile);
  const perCheck = count * deviceCount * ((depth / 10) * pricePerPage + (maps ? pricePerPage : 0));

  return (
    <Dialog
      trigger={
        <>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add keywords
        </>
      }
      title="Add keywords to track"
      wide
    >
      <ActionForm
        action={addKeywordsAction.bind(null, clientId)}
        submitLabel={count > 0 ? `Add ${count * Math.max(deviceCount, 1)} to tracking` : "Add keywords"}
        pendingLabel="Adding..."
      >
        <input type="hidden" name="languageCode" value={languageCode} />
        <Field label="Keywords" htmlFor="keywords" hint="One per line. Paste as many as you like (up to 500).">
          <Textarea
            id="keywords"
            name="keywords"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={"emergency plumber cardiff\nboiler repair cardiff\nplumber near me"}
            required
          />
        </Field>

        <Field
          label="Search location"
          hint="Rankings are checked as if searching from this place. Use a town or city for local businesses."
        >
          <LocationPicker clientId={clientId} initial={defaultLocation} />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink">Devices</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {(["desktop", "mobile"] as const).map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-2 capitalize">
                <input
                  type="checkbox"
                  name={`device_${d}`}
                  checked={devices[d]}
                  onChange={(e) => setDevices((v) => ({ ...v, [d]: e.target.checked }))}
                  className="h-4 w-4 accent-brand-800"
                />
                {d}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Desktop and mobile results differ, so each is tracked and billed as its own keyword.
          </p>
        </fieldset>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="trackMaps"
            checked={maps}
            onChange={(e) => setMaps(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-800"
          />
          <span>
            Also track Google Maps position
            <span className="block text-xs text-muted">
              Local pack position is always recorded for free. This adds a separate Google Maps search
              per keyword, for businesses where Maps ranking matters.
            </span>
          </span>
        </label>

        <Field label="Tags" htmlFor="tags" hint="Optional. Comma separated, for grouping: services, brand, cardiff.">
          <Input id="tags" name="tags" placeholder="services, cardiff" />
        </Field>

        {count > 0 && deviceCount > 0 ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-[13px] text-brand-800">
            Each rank check of these keywords costs about{" "}
            <strong>{formatMoney(perCheck, "USD")}</strong> in DataForSEO credit at top {depth}.
          </p>
        ) : null}
      </ActionForm>
    </Dialog>
  );
}

export function CheckNowDialog({
  clientId,
  keywordCount,
  dueCount,
  costPerKeyword,
  disabledReason,
}: {
  clientId: string;
  keywordCount: number;
  /** Keywords with no check yet today. */
  dueCount: number;
  /** Priority-queue cost of checking one keyword. */
  costPerKeyword: number;
  disabledReason?: string;
}) {
  const { state, pending, formProps } = useServerForm(checkRankingsNowAction.bind(null, clientId));
  return (
    <Dialog
      trigger={
        <>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Check now
        </>
      }
      triggerVariant="secondary"
      title="Check rankings now"
      description="Uses the fast queue, so results arrive in a minute or two at double the usual price."
    >
      {disabledReason ? (
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">{disabledReason}</p>
      ) : (
        <form {...formProps} className="space-y-3">
          <SubmitButton
            name="mode"
            value="due"
            pending={pending}
            disabled={dueCount === 0}
            className="h-auto w-full flex-col items-start gap-0.5 px-4 py-3 text-left"
          >
            <span>Check keywords not yet checked today ({dueCount})</span>
            <span className="text-xs font-normal opacity-80">
              About {formatMoney(dueCount * costPerKeyword, "USD")}
            </span>
          </SubmitButton>
          <SubmitButton
            name="mode"
            value="all"
            variant="secondary"
            pending={pending}
            disabled={keywordCount === 0}
            className="h-auto w-full flex-col items-start gap-0.5 px-4 py-3 text-left"
          >
            <span>Re-check everything ({keywordCount})</span>
            <span className="text-xs font-normal text-muted">
              About {formatMoney(keywordCount * costPerKeyword, "USD")}. Replaces today&apos;s results.
            </span>
          </SubmitButton>
          <FormMessage state={state} />
        </form>
      )}
    </Dialog>
  );
}

/** Shows while checks are running and pulls results in as they finish. */
export function PendingChecks({ clientId, initialPending }: { clientId: string; initialPending: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(initialPending);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  useEffect(() => setPending(initialPending), [initialPending]);

  useEffect(() => {
    if (pending <= 0) return;
    const timer = setInterval(() => {
      startTransition(async () => {
        const res = await refreshPendingAction(clientId);
        setError(res.error ?? null);
        if (res.stored > 0 || res.pending !== pending) router.refresh();
        setPending(res.pending);
      });
    }, 20_000);
    return () => clearInterval(timer);
  }, [pending, clientId, router]);

  if (pending <= 0) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
      <Loader2 className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <strong className="font-semibold">
          {pending} rank check{pending === 1 ? "" : "s"} in progress.
        </strong>{" "}
        Results appear here automatically as they finish.
        {error ? <span className="block text-xs text-down">DataForSEO: {error}</span> : null}
      </p>
    </div>
  );
}

export function FetchVolumesButton({ clientId, missing }: { clientId: string; missing: number }) {
  const { state, pending, formProps } = useServerForm(fetchSearchVolumesAction.bind(null, clientId));
  if (missing === 0 && !state) return null;
  return (
    <form {...formProps} className="flex flex-wrap items-center gap-2 text-xs text-muted">
      {state?.error ? <span className="text-down">{state.error}</span> : null}
      {state?.message ? <span className="text-up">{state.message}</span> : null}
      {missing > 0 ? (
        <>
          <span>
            {missing} keyword{missing === 1 ? " has" : "s have"} no search volume yet.
          </span>
          <SubmitButton variant="ghost" size="sm" pending={pending} pendingLabel="Fetching...">
            Fetch now
          </SubmitButton>
        </>
      ) : null}
    </form>
  );
}

export function AddCompetitorForm({ clientId }: { clientId: string }) {
  return (
    <ActionForm
      action={addCompetitorAction.bind(null, clientId)}
      submitLabel="Add competitor"
      pendingLabel="Adding..."
      closeOnSuccess={false}
      resetOnSuccess
      className="grid items-end gap-3 space-y-0 sm:grid-cols-[1fr_1fr_auto]"
    >
      <Field label="Competitor website" htmlFor="domain">
        <Input id="domain" name="domain" placeholder="rival.co.uk" required />
      </Field>
      <Field label="Name (optional)" htmlFor="label">
        <Input id="label" name="label" placeholder="Rival Plumbing" maxLength={80} />
      </Field>
    </ActionForm>
  );
}

export function RemoveCompetitorButton({ clientId, competitorId, label }: { clientId: string; competitorId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(`Stop tracking ${label}? Their recorded positions will be deleted.`)) {
          start(() => removeCompetitorAction(clientId, competitorId));
        }
      }}
      className="rounded-md p-1 text-subtle hover:bg-down-bg hover:text-down disabled:opacity-50"
      aria-label={`Remove ${label}`}
      title={`Remove ${label}`}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

export function EditKeywordForm({
  clientId,
  keywordId,
  tags,
  trackMaps,
}: {
  clientId: string;
  keywordId: string;
  tags: string[];
  trackMaps: boolean;
}) {
  return (
    <ActionForm action={updateKeywordAction.bind(null, clientId, keywordId)} closeOnSuccess>
      <Field label="Tags" htmlFor="tags" hint="Comma separated.">
        <Input id="tags" name="tags" defaultValue={tags.join(", ")} />
      </Field>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <input type="checkbox" name="trackMaps" defaultChecked={trackMaps} className="h-4 w-4 accent-brand-800" />
        Also track Google Maps position
      </label>
    </ActionForm>
  );
}

export function DeleteKeywordButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Stop tracking this keyword? Its ranking history will be deleted.")) {
          start(() => onDelete());
        }
      }}
    >
      {pending ? "Removing..." : "Stop tracking"}
    </Button>
  );
}
