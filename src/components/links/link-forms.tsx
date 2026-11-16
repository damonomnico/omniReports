"use client";

import { useTransition } from "react";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { deleteLinkAction, importLinksAction, saveLinkAction } from "@/lib/actions/links";
import { ActionForm } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { LINK_RELS, LINK_STATUSES, LINK_TYPES, type LinkForStaff } from "@/lib/links/types";

function LinkFields({ link, today, website }: { link?: LinkForStaff; today: string; website: string }) {
  return (
    <>
      <Field label="Linking page" htmlFor="sourceUrl" hint="The page on the other website where the link appears.">
        <Input
          id="sourceUrl"
          name="sourceUrl"
          defaultValue={link?.sourceUrl}
          placeholder="https://example-blog.co.uk/article/"
          required
          inputMode="url"
        />
      </Field>
      <Field label="Client page it links to" htmlFor="targetUrl" hint="Leave blank for the homepage.">
        <Input id="targetUrl" name="targetUrl" defaultValue={link?.targetUrl} placeholder={website} inputMode="url" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Anchor text" htmlFor="anchorText">
          <Input id="anchorText" name="anchorText" defaultValue={link?.anchorText} maxLength={300} />
        </Field>
        <Field label="Date live" htmlFor="builtOn">
          <Input id="builtOn" name="builtOn" type="date" defaultValue={link?.builtOn ?? today} max={today} required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Type" htmlFor="linkType" className="sm:col-span-2">
          <Select id="linkType" name="linkType" defaultValue={link?.linkType ?? "guest_post"}>
            {LINK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Attribute" htmlFor="rel">
          <Select id="rel" name="rel" defaultValue={link?.rel ?? "dofollow"}>
            {LINK_RELS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={link?.status ?? "live"}>
            {LINK_STATUSES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Domain rating (0 to 100)" htmlFor="domainRating" hint="Optional. From Ahrefs or similar.">
        <Input
          id="domainRating"
          name="domainRating"
          type="number"
          min={0}
          max={100}
          defaultValue={link?.domainRating ?? ""}
          className="max-w-32"
        />
      </Field>
      <Field label="Note for the client" htmlFor="clientNote" hint="Optional. Shown to the client next to this link.">
        <Input id="clientNote" name="clientNote" defaultValue={link?.clientNote} maxLength={500} />
      </Field>

      <div className="rounded-lg border border-dashed border-line-strong bg-paper p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
          omniSEO only, never shown to the client
        </p>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field label="Cost (£)" htmlFor="cost">
            <Input id="cost" name="cost" type="number" min={0} step="0.01" defaultValue={link?.cost ?? ""} />
          </Field>
          <Field label="Internal note" htmlFor="internalNote">
            <Input id="internalNote" name="internalNote" defaultValue={link?.internalNote} maxLength={1000} />
          </Field>
        </div>
      </div>
    </>
  );
}

export function AddLinkDialog({ clientId, today, website }: { clientId: string; today: string; website: string }) {
  return (
    <Dialog
      trigger={
        <>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add link
        </>
      }
      title="Record a link we built"
      wide
    >
      <ActionForm
        action={saveLinkAction.bind(null, clientId, null)}
        submitLabel="Add link"
        pendingLabel="Adding..."
      >
        <LinkFields today={today} website={website} />
      </ActionForm>
    </Dialog>
  );
}

export function EditLinkDialog({
  clientId,
  link,
  today,
  website,
}: {
  clientId: string;
  link: LinkForStaff;
  today: string;
  website: string;
}) {
  return (
    <Dialog
      trigger={
        <>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Edit link from {link.sourceDomain}</span>
        </>
      }
      triggerClassName="rounded-md p-1.5 text-subtle hover:bg-brand-50 hover:text-ink"
      title="Edit link"
      wide
    >
      <ActionForm action={saveLinkAction.bind(null, clientId, link.id)}>
        <LinkFields link={link} today={today} website={website} />
      </ActionForm>
    </Dialog>
  );
}

export function DeleteLinkButton({ clientId, linkId, domain }: { clientId: string; linkId: string; domain: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(`Delete the link from ${domain}?`)) {
          start(() => deleteLinkAction(clientId, linkId));
        }
      }}
      className="rounded-md p-1.5 text-subtle hover:bg-down-bg hover:text-down disabled:opacity-50"
      aria-label={`Delete link from ${domain}`}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

export function ImportLinksDialog({ clientId }: { clientId: string }) {
  return (
    <Dialog
      trigger={
        <>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Import
        </>
      }
      triggerVariant="secondary"
      title="Import links from a spreadsheet"
      description="Copy the rows from your sheet, including the heading row, and paste them below."
      wide
    >
      <ActionForm
        action={importLinksAction.bind(null, clientId)}
        submitLabel="Import links"
        pendingLabel="Importing..."
        closeOnSuccess={false}
        resetOnSuccess
      >
        <Field
          label="Spreadsheet rows"
          htmlFor="csv"
          hint={
            <>
              Needs a <strong>Source URL</strong> column. These are picked up when present: Date, Target
              URL, Anchor text, Type, DR, Status, Follow, Cost, Notes. Dates can be 31/10/2026 or
              2026-10-31. Links already recorded are skipped.
            </>
          }
        >
          <Textarea
            id="csv"
            name="csv"
            rows={10}
            required
            className="font-mono text-xs"
            placeholder={"Date\tSource URL\tTarget URL\tAnchor text\tType\tDR\n31/10/2026\thttps://example-blog.co.uk/post/\thttps://client.co.uk/\tplumber cardiff\tGuest post\t45"}
          />
        </Field>
      </ActionForm>
    </Dialog>
  );
}
