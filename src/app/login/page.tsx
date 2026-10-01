import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { AuthMessage } from "@/components/auth-message";
import { AuthShell } from "@/components/auth-shell";
import { OAuthButtons } from "@/components/oauth-buttons";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";
import { destinationForUser, getCurrentUser } from "@/lib/auth";
import { authPath, sanitizeReturnTo } from "@/lib/auth-intent";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; returnTo?: string }> }) {
  const { error, success, returnTo: requestedReturnTo } = await searchParams;
  const returnTo = sanitizeReturnTo(requestedReturnTo);
  const currentUser = await getCurrentUser();
  if (currentUser) redirect(destinationForUser(currentUser, returnTo));
  return (
    <AuthShell title="Welcome back" description="Sign in to continue">
      <AuthMessage error={error} success={success} />
      <OAuthButtons returnTo={returnTo} />
      <div className="auth-divider">or</div>
      <form action={loginAction} className="grid gap-4">
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label>
          <span className="field-label">Email</span>
          <span className="relative block">
            <Mail aria-hidden="true" className="absolute left-3 top-3 text-zinc-400" size={18} />
            <input className="field pl-10" name="email" type="email" autoComplete="email" inputMode="email" required />
          </span>
        </label>
        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="field-label mb-0">Password</span>
            <Link className="text-xs font-bold text-brand-blue hover:underline" href={authPath("/forgot-password", returnTo)}>Forgot password?</Link>
          </div>
          <PasswordField name="password" autoComplete="current-password" hideLabel />
        </div>
        <SubmitButton pendingLabel="Signing in...">Sign in</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">New to LaundryLink? <Link href={authPath("/register", returnTo)} className="font-bold text-brand-blue hover:underline">Create account</Link></p>
    </AuthShell>
  );
}
