import type { Metadata } from "next";
import Link from "next/link";
import { registerAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <section className="page flex flex-1 items-center justify-center">
      <div className="surface w-full max-w-2xl p-6 sm:p-9">
        <p className="eyebrow">Join LaundryLink</p><h1 className="mt-2 text-3xl font-bold text-brand-navy">Create your account</h1><p className="mt-2 text-zinc-600">Book trusted laundry care or grow your cleaning business.</p>
        {error && <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <form action={registerAction} className="form-grid two mt-7">
          <label><span className="field-label">Full name</span><input className="field" name="name" autoComplete="name" required /></label>
          <label><span className="field-label">Email address</span><input className="field" name="email" type="email" autoComplete="email" required /></label>
          <label><span className="field-label">Phone</span><input className="field" name="phone" type="tel" autoComplete="tel" /></label>
          <label><span className="field-label">I want to</span><select className="field" name="role" defaultValue="customer"><option value="customer">Book laundry services</option><option value="cleaner">Offer laundry services</option></select></label>
          <label className="sm:col-span-2"><span className="field-label">Address</span><input className="field" name="address" autoComplete="street-address" /></label>
          <label className="sm:col-span-2"><span className="field-label">Password</span><input className="field" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /><span className="mt-1 block text-xs text-zinc-500">Use at least 12 characters.</span></label>
          <button className="btn-primary sm:col-span-2" type="submit">Create account</button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">Already registered? <Link href="/login" className="font-bold text-brand-blue hover:underline">Sign in</Link></p>
      </div>
    </section>
  );
}
