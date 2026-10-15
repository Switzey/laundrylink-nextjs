import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sendBusinessPhoneVerificationAction, updateCleanerProfileAction, verifyBusinessPhoneAction } from "@/app/actions/cleaner";
import { SubmitButton } from "@/components/submit-button";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { VENDOR_MANAGEMENT_ROLES } from "@/lib/types";
import { one } from "@/lib/db";
import { businessPhoneIsVerified } from "@/lib/phone-state";
import type { Cleaner } from "@/lib/types";
import { getVendorEligibility } from "@/lib/vendor-eligibility";
import { vendorEligibilityIssues } from "@/lib/vendor-eligibility-model";

export const metadata: Metadata = { title: "Cleaner profile" };

export default async function CleanerProfilePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; sent?: string }> }) {
  const user = await requireUser(VENDOR_MANAGEMENT_ROLES, { returnTo: "/cleaner/profile" });
  const cleanerId = await cleanerIdForUser(user.id);
  const cleaner = cleanerId ? await one<Cleaner>("SELECT * FROM cleaners WHERE id = ?", cleanerId) : null;
  const message = await searchParams;
  if (!cleaner) return <div className="page"><div className="surface empty">Cleaner profile not found.</div></div>;
  if (cleaner.verification_status !== "approved") redirect("/cleaner/onboarding");
  const eligibility = await getVendorEligibility(cleaner.id);
  const canRequestOrders = Boolean(eligibility?.publicationEligible && eligibility.activeServiceCount > 0);
  const issues = eligibility ? vendorEligibilityIssues(eligibility) : [];
  return (
    <div className="page"><div className="page-header"><div><p className="eyebrow">Business settings</p><h1 className="page-title">Cleaner profile</h1><p className="page-copy">This information appears on your LaundryLink marketplace profile.</p></div></div>{message.success && <p className="mb-5 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-700">{message.success.replaceAll("+", " ")}</p>}{message.error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{message.error.replaceAll("+", " ")}</p>}{message.sent && <p className="mb-5 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">Verification code sent to the saved business phone.</p>}
      {cleaner.is_suspended ? <p className="mx-auto mb-5 max-w-3xl rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Marketplace access is suspended. Existing orders remain available for authorized handling, but the business cannot be published or accept new orders.</p> : null}
      <section className="surface mx-auto mb-5 max-w-3xl p-5"><div className="flex flex-wrap gap-2"><span className="badge border-teal-200 bg-teal-50 text-teal-700">Verification approved</span><span className={`badge ${eligibility?.publicProfile ? "border-blue-200 bg-blue-50 text-blue-700" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>{eligibility?.publicProfile ? "Published" : "Hidden"}</span><span className={`badge ${eligibility?.bookable ? "border-teal-200 bg-teal-50 text-teal-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{eligibility?.bookable ? "Accepting orders" : "Bookings paused"}</span></div>{!eligibility?.bookable && issues.length ? <p className="mt-3 text-sm text-zinc-600">{issues[0]}</p> : null}</section>
      <form action={updateCleanerProfileAction} className="surface mx-auto max-w-3xl p-6 sm:p-8"><div className="form-grid two"><label><span className="field-label">Business name</span><input className="field" name="business_name" defaultValue={cleaner.business_name} required /></label><label><span className="field-label">Phone</span><input className="field" name="phone" defaultValue={cleaner.phone} required /></label><label className="sm:col-span-2"><span className="field-label">Business description</span><textarea className="field min-h-28" name="description" defaultValue={cleaner.description ?? ""} /></label><label><span className="field-label">Address</span><input className="field" name="address" defaultValue={cleaner.address} required /></label><label><span className="field-label">City</span><input className="field" name="city" defaultValue={cleaner.city} required /></label><label><span className="field-label">Turnaround time</span><input className="field" name="turnaround_time" defaultValue={cleaner.turnaround_time ?? ""} placeholder="24 - 48 hours" /></label><label><span className="field-label">Opening hours</span><input className="field" name="opening_hours" defaultValue={cleaner.opening_hours ?? ""} placeholder="Mon - Sat, 8am - 6pm" /></label><label className="flex items-center gap-2 text-sm font-medium text-zinc-700 sm:col-span-2"><input type="checkbox" name="is_published" defaultChecked={Boolean(cleaner.is_published)} disabled={!eligibility?.publicationEligible} />Publish marketplace profile</label><label className="flex items-center gap-2 text-sm font-medium text-zinc-700 sm:col-span-2"><input type="checkbox" name="is_available" defaultChecked={Boolean(cleaner.is_available)} disabled={!canRequestOrders} />Accept new orders</label><button className="btn-primary sm:col-span-2" type="submit">Save profile</button></div></form>
      <section className="surface mx-auto mt-5 max-w-3xl p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="section-title">Business phone</h2><p className="mt-1 text-sm text-zinc-600">{businessPhoneIsVerified(cleaner) ? `${cleaner.phone} is verified.` : `${cleaner.phone} must be verified before this business can accept new orders.`}</p></div>{!businessPhoneIsVerified(cleaner) && <form action={sendBusinessPhoneVerificationAction}><SubmitButton className="btn-secondary" pendingLabel="Sending...">Send code</SubmitButton></form>}</div>{!businessPhoneIsVerified(cleaner) && <form action={verifyBusinessPhoneAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><label><span className="field-label">Verification code</span><input className="field" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" required /></label><SubmitButton className="btn-primary self-end" pendingLabel="Verifying...">Verify phone</SubmitButton></form>}</section>
    </div>
  );
}

