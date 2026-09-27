import type { Metadata } from "next";
import { MapPin, Trash2 } from "lucide-react";
import { deleteAddressAction, saveAddressAction } from "@/app/actions/account";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";

export const metadata: Metadata = { title: "Saved addresses" };
type Address = { id: number; label: string | null; address: string; city: string; phone: string | null; is_default: number; delivery_notes: string | null };

export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser("customer");
  const { error } = await searchParams;
  const addresses = await all<Address>("SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, label", user.id);
  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Pickup and delivery</p><h1 className="page-title">Saved addresses</h1><p className="page-copy">Keep frequently used addresses ready for faster checkout.</p></div></div>
      {error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-7 lg:grid-cols-[.85fr_1.15fr]">
        <form action={saveAddressAction} className="surface panel form-grid h-fit"><h2 className="section-title">Add an address</h2><div className="form-grid two"><label><span className="field-label">Label</span><input className="field" name="label" placeholder="Home or Office" /></label><label><span className="field-label">Phone</span><input className="field" name="phone" type="tel" /></label></div><label><span className="field-label">Street address</span><input className="field" name="address" required /></label><label><span className="field-label">City</span><input className="field" name="city" required /></label><label><span className="field-label">Delivery notes</span><textarea className="field min-h-24" name="delivery_notes" placeholder="Gate code, landmark, or handoff details" /></label><label className="flex items-center gap-2 text-sm font-medium text-zinc-700"><input type="checkbox" name="is_default" />Make this my default address</label><button className="btn-primary" type="submit">Save address</button></form>
        <section><h2 className="section-title">Your addresses</h2><div className="mt-4 grid gap-3">{addresses.length ? addresses.map((address) => <article className="surface flex items-start justify-between gap-4 p-5" key={address.id}><div className="flex gap-3"><span className="mt-1 text-brand-blue"><MapPin size={20} /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-brand-navy">{address.label || "Saved address"}</h3>{Boolean(address.is_default) && <span className="badge border-teal-200 bg-teal-50 text-teal-700">Default</span>}</div><p className="mt-1 text-sm text-zinc-600">{address.address}, {address.city}</p>{address.phone && <p className="mt-1 text-xs text-zinc-500">{address.phone}</p>}{address.delivery_notes && <p className="mt-2 text-xs text-zinc-500">{address.delivery_notes}</p>}</div></div><form action={deleteAddressAction}><input type="hidden" name="address_id" value={address.id} /><button className="icon-button text-rose-600" aria-label="Delete address"><Trash2 size={16} /></button></form></article>) : <div className="surface empty">No saved addresses yet.</div>}</div></section>
      </div>
    </div>
  );
}

