import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { resendVerificationAction } from "@/app/actions/auth";
import { AuthMessage } from "@/components/auth-message";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; notice?: string }> }) {
  const { error, sent, notice } = await searchParams;
  return (
    <AuthShell title="Check your email" description="Open the verification link to activate your LaundryLink account.">
      <div className="mt-6 flex justify-center text-brand-teal"><MailCheck aria-hidden="true" size={38} strokeWidth={1.7} /></div>
      <AuthMessage error={error} success={sent ? "If the account needs verification, a fresh link has been sent." : undefined} notice={notice} />
      <form action={resendVerificationAction} className="mt-6 grid gap-4">
        <label><span className="field-label">Email</span><input className="field" name="email" type="email" autoComplete="email" inputMode="email" required /></label>
        <SubmitButton pendingLabel="Sending..." className="btn-secondary w-full">Resend verification email</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm"><Link className="font-bold text-brand-blue hover:underline" href="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
