"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { ActionState } from "@/lib/actions/types";
import { cn } from "@/lib/cn";
import { useDialog } from "./dialog";
import { FormMessage } from "./form";
import { SubmitButton } from "./submit-button";
import { useServerForm } from "./use-server-form";

/**
 * A form wired to a server action: shows the action's error or success
 * message, disables the button while saving and closes its dialog on success.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  pendingLabel = "Saving...",
  submitVariant = "primary",
  className,
  footer,
  closeOnSuccess = true,
  resetOnSuccess = false,
  renderResult,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  submitVariant?: "primary" | "secondary" | "danger";
  className?: string;
  footer?: ReactNode;
  closeOnSuccess?: boolean;
  /** Clear the fields after a successful save (for "add another" forms). */
  resetOnSuccess?: boolean;
  /** Shown in place of the form after success, e.g. a copyable invite link. */
  renderResult?: (state: NonNullable<ActionState>) => ReactNode;
}) {
  const { state, pending, formProps } = useServerForm(action);
  const dialog = useDialog();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnSuccess) formRef.current?.reset();
    if (closeOnSuccess && !renderResult) dialog?.close();
  }, [state, closeOnSuccess, resetOnSuccess, renderResult, dialog]);

  if (state?.ok && renderResult) {
    return <div className={className}>{renderResult(state)}</div>;
  }

  return (
    <form ref={formRef} {...formProps} className={cn("space-y-4", className)}>
      {children}
      <FormMessage state={state} />
      <div className="flex items-center justify-end gap-2 pt-1">
        {footer}
        <SubmitButton variant={submitVariant} pending={pending} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
