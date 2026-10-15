import type { Metadata } from "next";
import Link from "next/link";
import { Building2, MapPin, UserRound } from "lucide-react";
import { joinWaitlistAction } from "@/app/actions/marketplace";
import { AuthMessage } from "@/components/auth-message";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "LaundryLink early access", description: "Join the LaundryLink customer or vendor waitlist for your city." };

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; audience?: string }> }) {
  const { error, success, audience } = await searchParams;
  const defaultAudience = audience === "vendor" ? "vendor" : "customer";
  return (
    <div className="page">
      <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
        <div><p className="eyebrow">Early access</p><h1 className="page-title">Bring LaundryLink to your city</h1><p className="page-copy text-lg">Tell us where you need reliable laundry pickup and delivery. Customer and vendor interest helps us prioritize the next launch areas.</p><div className="mt-7 grid gap-4"><div className="flex gap-3"><MapPin className="shrink-0 text-brand-blue" /><div><strong className="text-brand-navy">Location-led launches</strong><p className="mt-1 text-sm leading-6 text-zinc-600">We use verified local demand to plan city coverage.</p></div></div><div className="flex gap-3"><UserRound className="shrink-0 text-teal-700" /><div><strong className="text-brand-navy">Customer access</strong><p className="mt-1 text-sm leading-6 text-zinc-600">Hear when cleaner discovery and booking open nearby.</p></div></div><div className="flex gap-3"><Building2 className="shrink-0 text-amber-700" /><div><strong className="text-brand-navy">Vendor onboarding</strong><p className="mt-1 text-sm leading-6 text-zinc-600">Get notified when applications open for your market.</p></div></div></div></div>
        <form action={joinWaitlistAction} className="surface p-6 sm:p-8"><AuthMessage error={error} success={success} /><input type="hidden" name="source" value="public_waitlist" /><div className="form-grid two"><label className="sm:col-span-2"><span className="field-label">I want to</span><select className="field" name="audience" defaultValue={defaultAudience}><option value="customer">Book laundry services</option><option value="vendor">List my laundry business</option></select></label><label><span className="field-label">Full name</span><input className="field" name="name" autoComplete="name" maxLength={100} required /></label><label><span className="field-label">Email</span><input className="field" name="email" type="email" autoComplete="email" maxLength={254} required /></label><label><span className="field-label">Phone <span className="font-normal text-zinc-600">(optional)</span></span><input className="field" name="phone" type="tel" autoComplete="tel" maxLength={30} placeholder="+2348012345678" /></label><label><span className="field-label">State</span><input className="field" name="state" maxLength={80} placeholder="Lagos" required /></label><label className="sm:col-span-2"><span className="field-label">City or area</span><input className="field" name="city" maxLength={100} placeholder="Lekki" required /></label><div className="sm:col-span-2"><SubmitButton pendingLabel="Joining waitlist...">Join the waitlist</SubmitButton><p className="mt-3 text-xs leading-5 text-zinc-600">By joining, you agree to our <Link className="font-bold text-brand-blue" href="/privacy">privacy notice</Link>. We will only use these details for LaundryLink launch updates.</p></div></div></form>
      </div>
    </div>
  );
}
