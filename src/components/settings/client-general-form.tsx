"use client";

import { useState } from "react";
import { deleteClientAction, updateClientAction } from "@/lib/actions/clients";
import { ClientFormFields } from "@/components/clients/client-form-fields";
import { ActionForm } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { formatMoney } from "@/lib/format";

type Props = {
  client: {
    id: string;
    name: string;
    websiteUrl: string;
    businessName: string | null;
    timezone: string;
    countryCode: string;
    rankFrequency: "daily" | "weekly" | "monthly" | "manual";
    rankDepth: number;
    rankWeekday: number;
  };
  /** Active keyword rows (a keyword tracked on two devices counts twice). */
  keywordCount: number;
  mapsKeywordCount: number;
  /** Price in USD for one page of ten results on the standard queue. */
  pricePerPage: number;
};

const CHECKS_PER_MONTH = { daily: 30.4, weekly: 4.35, monthly: 1, manual: 0 } as const;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function ClientGeneralForm({ client, keywordCount, mapsKeywordCount, pricePerPage }: Props) {
  const [frequency, setFrequency] = useState(client.rankFrequency);
  const [depth, setDepth] = useState(client.rankDepth);

  const perCheck = keywordCount * (depth / 10) * pricePerPage + mapsKeywordCount * pricePerPage;
  const monthly = perCheck * CHECKS_PER_MONTH[frequency];

  return (
    <ActionForm
      action={updateClientAction.bind(null, client.id)}
      submitLabel="Save changes"
      closeOnSuccess={false}
      className="max-w-2xl"
    >
      <ClientFormFields
        defaults={{
          name: client.name,
          website: client.websiteUrl,
          businessName: client.businessName,
          timezone: client.timezone,
          countryCode: client.countryCode,
        }}
      />

      <div className="border-t border-line pt-5">
        <h3 className="font-display text-[15px] font-semibold">Rank tracking</h3>
        <p className="mt-0.5 text-[13px] text-muted">
          How often we check this client&apos;s keywords and how far down the results we look.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Check frequency" htmlFor="rankFrequency">
          <Select
            id="rankFrequency"
            name="rankFrequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Props["client"]["rankFrequency"])}
          >
            <option value="daily">Every day</option>
            <option value="weekly">Once a week</option>
            <option value="monthly">Once a month</option>
            <option value="manual">Only when run manually</option>
          </Select>
        </Field>
        <Field label="Weekly check day" htmlFor="rankWeekday">
          <Select
            id="rankWeekday"
            name="rankWeekday"
            defaultValue={client.rankWeekday}
            disabled={frequency !== "weekly"}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </Select>
          {frequency !== "weekly" ? (
            <input type="hidden" name="rankWeekday" value={client.rankWeekday} />
          ) : null}
        </Field>
        <Field label="Results depth" htmlFor="rankDepth">
          <Select
            id="rankDepth"
            name="rankDepth"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
          >
            {[10, 20, 30, 50, 100].map((d) => (
              <option key={d} value={d}>
                Top {d}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="rounded-lg bg-brand-50 px-4 py-3 text-[13px] leading-relaxed text-brand-800">
        {keywordCount === 0 ? (
          <>Add keywords on the Rankings page to see an estimated DataForSEO cost here.</>
        ) : frequency === "manual" ? (
          <>
            Each manual check of {keywordCount} keyword{keywordCount === 1 ? "" : "s"} costs about{" "}
            <strong>{formatMoney(perCheck, "USD")}</strong> in DataForSEO credit.
          </>
        ) : (
          <>
            Estimated DataForSEO cost: about <strong>{formatMoney(monthly, "USD")} a month</strong>{" "}
            for {keywordCount} keyword{keywordCount === 1 ? "" : "s"} at top {depth}. DataForSEO
            bills each ten results as one unit, so depth is the main cost lever.
          </>
        )}
      </div>
    </ActionForm>
  );
}

export function DeleteClientDialog({ clientId, clientName }: { clientId: string; clientName: string }) {
  return (
    <Dialog
      trigger="Delete client permanently"
      triggerVariant="danger"
      title={`Delete ${clientName}?`}
      description="This removes the client, its keywords, ranking history, links, connections and logins. It cannot be undone."
    >
      <ActionForm
        action={deleteClientAction.bind(null, clientId)}
        submitLabel="Delete permanently"
        pendingLabel="Deleting..."
        submitVariant="danger"
      >
        <Field label={`Type "${clientName}" to confirm`} htmlFor="confirm">
          <Input id="confirm" name="confirm" autoComplete="off" required />
        </Field>
      </ActionForm>
    </Dialog>
  );
}
