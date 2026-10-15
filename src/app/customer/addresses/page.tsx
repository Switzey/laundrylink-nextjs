import type { Metadata } from "next";
import { MapPin, Trash2 } from "lucide-react";
import { deleteAddressAction, saveAddressAction } from "@/app/actions/account";
import { AddressMapPicker } from "@/components/address-map-picker";
import { CustomerAccountNav } from "@/components/customer-account-nav";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";

export const metadata: Metadata = { title: "Saved addresses" };
type Address = { id: number; label: string | null; address: string; city: string; phone: string | null; landmark: string | null; latitude: number | null; longitude: number | null; is_default: number; delivery_notes: string | null };

export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser("CUSTOMER", { returnTo: "/customer/addresses" });
  const { error } = await searchParams;
  const addresses = await all<Address>("SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, label", user.id);
  return (
    <div className="page">
      <CustomerAccountNav />
      <div className="page-header"><div><p className="eyebrow">Pickup and delivery</p><h1 className="page-title">Saved addresses</h1><p className="page-copy">Keep frequently used addresses ready for faster checkout.</p></div></div>
      {error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-7 lg:grid-cols-[.85fr_1.15fr]">
        <form action={saveAddressAction} className="surface panel form-grid h-fit"><h2 className="section-title">Add an address</h2><div className="form-grid two"><label><span className="field-label">Label</span><select className="field" name="label" defaultValue="Home"><option>Home</option><option>Office</option><option>Hostel</option><option>Other</option></select></label><label><span className="field-label">Phone</span><input className="field" name="phone" type="tel" /></label></div><label><span className="field-label">Street address</span><input className="field" name="address" maxLength={250} required /></label><div className="form-grid two"><label><span className="field-label">City</span><input className="field" name="city" maxLength={100} required /></label><label><span className="field-label">Landmark</span><input className="field" name="landmark" maxLength={250} placeholder="Near the blue gate" /></label></div><AddressMapPicker /><label><span className="field-label">Delivery instructions</span><textarea className="field min-h-24" name="delivery_notes" maxLength={1000} placeholder="Gate code, access notes, or handoff details" /></label><label className="flex items-center gap-2 text-sm font-medium text-zinc-700"><input type="checkbox" name="is_default" />Make this my default address</label><button className="btn-primary" type="submit">Save address</button></form>
        <section><h2 className="section-title">Your addresses</h2><div className="mt-4 grid gap-3">{addresses.length ? addresses.map((address) => <article className="surface flex items-start justify-between gap-4 p-5" key={address.id}><div className="flex gap-3"><span className="mt-1 text-brand-blue"><MapPin size={20} /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-brand-navy">{address.label || "Saved address"}</h3>{Boolean(address.is_default) && <span className="badge border-teal-200 bg-teal-50 text-teal-700">Default</span>}{address.latitude !== null && <span className="badge border-blue-200 bg-blue-50 text-blue-700">Map pinned</span>}</div><p className="mt-1 text-sm text-zinc-600">{address.address}, {address.city}</p>{address.landmark && <p className="mt-1 text-xs text-zinc-500">Landmark: {address.landmark}</p>}{address.phone && <p className="mt-1 text-xs text-zinc-500">{address.phone}</p>}{address.delivery_notes && <p className="mt-2 text-xs text-zinc-500">{address.delivery_notes}</p>}</div></div><form action={deleteAddressAction}><input type="hidden" name="address_id" value={address.id} /><button className="icon-button text-rose-600" aria-label="Delete address"><Trash2 size={16} /></button></form></article>) : <div className="surface empty">No saved addresses yet.</div>}</div></section>
      </div>
    </div>
  );
}
