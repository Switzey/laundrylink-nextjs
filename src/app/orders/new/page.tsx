import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, MapPin, ShoppingBasket } from "lucide-react";
import { createOrderAction } from "@/app/actions/orders";
import { requireUser } from "@/lib/auth";
import { DELIVERY_FEE, PLATFORM_FEE, TIME_WINDOWS } from "@/lib/constants";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";
import type { Cleaner, Service } from "@/lib/types";

export const metadata: Metadata = { title: "Book laundry" };
type Address = { id: number; label: string | null; address: string; city: string; is_default: number };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ cleaner?: string; error?: string }> }) {
  const user = await requireUser("CUSTOMER");
  const { cleaner: cleanerParam, error } = await searchParams;
  const cleaners = await all<Cleaner>("SELECT * FROM cleaners WHERE is_approved = 1 AND is_available = 1 ORDER BY business_name");
  const cleanerId = Number(cleanerParam ?? 0);
  const selectedCleaner = cleanerId ? await one<Cleaner>("SELECT * FROM cleaners WHERE id = ? AND is_approved = 1 AND is_available = 1", cleanerId) : null;
  const services = selectedCleaner ? await all<Service>("SELECT * FROM services WHERE cleaner_id = ? AND is_active = 1 ORDER BY name", selectedCleaner.id) : [];
  const addresses = await all<Address>("SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, label", user.id);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">New order</p><h1 className="page-title">Schedule your laundry</h1><p className="page-copy">Choose a cleaner, select services, then set the pickup and delivery details.</p></div></div>
      {error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error.replaceAll("+", " ")}</p>}
      <form action="/orders/new" className="surface mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto]"><select className="field" name="cleaner" defaultValue={selectedCleaner?.id ?? ""} required><option value="" disabled>Choose an approved cleaner</option>{cleaners.map((cleaner) => <option key={cleaner.id} value={cleaner.id}>{cleaner.business_name} - {cleaner.city}</option>)}</select><button className="btn-secondary" type="submit">Load services</button></form>
      {selectedCleaner ? <form action={createOrderAction} className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
        <input type="hidden" name="cleaner_id" value={selectedCleaner.id} />
        <div className="grid gap-6"><section className="surface panel"><div className="flex items-center gap-2"><ShoppingBasket className="text-brand-blue" size={21} /><h2 className="section-title">Services from {selectedCleaner.business_name}</h2></div><div className="mt-5 grid gap-3">{services.map((service) => <label className="surface-muted grid grid-cols-[1fr_5.5rem] items-center gap-4 p-4" key={service.id}><span><strong className="block text-brand-navy">{service.name}</strong><span className="mt-1 block text-sm text-zinc-600">{service.description}</span><span className="mt-2 block text-sm font-bold text-brand-blue">{money(service.price)} / {service.unit.replaceAll("_", " ")}</span></span><span><span className="field-label">Quantity</span><input className="field" type="number" min="0" max="100" defaultValue="0" name={`service_${service.id}`} /></span></label>)}</div></section>
          <section className="surface panel"><div className="flex items-center gap-2"><CalendarDays className="text-brand-teal" size={21} /><h2 className="section-title">Schedule</h2></div><div className="form-grid two mt-5"><label><span className="field-label">Pickup date</span><input className="field" type="date" min={today} name="pickup_date" required /></label><label><span className="field-label">Pickup window</span><select className="field" name="pickup_time_window" required><option value="">Choose window</option>{TIME_WINDOWS.map((window) => <option key={window}>{window}</option>)}</select></label><label><span className="field-label">Delivery date</span><input className="field" type="date" min={today} name="delivery_date" /></label><label><span className="field-label">Delivery window</span><select className="field" name="delivery_time_window"><option value="">Choose window</option>{TIME_WINDOWS.map((window) => <option key={window}>{window}</option>)}</select></label></div></section>
          <section className="surface panel"><div className="flex items-center gap-2"><MapPin className="text-brand-blue" size={21} /><h2 className="section-title">Addresses and notes</h2></div><div className="form-grid two mt-5"><label><span className="field-label">Saved pickup address</span><select className="field" name="pickup_address_id" defaultValue={addresses.find((a) => a.is_default)?.id ?? ""}><option value="">Enter manually</option>{addresses.map((address) => <option value={address.id} key={address.id}>{address.label || address.address} - {address.city}</option>)}</select></label><label><span className="field-label">Saved delivery address</span><select className="field" name="delivery_address_id" defaultValue={addresses.find((a) => a.is_default)?.id ?? ""}><option value="">Enter manually</option>{addresses.map((address) => <option value={address.id} key={address.id}>{address.label || address.address} - {address.city}</option>)}</select></label><label><span className="field-label">Manual pickup address</span><input className="field" name="pickup_address" /></label><label><span className="field-label">Manual delivery address</span><input className="field" name="delivery_address" /></label><label><span className="field-label">Pickup notes</span><textarea className="field min-h-24" name="pickup_notes" /></label><label><span className="field-label">Delivery notes</span><textarea className="field min-h-24" name="delivery_notes" /></label><label className="sm:col-span-2"><span className="field-label">Care notes</span><textarea className="field min-h-24" name="notes" placeholder="Stains, delicate items, or special handling" /></label></div>{!addresses.length && <p className="mt-4 text-sm text-zinc-500">Save addresses for faster booking from <Link className="font-bold text-brand-blue" href="/customer/addresses">your address book</Link>.</p>}</section></div>
        <aside className="surface panel h-fit lg:sticky lg:top-24"><h2 className="section-title">Order summary</h2><div className="mt-5 grid gap-3 text-sm"><div className="flex justify-between"><span className="text-zinc-500">Cleaner</span><strong>{selectedCleaner.business_name}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Delivery fee</span><strong>{money(DELIVERY_FEE)}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Platform fee</span><strong>{money(PLATFORM_FEE)}</strong></div><p className="border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500">Service totals are calculated from the quantities you select and confirmed when you create the order.</p></div><button className="btn-primary mt-5 w-full" type="submit">Create order</button></aside>
      </form> : <div className="surface empty">Choose a cleaner above to view services and continue.</div>}
    </div>
  );
}
