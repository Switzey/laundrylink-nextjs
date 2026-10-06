import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { updateCleanerProfileAction } from "@/app/actions/cleaner";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { VENDOR_MANAGEMENT_ROLES } from "@/lib/types";
import { one } from "@/lib/db";
import type { Cleaner } from "@/lib/types";

export const metadata: Metadata = { title: "Cleaner profile" };

export default async function CleanerProfilePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await requireUser(VENDOR_MANAGEMENT_ROLES, { returnTo: "/cleaner/profile" });
  const cleanerId = await cleanerIdForUser(user.id);
  const cleaner = cleanerId ? await one<Cleaner>("SELECT * FROM cleaners WHERE id = ?", cleanerId) : null;
  const message = await searchParams;
  if (!cleaner) return <div className="page"><div className="surface empty">Cleaner profile not found.</div></div>;
  if (cleaner.verification_status !== "approved") redirect("/cleaner/onboarding");
  return (
    <div className="page"><div className="page-header"><div><p className="eyebrow">Business settings</p><h1 className="page-title">Cleaner profile</h1><p className="page-copy">This information appears on your LaundryLink marketplace profile.</p></div></div>{message.success && <p className="mb-5 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-700">{message.success.replaceAll("+", " ")}</p>}{message.error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{message.error.replaceAll("+", " ")}</p>}
      <form action={updateCleanerProfileAction} className="surface mx-auto max-w-3xl p-6 sm:p-8"><div className="form-grid two"><label><span className="field-label">Business name</span><input className="field" name="business_name" defaultValue={cleaner.business_name} required /></label><label><span className="field-label">Phone</span><input className="field" name="phone" defaultValue={cleaner.phone} required /></label><label className="sm:col-span-2"><span className="field-label">Business description</span><textarea className="field min-h-28" name="description" defaultValue={cleaner.description ?? ""} /></label><label><span className="field-label">Address</span><input className="field" name="address" defaultValue={cleaner.address} required /></label><label><span className="field-label">City</span><input className="field" name="city" defaultValue={cleaner.city} required /></label><label><span className="field-label">Turnaround time</span><input className="field" name="turnaround_time" defaultValue={cleaner.turnaround_time ?? ""} placeholder="24 - 48 hours" /></label><label><span className="field-label">Opening hours</span><input className="field" name="opening_hours" defaultValue={cleaner.opening_hours ?? ""} placeholder="Mon - Sat, 8am - 6pm" /></label><label className="flex items-center gap-2 text-sm font-medium text-zinc-700 sm:col-span-2"><input type="checkbox" name="is_available" defaultChecked={Boolean(cleaner.is_available)} />Accept new orders</label><button className="btn-primary sm:col-span-2" type="submit">Save profile</button></div></form>
    </div>
  );
}

