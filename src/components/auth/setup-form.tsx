"use client";

import { setupAction } from "@/lib/auth/setup";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useServerForm } from "@/components/ui/use-server-form";

export function SetupForm() {
  const { state, pending, formProps } = useServerForm(setupAction);
  return (
    <form {...formProps} className="space-y-4">
      <Field label="Setup key" htmlFor="key" hint="The CRON_SECRET from your hosting environment.">
        <Input id="key" name="key" type="password" autoComplete="off" required autoFocus />
      </Field>
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingLabel="Creating...">
        Create admin login
      </SubmitButton>
    </form>
  );
}
