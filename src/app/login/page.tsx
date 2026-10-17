import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { AuthMessage } from "@/components/auth-message";
import { AuthShell } from "@/components/auth-shell";
import { OAuthButtons } from "@/components/oauth-buttons";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";
import { destinationForUser, getCurrentUser } from "@/lib/auth";
import { authPath, sanitizeReturnTo } from "@/lib/auth-intent";
import { oauthProviderConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; returnTo?: string }> }) {
  const { error, success, returnTo: requestedReturnTo } = await searchParams;
  const returnTo = sanitizeReturnTo(requestedReturnTo);
  const currentUser = await getCurrentUser();
  if (currentUser) redirect(destinationForUser(currentUser, returnTo));

  return (
    <AuthShell title="Welcome back!" description="Sign in and get back to what matters." variant="login">
      <AuthMessage error={error} success={success} />
      <OAuthButtons returnTo={returnTo} googleAvailable={oauthProviderConfigured("google")} appleAvailable={oauthProviderConfigured("apple")} />
      <div className="auth-divider">or continue with email</div>

      <form action={loginAction} className="ll-auth-form">
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label>
          <span className="field-label">Email address</span>
          <span className="relative block">
            <Mail aria-hidden="true" className="ll-auth-input-icon" size={19} />
            <input className="field pl-11" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required />
          </span>
        </label>
        <div>
          <PasswordField name="password" label="Password" autoComplete="current-password" />
          <div className="ll-auth-label-row mt-2 justify-end">
            <Link className="ll-auth-text-link" href={authPath("/forgot-password", returnTo)}>Forgot password?</Link>
          </div>
        </div>
        <SubmitButton pendingLabel="Signing in..." className="btn-primary ll-auth-submit">
          Sign in <ArrowRight size={18} aria-hidden="true" />
        </SubmitButton>
      </form>

      <p className="ll-auth-assurance"><ShieldCheck size={17} aria-hidden="true" /> Secure access to your LaundryLink account</p>
      <p className="ll-auth-switch">New to LaundryLink? <Link href={authPath("/register", returnTo)}>Create an account</Link></p>
    </AuthShell>
  );
}
