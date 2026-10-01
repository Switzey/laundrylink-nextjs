import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { sendPhoneVerificationAction, verifyPhoneAction } from "@/app/actions/auth";
import { AuthMessage } from "@/components/auth-message";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { roleRequiresPhoneVerification } from "@/lib/types";

export const metadata: Metadata = { title: "Verify phone" };

export default async function VerifyPhonePage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const user = await requireUser(undefined, { allowUnverified: true });
  if (!user.email_verified_at) redirect("/verify-email");
  if (!roleRequiresPhoneVerification(user.role) || user.phone_verified_at) redirect("/dashboard");
  const { error, sent } = await searchParams;
  return (
    <AuthShell title="Verify your phone" description="Business and delivery accounts require a verified mobile number.">
      <div className="mt-6 flex justify-center text-brand-teal"><PhoneCall aria-hidden="true" size={36} strokeWidth={1.7} /></div>
      <AuthMessage error={error} success={sent ? "Verification code sent. It expires in about 10 minutes." : undefined} />
      <form action={sendPhoneVerificationAction} className="mt-6 grid gap-3">
        <label><span className="field-label">Phone number</span><input className="field" name="phone" type="tel" autoComplete="tel" defaultValue={user.phone ?? ""} placeholder="+2348012345678" required /></label>
        <SubmitButton pendingLabel="Sending code..." className="btn-secondary w-full">Send code</SubmitButton>
      </form>
      <div className="auth-divider">verification code</div>
      <form action={verifyPhoneAction} className="grid gap-3">
        <label><span className="field-label">Code</span><input className="field text-center text-lg" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" required /></label>
        <SubmitButton pendingLabel="Verifying...">Verify phone</SubmitButton>
      </form>
    </AuthShell>
  );
}
