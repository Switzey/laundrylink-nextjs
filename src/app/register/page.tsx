import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Mail, Phone, UserRound, ShieldCheck } from "lucide-react";
import { registerAction } from "@/app/actions/auth";
import { AuthMessage } from "@/components/auth-message";
import { AuthShell } from "@/components/auth-shell";
import { OAuthButtons } from "@/components/oauth-buttons";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";
import { destinationForUser, getCurrentUser } from "@/lib/auth";
import { authPath, sanitizeReturnTo } from "@/lib/auth-intent";
import { oauthProviderConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string; role?: string }> }) {
  const { error, returnTo: requestedReturnTo, role } = await searchParams;
  const returnTo = sanitizeReturnTo(requestedReturnTo);
  const defaultRole = role === "VENDOR_OWNER" ? "VENDOR_OWNER" : "CUSTOMER";
  const currentUser = await getCurrentUser();
  if (currentUser) redirect(destinationForUser(currentUser, returnTo));

  return (
    <AuthShell title="Create your account" description="Laundry care that works around your life." variant="register">
      <AuthMessage error={error} />
      <OAuthButtons returnTo={returnTo} googleAvailable={oauthProviderConfigured("google")} appleAvailable={oauthProviderConfigured("apple")} />
      <div className="auth-divider">or create an account with email</div>

      <form action={registerAction} className="ll-auth-form">
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label>
          <span className="field-label">Full name</span>
          <span className="relative block">
            <UserRound aria-hidden="true" className="ll-auth-input-icon" size={19} />
            <input className="field pl-11" name="name" autoComplete="name" maxLength={100} placeholder="Your full name" required />
          </span>
        </label>
        <label>
          <span className="field-label">Email address</span>
          <span className="relative block">
            <Mail aria-hidden="true" className="ll-auth-input-icon" size={19} />
            <input className="field pl-11" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required />
          </span>
        </label>
        <label>
          <span className="field-label">Account type</span>
          <select className="field" name="role" defaultValue={defaultRole}>
            <option value="CUSTOMER">I want to book laundry</option>
            <option value="VENDOR_OWNER">I run a laundry business</option>
          </select>
        </label>
        <label>
          <span className="field-label">Phone number</span>
          <span className="relative block">
            <Phone aria-hidden="true" className="ll-auth-input-icon" size={19} />
            <input className="field pl-11" name="phone" type="tel" autoComplete="tel" placeholder="+2348012345678" maxLength={30} required={defaultRole === "VENDOR_OWNER"} />
          </span>
          <span className="ll-auth-field-help">Required for laundry businesses. Include the country code.</span>
        </label>
        <label>
          <span className="field-label">Address <span className="ll-auth-optional">(optional)</span></span>
          <input className="field" name="address" autoComplete="street-address" maxLength={250} placeholder="Your pickup address" />
        </label>
        <PasswordField name="password" label="Create password" autoComplete="new-password" minLength={12} hint="Use at least 12 characters for better security." />
        <PasswordField name="confirm_password" label="Confirm password" autoComplete="new-password" minLength={12} />
        <p className="ll-auth-terms"><ShieldCheck size={15} aria-hidden="true" /> By continuing, you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>
        <SubmitButton pendingLabel="Creating account..." className="btn-primary ll-auth-submit">Create account <ArrowRight size={18} aria-hidden="true" /></SubmitButton>
      </form>
      <p className="ll-auth-switch">Already have an account? <Link href={authPath("/login", returnTo)}>Sign in</Link></p>
    </AuthShell>
  );
}
