"use client";

import { startTransition, useActionState } from "react";
import type { FormEvent } from "react";

/**
 * Wires a form to a server action without React's automatic form reset, so
 * people keep what they typed when the server reports a problem.
 * Spread `formProps` on the <form> and pass `pending` to the submit button.
 */
export function useServerForm<S>(action: (prev: S | undefined, formData: FormData) => Promise<S | undefined>) {
  const [state, formAction, pending] = useActionState(action, undefined);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | null;
    if (submitter?.name) formData.append(submitter.name, submitter.value);
    startTransition(() => formAction(formData));
  }

  return { state, pending, formProps: { action: formAction, onSubmit } };
}
