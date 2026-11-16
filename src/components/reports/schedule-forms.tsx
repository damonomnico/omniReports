"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  deleteScheduleAction,
  saveScheduleAction,
  sendScheduleNowAction,
} from "@/lib/actions/reports";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useServerForm } from "@/components/ui/use-server-form";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type ScheduleValues = {
  id: string;
  frequency: "weekly" | "monthly";
  dayOfWeek: number;
  dayOfMonth: number;
  recipients: string[];
  sections: string[];
  isActive: boolean;
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function ScheduleFields({
  schedule,
  sections,
  suggestedRecipients,
}: {
  schedule?: ScheduleValues;
  sections: { key: string; label: string }[];
  suggestedRecipients: string[];
}) {
  const [frequency, setFrequency] = useState(schedule?.frequency ?? "monthly");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How often" htmlFor="frequency">
          <Select
            id="frequency"
            name="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly")}
          >
            <option value="monthly">Every month</option>
            <option value="weekly">Every week</option>
          </Select>
        </Field>
        {frequency === "monthly" ? (
          <Field label="Send on the" htmlFor="dayOfMonth">
            <Select id="dayOfMonth" name="dayOfMonth" defaultValue={schedule?.dayOfMonth ?? 3}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {ordinal(d)} of the month
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Send every" htmlFor="dayOfWeek">
            <Select id="dayOfWeek" name="dayOfWeek" defaultValue={schedule?.dayOfWeek ?? 1}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <p className="-mt-1 text-xs leading-relaxed text-muted">
        {frequency === "monthly"
          ? "Covers the previous calendar month, compared with the month before. Sending on the 3rd or later gives Google time to finalise its figures."
          : "Covers the seven days before the send date, compared with the week before."}
      </p>

      <Field
        label="Send to"
        htmlFor="recipients"
        hint="One email address per line, or separated by commas. Up to 10."
      >
        <Textarea
          id="recipients"
          name="recipients"
          rows={3}
          required
          defaultValue={(schedule?.recipients ?? suggestedRecipients).join("\n")}
        />
      </Field>

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink">Sections to include</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {sections.map((s) => (
            <label key={s.key} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`section_${s.key}`}
                defaultChecked={schedule ? schedule.sections.includes(s.key) : true}
                className="h-4 w-4 accent-brand-800"
              />
              {s.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Sections with nothing connected are left out automatically.</p>
      </fieldset>

      {schedule ? (
        <Field label="Status" htmlFor="isActive">
          <Select id="isActive" name="isActive" defaultValue={schedule.isActive ? "on" : "off"}>
            <option value="on">Sending</option>
            <option value="off">Paused</option>
          </Select>
        </Field>
      ) : null}
    </>
  );
}

export function ScheduleDialog({
  clientId,
  schedule,
  sections,
  suggestedRecipients,
}: {
  clientId: string;
  schedule?: ScheduleValues;
  sections: { key: string; label: string }[];
  suggestedRecipients: string[];
}) {
  return (
    <Dialog
      trigger={
        schedule ? (
          <>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Schedule a report
          </>
        )
      }
      triggerVariant={schedule ? "secondary" : "primary"}
      triggerSize={schedule ? "sm" : "md"}
      title={schedule ? "Edit scheduled report" : "Schedule a report"}
      description="The report is emailed as a PDF with a short summary."
      wide
    >
      <ActionForm
        action={saveScheduleAction.bind(null, clientId, schedule?.id ?? null)}
        submitLabel={schedule ? "Save changes" : "Schedule report"}
      >
        <ScheduleFields schedule={schedule} sections={sections} suggestedRecipients={suggestedRecipients} />
      </ActionForm>
    </Dialog>
  );
}

export function SendNowButtons({ clientId, scheduleId, recipientCount }: { clientId: string; scheduleId: string; recipientCount: number }) {
  const test = useServerForm(sendScheduleNowAction.bind(null, clientId, scheduleId, "test"));
  const live = useServerForm(sendScheduleNowAction.bind(null, clientId, scheduleId, "recipients"));
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        <form {...test.formProps}>
          <SubmitButton variant="ghost" size="sm" pending={test.pending} pendingLabel="Sending...">
            Send me a test
          </SubmitButton>
        </form>
        <form
          {...live.formProps}
          onSubmit={(e) => {
            if (
              !window.confirm(
                `Send the latest report to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"} now?`,
              )
            ) {
              e.preventDefault();
              return;
            }
            live.formProps.onSubmit(e);
          }}
        >
          <SubmitButton variant="ghost" size="sm" pending={live.pending} pendingLabel="Sending...">
            Send now
          </SubmitButton>
        </form>
      </div>
      <FormMessage state={test.state ?? live.state} className="max-w-sm text-xs" />
    </div>
  );
}

export function DeleteScheduleButton({ clientId, scheduleId }: { clientId: string; scheduleId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-down hover:bg-down-bg hover:text-down"
      onClick={() => {
        if (window.confirm("Delete this scheduled report? No more emails will be sent for it.")) {
          start(() => deleteScheduleAction(clientId, scheduleId));
        }
      }}
    >
      {pending ? "Deleting..." : "Delete"}
    </Button>
  );
}
