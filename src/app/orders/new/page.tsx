import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, ShoppingBasket } from "lucide-react";
import { createOrderAction } from "@/app/actions/orders";
import { OrderIntentForm } from "@/components/order-intent-form";
import { dashboardForRole, getCurrentUser } from "@/lib/auth";
import { DELIVERY_FEE, PLATFORM_FEE, TIME_WINDOWS } from "@/lib/constants";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";
import type { Cleaner, Service } from "@/lib/types";

export const metadata: Metadata = { title: "Book laundry" };
type Address = { id: number; label: string | null; address: string; city: string; is_default: number };
type ReorderItem = { service_id: number; quantity: number };
type CustomerPreferences = { fragrance_preference: string | null; detergent_sensitivity: string | null; ironing_instructions: string | null; folding_style: string | null; special_garment_care: string | null };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ cleaner?: string; error?: string; resume?: string; reorder?: string }> }) {
  const { cleaner: cleanerParam, error, resume, reorder: reorderParam } = await searchParams;
  const user = await getCurrentUser();
  if (user && user.role !== "CUSTOMER") redirect(dashboardForRole(user.role));
  const cleaners = await all<Cleaner>(`SELECT c.* FROM cleaners c
    JOIN vendor_eligibility ve ON ve.cleaner_id = c.id
    WHERE ve.bookable = 1 ORDER BY c.business_name`);
  const parsedCleanerId = Number(cleanerParam ?? 0);
  const cleanerId = Number.isSafeInteger(parsedCleanerId) && parsedCleanerId > 0 ? parsedCleanerId : 0;
  const selectedCleaner = cleanerId ? await one<Cleaner>(`SELECT c.* FROM cleaners c
    JOIN vendor_eligibility ve ON ve.cleaner_id = c.id
    WHERE c.id = ? AND ve.bookable = 1`, cleanerId) : null;
  const services = selectedCleaner ? await all<Service>(`SELECT * FROM services
    WHERE cleaner_id = ? AND is_active = 1 AND price > 0 AND price <= 10000000 ORDER BY name`, selectedCleaner.id) : [];
  const addresses = user ? await all<Address>("SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, label", user.id) : [];
  const preferences = user ? await one<CustomerPreferences>("SELECT * FROM customer_preferences WHERE user_id = ?", user.id) : null;
  const parsedReorderId = Number(reorderParam ?? 0);
  const reorderId = Number.isSafeInteger(parsedReorderId) && parsedReorderId > 0 ? parsedReorderId : 0;
  const reorderOrder = user && selectedCleaner && reorderId ? await one<{ id: number; notes: string | null }>(
    "SELECT id, notes FROM orders WHERE id = ? AND customer_id = ? AND cleaner_id = ?",
    reorderId,
    user.id,
    selectedCleaner.id,
  ) : null;
  const reorderItems = reorderOrder ? await all<ReorderItem>(
    `SELECT oi.service_id, oi.quantity FROM order_items oi
     JOIN services s ON s.id = oi.service_id
     WHERE oi.order_id = ? AND s.cleaner_id = ? AND s.is_active = 1 AND s.price > 0 AND s.price <= 10000000`,
    reorderOrder.id,
    selectedCleaner?.id ?? 0,
  ) : [];
  const reorderQuantities = new Map(reorderItems.map((item) => [Number(item.service_id), Number(item.quantity)]));
  const savedCareNotes = preferences ? [
    preferences.fragrance_preference && `Fragrance: ${preferences.fragrance_preference}`,
    preferences.detergent_sensitivity && `Detergent sensitivity: ${preferences.detergent_sensitivity}`,
    preferences.ironing_instructions && `Ironing: ${preferences.ironing_instructions}`,
    preferences.folding_style && `Folding: ${preferences.folding_style}`,
    preferences.special_garment_care && `Special care: ${preferences.special_garment_care}`,
  ].filter(Boolean).join("\n") : "";
  const returnTo = selectedCleaner
    ? `/orders/new?cleaner=${selectedCleaner.id}${reorderOrder ? `&reorder=${reorderOrder.id}` : ""}&resume=1`
    : "/orders/new";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">New order</p><h1 className="page-title">Schedule your laundry</h1><p className="page-copy">Choose a cleaner, select services, then set the pickup and delivery details.</p></div></div>
      {error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error.replaceAll("+", " ")}</p>}
      {reorderOrder && <p className="mb-5 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Order #{reorderOrder.id} has been loaded with currently available services and today&apos;s prices. Confirm the quantities and schedule before creating the new order.</p>}
      <form action="/orders/new" className="surface mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto]"><select className="field" name="cleaner" defaultValue={selectedCleaner?.id ?? ""} required><option value="" disabled>Choose an approved cleaner</option>{cleaners.map((cleaner) => <option key={cleaner.id} value={cleaner.id}>{cleaner.business_name} - {cleaner.city}</option>)}</select><button className="btn-secondary" type="submit">Load services</button></form>
      {selectedCleaner ? <OrderIntentForm
        action={createOrderAction}
        authenticated={Boolean(user)}
        cleanerId={selectedCleaner.id}
        returnTo={returnTo}
        resumeDraft={resume === "1"}
      >
        <input type="hidden" name="cleaner_id" value={selectedCleaner.id} />
        <div className="grid gap-6"><section className="surface panel"><div className="flex items-center gap-2"><ShoppingBasket className="text-brand-blue" size={21} /><h2 className="section-title">Services from {selectedCleaner.business_name}</h2></div><div className="mt-5 grid gap-3">{services.map((service) => <label className="surface-muted grid grid-cols-[1fr_5.5rem] items-center gap-4 p-4" key={service.id}><span><strong className="block text-brand-navy">{service.name}</strong><span className="mt-1 block text-sm text-zinc-600">{service.description}</span><span className="mt-2 block text-sm font-bold text-brand-blue">{money(service.price)} / {service.unit.replaceAll("_", " ")}</span></span><span><span className="field-label">Quantity</span><input className="field" type="number" min="0" max="100" defaultValue={reorderQuantities.get(service.id) ?? 0} name={`service_${service.id}`} /></span></label>)}</div></section>
          <section className="surface panel"><div className="flex items-center gap-2"><CalendarDays className="text-brand-teal" size={21} /><h2 className="section-title">Schedule</h2></div><div className="form-grid two mt-5"><label><span className="field-label">Pickup date</span><input className="field" type="date" min={today} name="pickup_date" required /></label><label><span className="field-label">Pickup window</span><select className="field" name="pickup_time_window" required><option value="">Choose window</option>{TIME_WINDOWS.map((window) => <option key={window}>{window}</option>)}</select></label><label><span className="field-label">Delivery date</span><input className="field" type="date" min={today} name="delivery_date" /></label><label><span className="field-label">Delivery window</span><select className="field" name="delivery_time_window"><option value="">Choose window</option>{TIME_WINDOWS.map((window) => <option key={window}>{window}</option>)}</select></label></div></section>
          <section className="surface panel"><div className="flex items-center gap-2"><MapPin className="text-brand-blue" size={21} /><h2 className="section-title">Addresses and notes</h2></div><div className="form-grid two mt-5"><label><span className="field-label">Saved pickup address</span><select className="field" name="pickup_address_id" defaultValue={addresses.find((a) => a.is_default)?.id ?? ""}><option value="">Enter manually</option>{addresses.map((address) => <option value={address.id} key={address.id}>{address.label || address.address} - {address.city}</option>)}</select></label><label><span className="field-label">Saved delivery address</span><select className="field" name="delivery_address_id" defaultValue={addresses.find((a) => a.is_default)?.id ?? ""}><option value="">Enter manually</option>{addresses.map((address) => <option value={address.id} key={address.id}>{address.label || address.address} - {address.city}</option>)}</select></label><label><span className="field-label">Manual pickup address</span><input className="field" name="pickup_address" /></label><label><span className="field-label">Manual delivery address</span><input className="field" name="delivery_address" /></label><label><span className="field-label">Pickup notes</span><textarea className="field min-h-24" name="pickup_notes" /></label><label><span className="field-label">Delivery notes</span><textarea className="field min-h-24" name="delivery_notes" /></label><label className="sm:col-span-2"><span className="field-label">Care notes</span><textarea className="field min-h-24" name="notes" defaultValue={reorderOrder?.notes ?? savedCareNotes} placeholder="Stains, delicate items, or special handling" /></label></div>{!addresses.length && <p className="mt-4 text-sm text-zinc-500">Save addresses for faster booking from <Link className="font-bold text-brand-blue" href="/customer/addresses">your address book</Link>.</p>}</section></div>
        <aside className="surface panel h-fit lg:sticky lg:top-24"><h2 className="section-title">Order summary</h2><div className="mt-5 grid gap-3 text-sm"><div className="flex justify-between"><span className="text-zinc-500">Cleaner</span><strong>{selectedCleaner.business_name}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Delivery fee</span><strong>{money(DELIVERY_FEE)}</strong></div><div className="flex justify-between"><span className="text-zinc-500">Platform fee</span><strong>{money(PLATFORM_FEE)}</strong></div><p className="border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500">Service totals are calculated from the quantities you select and confirmed when you create the order.</p></div><button className="btn-primary mt-5 w-full" type="submit">{user ? "Create order" : "Continue to sign in"}</button></aside>
      </OrderIntentForm> : <div className="surface empty">Choose a cleaner above to view services and continue.</div>}
    </div>
  );
}
