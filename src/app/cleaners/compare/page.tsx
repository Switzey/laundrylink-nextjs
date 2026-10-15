import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Minus, PauseCircle } from "lucide-react";
import { all } from "@/lib/db";
import { money } from "@/lib/format";
import { getMarketplaceVendorByIds } from "@/lib/marketplace";
import type { Service } from "@/lib/types";
import { DELIVERY_FEE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Compare laundry cleaners",
  description: "Compare verified laundry businesses by price, rating, turnaround, delivery coverage, and services.",
  robots: { index: false, follow: true },
};

function parseIds(value: string | string[] | undefined) {
  const source = Array.isArray(value) ? value.join(",") : value ?? "";
  return [...new Set(source.split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 3);
}

export default async function CompareCleanersPage({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const ids = parseIds((await searchParams).ids);
  const vendors = await getMarketplaceVendorByIds(ids);
  const services = ids.length ? await all<Service>(
    `SELECT * FROM services WHERE cleaner_id IN (${ids.map(() => "?").join(",")}) AND is_active = 1 ORDER BY category, name`,
    ...ids,
  ) : [];

  if (vendors.length < 2) {
    return <div className="page"><section className="surface empty"><h1 className="text-2xl font-bold text-brand-navy">Choose at least two cleaners</h1><p className="mx-auto mt-2 max-w-xl">Select the Compare option on two or three directory cards to review them side by side.</p><Link className="btn-primary mt-5" href="/cleaners">Browse cleaners</Link></section></div>;
  }

  const rows = [
    { label: "Starting price", render: (id: number) => { const vendor = vendors.find((item) => item.id === id)!; return vendor.starting_price === null ? "Ask for price" : money(vendor.starting_price); } },
    { label: "Rating", render: (id: number) => { const vendor = vendors.find((item) => item.id === id)!; return `${Number(vendor.rating).toFixed(1)} from ${vendor.reviews_count ?? 0} reviews`; } },
    { label: "Turnaround", render: (id: number) => vendors.find((item) => item.id === id)!.turnaround_time || "Flexible" },
    { label: "Pickup coverage", render: (id: number) => `${vendors.find((item) => item.id === id)!.pickup_radius_km} km` },
    { label: "Delivery coverage", render: (id: number) => `${vendors.find((item) => item.id === id)!.delivery_radius_km} km` },
    { label: "Pickup and delivery charge", render: () => money(DELIVERY_FEE) },
    { label: "Express service", render: (id: number) => Number(vendors.find((item) => item.id === id)!.has_express) ? "Available" : "Not listed" },
    { label: "Active services", render: (id: number) => String(vendors.find((item) => item.id === id)!.services_count ?? 0) },
  ];

  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Side-by-side</p><h1 className="page-title">Compare cleaners</h1><p className="page-copy">Review prices, coverage, reputation, and active services before you book.</p></div><Link className="btn-secondary" href="/cleaners">Back to results</Link></div>
      <div className="surface overflow-x-auto">
        <table className="comparison-table">
          <thead><tr><th scope="col">Comparison</th>{vendors.map((vendor) => <th scope="col" key={vendor.id}><Link href={`/cleaners/${vendor.id}`}>{vendor.business_name}</Link><span>{vendor.area || vendor.city}</span></th>)}</tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th>{vendors.map((vendor) => <td key={vendor.id}>{row.render(vendor.id)}</td>)}</tr>)}
            <tr><th scope="row">Services</th>{vendors.map((vendor) => <td key={vendor.id}><ul className="grid gap-2">{services.filter((service) => service.cleaner_id === vendor.id).slice(0, 6).map((service) => <li key={service.id}><strong>{service.name}</strong><span>{money(service.price)} / {service.unit.replaceAll("_", " ")}</span></li>)}</ul></td>)}</tr>
            <tr><th scope="row">Booking</th>{vendors.map((vendor) => <td key={vendor.id}>{vendor.is_bookable ? <><span className="mb-3 flex items-center gap-2 text-sm font-bold text-teal-700"><CheckCircle2 size={16} />Accepting orders</span><Link className="btn-primary" href={`/orders/new?cleaner=${vendor.id}`}>Book now</Link></> : <span className="flex items-center gap-2 text-sm font-bold text-amber-700"><PauseCircle size={16} />Bookings paused</span>}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><Minus size={14} />Prices shown are starting service prices. Your final total depends on selected quantities and delivery details.</p>
    </div>
  );
}
