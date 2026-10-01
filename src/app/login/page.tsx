import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole, Mail } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand-logo";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const { error, success } = await searchParams;
  return (
    <section className="page flex flex-1 items-center justify-center">
      <div className="surface grid w-full max-w-4xl overflow-hidden lg:grid-cols-[.9fr_1.1fr]">
        <div className="hidden bg-[linear-gradient(145deg,#0b2545,#2563eb_58%,#14b8a6)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <p className="text-sm font-bold uppercase tracking-[.15em] text-brand-mint">Welcome back</p>
          <div><h1 className="text-4xl font-bold leading-tight">Your laundry day, already handled.</h1><p className="mt-4 max-w-sm text-blue-100">Track orders, manage pickups, and stay connected with your cleaner.</p></div>
          <p className="text-sm text-blue-100">Clean. Reliable. Convenient. Connected.</p>
        </div>
        <div className="p-6 sm:p-10">
          <BrandLogo />
          <h2 className="mt-8 text-2xl font-bold text-brand-navy">Sign in to your account</h2>
          <p className="mt-2 text-sm text-zinc-500">Use the account you created on LaundryLink.</p>
          {success && <p className="mt-5 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-700">{success}</p>}
          {error && <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <form action={loginAction} className="mt-6 grid gap-4">
            <label><span className="field-label">Email address</span><span className="relative block"><Mail className="absolute left-3 top-3 text-zinc-400" size={18} /><input className="field pl-10" name="email" type="email" autoComplete="email" required /></span></label>
            <label><span className="field-label">Password</span><span className="relative block"><LockKeyhole className="absolute left-3 top-3 text-zinc-400" size={18} /><input className="field pl-10" name="password" type="password" autoComplete="current-password" required /></span></label>
            <button className="btn-primary mt-2 w-full" type="submit">Sign in</button>
          </form>
          <p className="mt-6 text-center text-sm text-zinc-500">New to LaundryLink? <Link href="/register" className="font-bold text-brand-blue hover:underline">Create an account</Link></p>
        </div>
      </div>
    </section>
  );
}

