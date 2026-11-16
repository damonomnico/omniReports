"use client";

import { changePasswordAction, updateAccountAction } from "@/lib/actions/users";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";

export function AccountNameForm({ name, email }: { name: string; email: string }) {
  return (
    <ActionForm action={updateAccountAction} closeOnSuccess={false} className="max-w-md">
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" defaultValue={name} required maxLength={120} />
      </Field>
      <Field label="Email address" htmlFor="email" hint="Contact omniSEO to change your sign-in email.">
        <Input id="email" value={email} disabled readOnly />
      </Field>
    </ActionForm>
  );
}

export function ChangePasswordForm({ email }: { email: string }) {
  return (
    <ActionForm
      action={changePasswordAction}
      submitLabel="Change password"
      closeOnSuccess={false}
      resetOnSuccess
      className="max-w-md"
    >
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <Field label="Current password" htmlFor="current">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
    </ActionForm>
  );
}
