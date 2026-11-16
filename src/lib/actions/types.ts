/** What every form server action returns. */
export type ActionState =
  | {
      ok?: boolean;
      error?: string;
      message?: string;
      /** A link staff can copy when email is not configured. */
      link?: string;
      /** Whether an email was actually sent. */
      emailed?: boolean;
    }
  | undefined;
