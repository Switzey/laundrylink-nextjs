import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgePercent, MapPinned, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import {
  addBulkDiscountAction, addDeliveryZoneAction, addServiceAction, deleteBulkDiscountAction,
  deleteDeliveryZoneAction, deleteServiceAction, toggleServiceAction, updatePricingSettingsAction,
  updateServiceAction,
} from "@/app/actions/cleaner";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";
import { PRICING_UNITS, SERVICE_CATEGORIES } from "@/lib/pricing-engine";
import type { Cleaner, Service } from "@/lib/types";
import { VENDOR_MANAGEMENT_ROLES } from "@/lib/types";

export const metadata: Metadata = { title: "Manage services" };
type Discount = { id: number; service_id: number; minimum_quantity: number; discount_type: "percentage" | "fixed"; discount_value: number };
type DeliveryZone = { id: number; name: string; pricing_type: "fixed" | "distance" | "free"; base_fee: number; per_km_fee: number; minimum_fee: number; maximum_fee: number | null; radius_km: number | null };
const unitLabel = (unit: string) => unit.replace("per_", "per ").replaceAll("_", " ");

function ServiceFields({ service }: { service?: Service }) {
  return <>
    <label><span className="field-label">Service name</span><input className="field" name="name" required defaultValue={service?.name} placeholder="Wash and fold" /></label>
    <label><span className="field-label">Category</span><select className="field" name="category" required defaultValue={service?.category ?? SERVICE_CATEGORIES[0]}>{SERVICE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
    <label><span className="field-label">Description</span><textarea className="field min-h-20" name="description" defaultValue={service?.description ?? ""} /></label>
    <div className="form-grid two">
      <label><span className="field-label">Price (NGN)</span><input className="field" name="price" type="number" min="1" max="10000000" step="0.01" required defaultValue={service?.price} /></label>
      <label><span className="field-label">Pricing unit</span><select className="field" name="unit" defaultValue={service?.unit ?? "per_item"}>{PRICING_UNITS.map((unit) => <option value={unit} key={unit}>{unitLabel(unit)}</option>)}</select></label>
      <label><span className="field-label">Minimum quantity</span><input className="field" name="minimum_quantity" type="number" min="0.1" step="0.1" required defaultValue={service?.minimum_quantity ?? 1} /></label>
      <label><span className="field-label">Quantity step</span><input className="field" name="quantity_step" type="number" min="0.1" step="0.1" required defaultValue={service?.quantity_step ?? 1} /></label>
    </div>
    <label><span className="field-label">Turnaround time</span><input className="field" name="turnaround_time" required defaultValue={service?.turnaround_time ?? ""} placeholder="24 - 48 hours" /></label>
    <label><span className="field-label">Package contents (flat-rate services)</span><input className="field" name="package_details" defaultValue={service?.package_details ?? ""} placeholder="5 shirts and 3 trousers" /></label>
    <div className="grid gap-3 border-y border-zinc-200 py-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700"><input type="checkbox" name="express_available" defaultChecked={Boolean(service?.express_available)} />Express option available</label>
      <div className="form-grid two"><label><span className="field-label">Express fee type</span><select className="field" name="express_fee_type" defaultValue={service?.express_fee_type ?? "fixed"}><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select></label><label><span className="field-label">Express fee</span><input className="field" name="express_fee_value" type="number" min="0" step="0.01" defaultValue={service?.express_fee_value ?? 0} /></label></div>
      <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700"><input type="checkbox" name="special_treatment_available" defaultChecked={Boolean(service?.special_treatment_available)} />Special treatment available</label>
      <label><span className="field-label">Treatment fee per unit</span><input className="field" name="special_treatment_fee" type="number" min="0" step="0.01" defaultValue={service?.special_treatment_fee ?? 0} /></label>
      <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700"><input type="checkbox" name="requires_final_confirmation" defaultChecked={Boolean(service?.requires_final_confirmation)} />Quantity is estimated until pickup</label>
    </div>
  </>;
}

export default async function CleanerServicesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const user = await requireUser(VENDOR_MANAGEMENT_ROLES, { returnTo: "/cleaner/services" });
  const cleanerId = await cleanerIdForUser(user.id);
  if (cleanerId && !(await all("SELECT id FROM cleaners WHERE id = ? AND verification_status = 'approved'", cleanerId)).length) redirect("/cleaner/onboarding");
  const { error, success } = await searchParams;
  const cleaner = cleanerId ? await one<Cleaner>("SELECT * FROM cleaners WHERE id = ?", cleanerId) : null;
  const services = cleanerId ? await all<Service>("SELECT * FROM services WHERE cleaner_id = ? ORDER BY is_active DESC, category, name", cleanerId) : [];
  const discounts = cleanerId ? await all<Discount>("SELECT d.* FROM service_bulk_discounts d JOIN services s ON s.id = d.service_id WHERE s.cleaner_id = ? AND d.is_active = 1 ORDER BY d.minimum_quantity", cleanerId) : [];
  const zones = cleanerId ? await all<DeliveryZone>("SELECT * FROM delivery_zones WHERE cleaner_id = ? AND is_active = 1 ORDER BY name", cleanerId) : [];
  const discountsByService = new Map<number, Discount[]>();
  for (const discount of discounts) discountsByService.set(discount.service_id, [...(discountsByService.get(discount.service_id) ?? []), discount]);

  return <div className="page">
    <div className="page-header"><div><p className="eyebrow">Service catalogue</p><h1 className="page-title">Services and pricing</h1><p className="page-copy">Set independent prices, quantity rules, optional care, discounts, and delivery charges.</p></div></div>
    {error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error.replaceAll("+", " ")}</p>}
    {success && <p className="mb-5 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{success.replaceAll("+", " ")}</p>}
    {cleaner && <section className="surface panel mb-7">
      <div className="flex items-center gap-2"><MapPinned size={20} className="text-brand-teal" /><h2 className="section-title">Order and delivery rules</h2></div>
      <form action={updatePricingSettingsAction} className="form-grid mt-5"><div className="form-grid two">
        <label><span className="field-label">Minimum order (NGN)</span><input className="field" name="minimum_order_amount" type="number" min="0" step="0.01" defaultValue={cleaner.minimum_order_amount} required /></label>
        <label><span className="field-label">Default delivery method</span><select className="field" name="delivery_pricing_type" defaultValue={cleaner.delivery_pricing_type}><option value="fixed">Fixed fee</option><option value="distance">Distance based</option><option value="free">Free</option></select></label>
        <label><span className="field-label">Base delivery fee</span><input className="field" name="base_delivery_fee" type="number" min="0" step="0.01" defaultValue={cleaner.base_delivery_fee} required /></label>
        <label><span className="field-label">Fee per km</span><input className="field" name="delivery_fee_per_km" type="number" min="0" step="0.01" defaultValue={cleaner.delivery_fee_per_km} required /></label>
        <label><span className="field-label">Free delivery from (optional)</span><input className="field" name="free_delivery_threshold" type="number" min="0" step="0.01" defaultValue={cleaner.free_delivery_threshold ?? ""} /></label>
      </div><button className="btn-secondary w-fit" type="submit">Save order rules</button></form>
      <div className="mt-6 border-t border-zinc-200 pt-5"><h3 className="font-bold text-brand-navy">Delivery zones</h3>
        <form action={addDeliveryZoneAction} className="mt-3 grid gap-3 md:grid-cols-4"><input className="field" name="name" required placeholder="Lekki zone" /><select className="field" name="pricing_type"><option value="fixed">Fixed</option><option value="distance">Distance</option><option value="free">Free</option></select><input className="field" name="base_fee" type="number" min="0" step="0.01" required placeholder="Base fee" /><input className="field" name="per_km_fee" type="number" min="0" step="0.01" required placeholder="Fee / km" /><input className="field" name="minimum_fee" type="number" min="0" step="0.01" required placeholder="Minimum fee" /><input className="field" name="maximum_fee" type="number" min="0" step="0.01" placeholder="Maximum fee" /><input className="field" name="radius_km" type="number" min="0.1" max="250" step="0.1" placeholder="Radius (km)" /><button className="btn-secondary" type="submit"><Plus size={16} />Add zone</button></form>
        <div className="mt-3 flex flex-wrap gap-2">{zones.map((zone) => <span className="badge gap-2 border-zinc-200 bg-zinc-50 text-zinc-700" key={zone.id}>{zone.name}: {zone.pricing_type === "free" ? "Free" : `${money(zone.base_fee)}${zone.pricing_type === "distance" ? ` + ${money(zone.per_km_fee)}/km` : ""}`}<form action={deleteDeliveryZoneAction}><input type="hidden" name="zone_id" value={zone.id} /><button title="Delete delivery zone" className="text-rose-600"><Trash2 size={13} /></button></form></span>)}</div>
      </div>
    </section>}
    <div className="grid gap-7 lg:grid-cols-[.72fr_1.28fr]">
      <form action={addServiceAction} className="surface panel form-grid h-fit"><div className="flex items-center gap-2"><Plus size={20} className="text-brand-blue" /><h2 className="section-title">Add a service</h2></div><ServiceFields /><button className="btn-primary" type="submit">Add service</button></form>
      <section><h2 className="section-title">Current services</h2><div className="mt-4 grid gap-3">{services.length ? services.map((service) => {
        const serviceDiscounts = discountsByService.get(service.id) ?? [];
        return <article className="surface p-5" key={service.id}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-brand-navy">{service.name}</h3><span className="badge border-blue-200 bg-blue-50 text-blue-700">{service.category}</span><span className={`badge ${service.is_active ? "border-teal-200 bg-teal-50 text-teal-700" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>{service.is_active ? "Active" : "Paused"}</span>{service.requires_final_confirmation ? <span className="badge border-amber-200 bg-amber-50 text-amber-800">Estimate at booking</span> : null}</div><p className="mt-1 text-sm text-zinc-600">{service.description}</p><p className="mt-2 font-bold text-brand-blue">{money(service.price)} / {unitLabel(service.unit)}<span className="ml-3 font-medium text-zinc-500">{service.turnaround_time}{service.express_available ? ` · Express +${service.express_fee_type === "percentage" ? `${service.express_fee_value}%` : money(service.express_fee_value)}` : ""}</span></p>{service.package_details && <p className="mt-2 text-xs text-zinc-500">Includes: {service.package_details}</p>}</div><div className="flex gap-2"><form action={toggleServiceAction}><input type="hidden" name="service_id" value={service.id} /><button className="icon-button" title={service.is_active ? "Pause service" : "Activate service"}>{service.is_active ? <Pause size={17} /> : <Play size={17} />}</button></form><form action={deleteServiceAction}><input type="hidden" name="service_id" value={service.id} /><button className="icon-button text-rose-600" title="Delete service"><Trash2 size={17} /></button></form></div></div>
          <div className="mt-4 flex flex-wrap gap-2">{serviceDiscounts.map((discount) => <span className="badge gap-2 border-teal-200 bg-teal-50 text-teal-800" key={discount.id}>From {discount.minimum_quantity}: {discount.discount_type === "percentage" ? `${discount.discount_value}% off` : `${money(discount.discount_value)} off`}<form action={deleteBulkDiscountAction}><input type="hidden" name="discount_id" value={discount.id} /><button title="Delete discount"><Trash2 size={12} /></button></form></span>)}</div>
          <details className="mt-4 border-t border-zinc-200 pt-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-brand-blue"><Pencil size={15} />Edit pricing and service</summary><form action={updateServiceAction} className="form-grid mt-4"><input type="hidden" name="service_id" value={service.id} /><ServiceFields service={service} /><button className="btn-secondary w-fit" type="submit">Save changes</button></form></details>
          <details className="mt-3"><summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-brand-teal"><BadgePercent size={15} />Add bulk discount</summary><form action={addBulkDiscountAction} className="mt-3 grid gap-3 sm:grid-cols-4"><input type="hidden" name="service_id" value={service.id} /><input className="field" name="minimum_quantity" type="number" min="0.1" step="0.1" required placeholder="From quantity" /><select className="field" name="discount_type"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select><input className="field" name="discount_value" type="number" min="0.01" step="0.01" required placeholder="Discount" /><button className="btn-secondary" type="submit">Save discount</button></form></details>
        </article>;
      }) : <div className="surface empty">Add your first bookable service.</div>}</div></section>
    </div>
  </div>;
}
