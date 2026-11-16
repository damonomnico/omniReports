import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="font-display text-2xl font-semibold text-ink">Reset your password</h2>
      <p className="mt-1 mb-6 text-sm text-muted">
        Enter your email address and we will send you a link to choose a new password.
      </p>
      <ForgotPasswordForm />
    </>
  );
}
