"use client";

import Link from "next/link";
import {
  acceptInviteAction,
  loginAction,
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/lib/auth/actions";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useServerForm } from "@/components/ui/use-server-form";

export function LoginForm() {
  const { state, pending, formProps } = useServerForm(loginAction);
  return (
    <form {...formProps} className="space-y-4">
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingLabel="Signing in...">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-brand-600 hover:underline">
          Forgotten your password?
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { state, pending, formProps } = useServerForm(requestPasswordResetAction);
  return (
    <form {...formProps} className="space-y-4">
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingLabel="Sending...">
        Send reset link
      </SubmitButton>
      <p className="text-center text-sm">
        <Link href="/login" className="text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function SetPasswordForm({
  token,
  mode,
  email,
}: {
  token: string;
  mode: "invite" | "reset";
  email: string;
}) {
  const { state, pending, formProps } = useServerForm(
    mode === "invite" ? acceptInviteAction : resetPasswordAction,
  );
  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers save the right username. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <Field label="New password" htmlFor="password" hint="At least 10 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          autoFocus
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingLabel="Saving...">
        {mode === "invite" ? "Create my account" : "Save new password"}
      </SubmitButton>
    </form>
  );
}
