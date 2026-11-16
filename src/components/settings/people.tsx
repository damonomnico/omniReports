"use client";

import { useTransition } from "react";
import { Link2, UserPlus } from "lucide-react";
import type { ActionState } from "@/lib/actions/types";
import {
  clientUserLinkAction,
  inviteClientUserAction,
  inviteStaffAction,
  removeClientUserAction,
  staffLinkAction,
  updateStaffAction,
} from "@/lib/actions/users";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";

function InviteResult({ state }: { state: NonNullable<ActionState> }) {
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-up-bg px-3 py-2 text-sm text-up">{state.message}</p>
      {state.link ? (
        <CopyField
          value={state.link}
          label={state.emailed ? "Invite link (also emailed)" : "Link to send them"}
        />
      ) : null}
    </div>
  );
}

function PersonFields() {
  return (
    <>
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" required maxLength={120} autoComplete="off" />
      </Field>
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="off" />
      </Field>
    </>
  );
}

export function InviteClientUserDialog({ clientId, clientName }: { clientId: string; clientName: string }) {
  return (
    <Dialog
      trigger={
        <>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Invite someone
        </>
      }
      title={`Give someone access to ${clientName}`}
      description="They will only ever see this client's reports."
    >
      <ActionForm
        action={inviteClientUserAction.bind(null, clientId)}
        submitLabel="Send invite"
        pendingLabel="Inviting..."
        renderResult={(state) => <InviteResult state={state} />}
      >
        <PersonFields />
      </ActionForm>
    </Dialog>
  );
}

export function InviteStaffDialog() {
  return (
    <Dialog
      trigger={
        <>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Invite team member
        </>
      }
      title="Invite an omniSEO team member"
      description="Team members can see and manage every client."
    >
      <ActionForm
        action={inviteStaffAction}
        submitLabel="Send invite"
        pendingLabel="Inviting..."
        renderResult={(state) => <InviteResult state={state} />}
      >
        <PersonFields />
        <Field
          label="Role"
          htmlFor="role"
          hint="Admins can also manage the team and delete clients."
        >
          <Select id="role" name="role" defaultValue="staff">
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
      </ActionForm>
    </Dialog>
  );
}

/** Creates a fresh invite or password reset link and shows it for copying. */
export function AccessLinkDialog({
  kind,
  clientId,
  userId,
  hasPassword,
  name,
}: {
  kind: "client" | "staff";
  clientId?: string;
  userId: string;
  hasPassword: boolean;
  name: string;
}) {
  const action =
    kind === "client"
      ? clientUserLinkAction.bind(null, clientId!, userId)
      : staffLinkAction.bind(null, userId);
  return (
    <Dialog
      trigger={
        <>
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {hasPassword ? "Reset link" : "Resend invite"}
        </>
      }
      triggerVariant="ghost"
      triggerSize="sm"
      title={hasPassword ? `Reset ${name}'s password` : `Resend ${name}'s invite`}
      description={
        hasPassword
          ? "Creates a one-time link they can use to choose a new password."
          : "Creates a fresh invite link. Any earlier invite link stops working."
      }
    >
      <ActionForm
        action={action}
        submitLabel="Create link"
        pendingLabel="Creating..."
        renderResult={(state) => <InviteResult state={state} />}
      >
        <p className="text-sm text-muted">
          The link is shown here so you can send it yourself if email is not set up.
        </p>
      </ActionForm>
    </Dialog>
  );
}

export function RemoveClientUserButton({
  clientId,
  userId,
  name,
}: {
  clientId: string;
  userId: string;
  name: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-down hover:bg-down-bg hover:text-down"
      onClick={() => {
        if (window.confirm(`Remove ${name}'s access to this client?`)) {
          start(() => removeClientUserAction(clientId, userId));
        }
      }}
    >
      {pending ? "Removing..." : "Remove"}
    </Button>
  );
}

export function StaffControls({
  userId,
  role,
  isActive,
  isSelf,
}: {
  userId: string;
  role: "admin" | "staff";
  isActive: boolean;
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();
  if (isSelf) return <span className="text-xs text-subtle">This is you</span>;

  const run = (change: Parameters<typeof updateStaffAction>[1]) =>
    start(async () => {
      const res = await updateStaffAction(userId, change);
      if (res.error) window.alert(res.error);
    });

  return (
    <div className="flex items-center justify-end gap-1">
      <select
        aria-label="Role"
        value={role}
        disabled={pending}
        onChange={(e) => run({ role: e.target.value as "admin" | "staff" })}
        className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px]"
      >
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
      </select>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (
            isActive
              ? window.confirm("Deactivate this login? They will be signed out immediately.")
              : true
          ) {
            run({ isActive: !isActive });
          }
        }}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </div>
  );
}
