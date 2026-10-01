import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { forgotPasswordAction } from "@/app/actions/auth";
import { AuthMessage } from "@/components/auth-message";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { authPath, sanitizeReturnTo } from "@/lib/auth-intent";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; returnTo?: string }> }) {
  const { error, sent, returnTo: rawReturnTo } = await searchParams;
  const returnTo = sanitizeReturnTo(rawReturnTo);
  return (
    <AuthShell title="Reset your password" description="Enter your email and we will send a secure reset link.">
      <AuthMessage error={error} success={sent ? "If an account exists for that email, a reset link is on its way." : undefined} />
      <form action={forgotPasswordAction} className="mt-6 grid gap-4">
        <input type="hidden" name="returnTo" value={returnTo ?? ""} />
        <label><span className="field-label">Email</span><span className="relative block"><Mail aria-hidden="true" className="absolute left-3 top-3 text-zinc-400" size={18} /><input className="field pl-10" name="email" type="email" autoComplete="email" inputMode="email" required /></span></label>
        <SubmitButton pendingLabel="Sending link...">Send reset link</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm"><Link className="font-bold text-brand-blue hover:underline" href={authPath("/login", returnTo)}>Back to sign in</Link></p>
    </AuthShell>
  );
}
