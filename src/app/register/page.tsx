import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { registerAction } from "@/app/actions/auth";
import { AuthMessage } from "@/components/auth-message";
import { AuthShell } from "@/components/auth-shell";
import { OAuthButtons } from "@/components/oauth-buttons";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";
import { destinationForUser, getCurrentUser } from "@/lib/auth";
import { authPath, sanitizeReturnTo } from "@/lib/auth-intent";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const { error, returnTo: requestedReturnTo } = await searchParams;
  const returnTo = sanitizeReturnTo(requestedReturnTo);
  const currentUser = await getCurrentUser();
  if (currentUser) redirect(destinationForUser(currentUser, returnTo));
  return (
    <AuthShell title="Create your account" description="One LaundryLink account for bookings, teams, and deliveries.">
      <AuthMessage error={error} />
      <OAuthButtons returnTo={returnTo} />
      <div className="auth-divider">or use email</div>
      <form action={registerAction} className="grid gap-4">
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label><span className="field-label">Full name</span><input className="field" name="name" autoComplete="name" maxLength={100} required /></label>
        <label><span className="field-label">Email</span><input className="field" name="email" type="email" autoComplete="email" inputMode="email" required /></label>
        <label><span className="field-label">Account type</span><select className="field" name="role" defaultValue="CUSTOMER"><option value="CUSTOMER">Book laundry services</option><option value="VENDOR_OWNER">Run a laundry business</option></select></label>
        <label><span className="field-label">Phone</span><input className="field" name="phone" type="tel" autoComplete="tel" placeholder="+2348012345678" maxLength={30} /><span className="mt-1.5 block text-xs text-zinc-500">Required for laundry businesses. Use international format.</span></label>
        <label><span className="field-label">Address</span><input className="field" name="address" autoComplete="street-address" maxLength={250} /></label>
        <PasswordField name="password" label="Password" autoComplete="new-password" minLength={12} hint="Use at least 12 characters." />
        <PasswordField name="confirm_password" label="Confirm password" autoComplete="new-password" minLength={12} />
        <SubmitButton pendingLabel="Creating account...">Create account</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">Already registered? <Link href={authPath("/login", returnTo)} className="font-bold text-brand-blue hover:underline">Sign in</Link></p>
    </AuthShell>
  );
}
