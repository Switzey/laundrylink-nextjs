import type { Metadata } from "next";
import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/auth";
import { AuthMessage } from "@/components/auth-message";
import { AuthShell } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";
import { authPath, sanitizeReturnTo } from "@/lib/auth-intent";
import { findValidAuthToken } from "@/lib/auth-tokens";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string; returnTo?: string }> }) {
  const { token = "", error, returnTo: rawReturnTo } = await searchParams;
  const returnTo = sanitizeReturnTo(rawReturnTo);
  const valid = token ? await findValidAuthToken(token, "password_reset") : null;
  return (
    <AuthShell title="Choose a new password" description="Your new password must contain at least 12 characters.">
      <AuthMessage error={error || (!valid ? "This reset link is invalid or expired." : undefined)} />
      {valid ? <form action={resetPasswordAction} className="mt-6 grid gap-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="returnTo" value={returnTo ?? ""} />
        <PasswordField name="password" label="New password" autoComplete="new-password" minLength={12} />
        <PasswordField name="confirm_password" label="Confirm new password" autoComplete="new-password" minLength={12} />
        <SubmitButton pendingLabel="Updating password...">Update password</SubmitButton>
      </form> : <p className="mt-6 text-center text-sm"><Link className="font-bold text-brand-blue hover:underline" href={authPath("/forgot-password", returnTo)}>Request another link</Link></p>}
    </AuthShell>
  );
}
