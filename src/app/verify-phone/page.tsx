import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { sendPhoneVerificationAction, verifyPhoneAction } from "@/app/actions/auth";
import { AuthMessage } from "@/components/auth-message";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { destinationForUser, requireUser, userPhoneIsVerified } from "@/lib/auth";
import { authPath, sanitizeReturnTo } from "@/lib/auth-intent";
import { developmentPhoneCode, phoneVerificationConfigured } from "@/lib/env";
import { roleRequiresPhoneVerification } from "@/lib/types";

export const metadata: Metadata = { title: "Verify phone" };

export default async function VerifyPhonePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; sent?: string; returnTo?: string }> }) {
  const { error, notice, sent, returnTo: rawReturnTo } = await searchParams;
  const returnTo = sanitizeReturnTo(rawReturnTo);
  const user = await requireUser(undefined, { allowUnverified: true, returnTo: returnTo ?? undefined });
  if (!user.email_verified_at) redirect(authPath("/verify-email", returnTo));
  if (!phoneVerificationConfigured() || !roleRequiresPhoneVerification(user.role) || userPhoneIsVerified(user)) {
    redirect(destinationForUser(user, returnTo));
  }
  const localCode = developmentPhoneCode();
  return (
    <AuthShell title="Verify your phone" description="Business and delivery accounts require a verified mobile number.">
      <div className="mt-6 flex justify-center text-brand-teal"><PhoneCall aria-hidden="true" size={36} strokeWidth={1.7} /></div>
      <AuthMessage error={error} notice={notice} success={sent ? "Verification code sent. It expires in about 10 minutes." : undefined} />
      <form action={sendPhoneVerificationAction} className="mt-6 grid gap-3">
        <input type="hidden" name="returnTo" value={returnTo ?? ""} />
        <label><span className="field-label">Phone number</span><input className="field" name="phone" type="tel" autoComplete="tel" defaultValue={user.phone ?? ""} placeholder="+2348012345678" required /></label>
        <SubmitButton pendingLabel="Sending code..." className="btn-secondary w-full">Send code</SubmitButton>
      </form>
      <div className="auth-divider">verification code</div>
      {localCode ? <p className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-center text-sm text-blue-800">Local development code: <strong>{localCode}</strong></p> : null}
      <form action={verifyPhoneAction} className="grid gap-3">
        <input type="hidden" name="returnTo" value={returnTo ?? ""} />
        <label><span className="field-label">Code</span><input className="field text-center text-lg" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" required /></label>
        <SubmitButton pendingLabel="Verifying...">Verify phone</SubmitButton>
      </form>
    </AuthShell>
  );
}
