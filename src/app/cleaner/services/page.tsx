import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Pause, Play, Trash2 } from "lucide-react";
import { addServiceAction, deleteServiceAction, toggleServiceAction } from "@/app/actions/cleaner";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { VENDOR_MANAGEMENT_ROLES } from "@/lib/types";
import { all } from "@/lib/db";
import { money } from "@/lib/format";
import type { Service } from "@/lib/types";

export const metadata: Metadata = { title: "Manage services" };

export default async function CleanerServicesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser(VENDOR_MANAGEMENT_ROLES, { returnTo: "/cleaner/services" });
  const cleanerId = await cleanerIdForUser(user.id);
  if (cleanerId && !(await all("SELECT id FROM cleaners WHERE id = ? AND verification_status = 'approved'", cleanerId)).length) redirect("/cleaner/onboarding");
  const { error } = await searchParams;
  const services = cleanerId ? await all<Service>("SELECT * FROM services WHERE cleaner_id = ? ORDER BY is_active DESC, name", cleanerId) : [];
  return (
    <div className="page"><div className="page-header"><div><p className="eyebrow">Service catalogue</p><h1 className="page-title">Services and pricing</h1><p className="page-copy">Keep your customer-facing service list clear, current, and bookable.</p></div></div>{error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error.replaceAll("+", " ")}</p>}
      <div className="grid gap-7 lg:grid-cols-[.75fr_1.25fr]"><form action={addServiceAction} className="surface panel form-grid h-fit"><h2 className="section-title">Add a service</h2><label><span className="field-label">Service name</span><input className="field" name="name" required placeholder="Wash and fold" /></label><label><span className="field-label">Category</span><input className="field" name="category" required placeholder="Laundry" /></label><label><span className="field-label">Description</span><textarea className="field min-h-24" name="description" /></label><div className="form-grid two"><label><span className="field-label">Price (NGN)</span><input className="field" name="price" type="number" min="1" step="0.01" required /></label><label><span className="field-label">Pricing unit</span><select className="field" name="unit"><option value="per_item">Per item</option><option value="per_kg">Per kg</option><option value="per_pair">Per pair</option><option value="per_set">Per set</option><option value="flat_rate">Flat rate</option></select></label></div><label><span className="field-label">Turnaround time</span><input className="field" name="turnaround_time" required placeholder="24 - 48 hours" /></label><label className="flex items-center gap-2 text-sm font-semibold text-zinc-700"><input type="checkbox" name="express_available" />Express service available</label><button className="btn-primary" type="submit">Add service</button></form>
      <section><h2 className="section-title">Current services</h2><div className="mt-4 grid gap-3">{services.length ? services.map((service) => <article className="surface flex flex-wrap items-center justify-between gap-4 p-5" key={service.id}><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-brand-navy">{service.name}</h3><span className="badge border-blue-200 bg-blue-50 text-blue-700">{service.category}</span><span className={`badge ${service.is_active ? "border-teal-200 bg-teal-50 text-teal-700" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>{service.is_active ? "Active" : "Paused"}</span></div><p className="mt-1 text-sm text-zinc-600">{service.description}</p><p className="mt-2 font-bold text-brand-blue">{money(service.price)} / {service.unit.replaceAll("_", " ")}<span className="ml-3 font-medium text-zinc-500">{service.turnaround_time}{service.express_available ? " · Express" : ""}</span></p></div><div className="flex gap-2"><form action={toggleServiceAction}><input type="hidden" name="service_id" value={service.id} /><button className="icon-button" title={service.is_active ? "Pause service" : "Activate service"}>{service.is_active ? <Pause size={17} /> : <Play size={17} />}</button></form><form action={deleteServiceAction}><input type="hidden" name="service_id" value={service.id} /><button className="icon-button text-rose-600" title="Delete service"><Trash2 size={17} /></button></form></div></article>) : <div className="surface empty">Add your first bookable service.</div>}</div></section></div>
    </div>
  );
}

