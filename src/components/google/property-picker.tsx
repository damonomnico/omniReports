"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  disconnectAgencyGoogleAction,
  disconnectClientGoogleAction,
  loadPropertiesAction,
  removeIntegrationAction,
  setIntegrationAction,
  type PropertyOption,
} from "@/lib/actions/google";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Dialog, useDialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export type PickerConnection = { id: string; label: string; usable: boolean };

function PickerBody({
  clientId,
  type,
  sourceName,
  connections,
  currentConnectionId,
  currentExternalId,
}: {
  clientId: string;
  type: string;
  sourceName: string;
  connections: PickerConnection[];
  currentConnectionId: string | null;
  currentExternalId: string | null;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [connectionId, setConnectionId] = useState(
    currentConnectionId ?? connections.find((c) => c.usable)?.id ?? connections[0]?.id ?? "",
  );
  const [options, setOptions] = useState<PropertyOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(currentExternalId);
  const [filter, setFilter] = useState("");
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    loadPropertiesAction(clientId, connectionId, type).then((res) => {
      if (cancelled) return;
      setOptions(res.options);
      setError(res.error ?? null);
      // Preselect the obvious match when nothing is chosen yet.
      setSelected((prev) => prev ?? res.options.find((o) => o.suggested)?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, connectionId, type]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (options ?? []).filter(
      (o) => !q || o.name.toLowerCase().includes(q) || o.detail.toLowerCase().includes(q),
    );
  }, [options, filter]);

  function save() {
    if (!selected) return;
    startSaving(async () => {
      const res = await setIntegrationAction(clientId, type, connectionId, selected);
      if (res.error) {
        setError(res.error);
        return;
      }
      dialog?.close();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Google account" htmlFor={`conn-${type}`}>
        <Select id={`conn-${type}`} value={connectionId} onChange={(e) => {
            setSelected(null);
            setOptions(null);
            setError(null);
            setConnectionId(e.target.value);
          }}>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      {options === null && !error ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Asking Google what this account can see...
        </p>
      ) : null}

      {error ? <p className="rounded-lg bg-down-bg px-3 py-2 text-sm text-down">{error}</p> : null}

      {options && options.length === 0 && !error ? (
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
          This Google account cannot see any {sourceName} properties. Ask the owner to add it as a user,
          or pick a different account.
        </p>
      ) : null}

      {options && options.length > 0 ? (
        <>
          {options.length > 8 ? (
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Search ${options.length} properties`}
              aria-label="Search properties"
              className="h-9 w-full rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none"
            />
          ) : null}
          <ul className="max-h-72 space-y-1 overflow-y-auto" role="radiogroup" aria-label={`${sourceName} property`}>
            {shown.map((o) => (
              <li key={o.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                    selected === o.id ? "border-brand-600 bg-brand-50" : "border-line hover:bg-paper",
                  )}
                >
                  <input
                    type="radio"
                    name={`property-${type}`}
                    checked={selected === o.id}
                    onChange={() => setSelected(o.id)}
                    className="mt-1 h-4 w-4 accent-brand-800"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      <span className="break-all">{o.name}</span>
                      {o.suggested ? <Badge tone="lime">Likely match</Badge> : null}
                    </span>
                    <span className="block text-xs text-muted">{o.detail}</span>
                  </span>
                </label>
              </li>
            ))}
            {shown.length === 0 ? <li className="px-1 py-2 text-sm text-muted">Nothing matches.</li> : null}
          </ul>
        </>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={save} disabled={!selected || saving}>
          {saving ? "Saving..." : `Use this ${sourceName} property`}
        </Button>
      </div>
    </div>
  );
}

export function PropertyPicker(props: {
  clientId: string;
  type: string;
  sourceName: string;
  connections: PickerConnection[];
  currentConnectionId: string | null;
  currentExternalId: string | null;
}) {
  const connected = Boolean(props.currentExternalId);
  return (
    <Dialog
      trigger={connected ? "Change" : "Choose property"}
      triggerVariant={connected ? "secondary" : "primary"}
      triggerSize="sm"
      title={`${props.sourceName} for this client`}
      description="Pick the Google account, then the property that belongs to this client."
      wide
    >
      <PickerBody {...props} />
    </Dialog>
  );
}

export function RemoveIntegrationButton({ clientId, type, sourceName }: { clientId: string; type: string; sourceName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Stop showing ${sourceName} data for this client?`)) return;
        start(async () => {
          const res = await removeIntegrationAction(clientId, type);
          if (res.error) window.alert(res.error);
          router.refresh();
        });
      }}
    >
      {pending ? "Removing..." : "Remove"}
    </Button>
  );
}

export function DisconnectGoogleButton({
  connectionId,
  clientId,
  email,
  warning,
}: {
  connectionId: string;
  /** Set for an account connected for one client; omit for an omniSEO account. */
  clientId?: string;
  email: string;
  warning: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Disconnect ${email}? ${warning}`)) return;
        start(async () => {
          const res = clientId
            ? await disconnectClientGoogleAction(clientId, connectionId)
            : await disconnectAgencyGoogleAction(connectionId);
          if (res.error) window.alert(res.error);
          router.refresh();
        });
      }}
    >
      {pending ? "Disconnecting..." : "Disconnect"}
    </Button>
  );
}
