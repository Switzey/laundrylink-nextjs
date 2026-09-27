import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, MapPin, Phone, Star } from "lucide-react";
import { notFound } from "next/navigation";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";
import type { Cleaner, Service } from "@/lib/types";

export const metadata: Metadata = { title: "Cleaner profile" };
type Review = { id: number; rating: number; comment: string | null; customer_name: string | null; created_at: string };

export default async function CleanerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const cleaner = await one<Cleaner>("SELECT * FROM cleaners WHERE id = ? AND is_approved = 1", id);
  if (!cleaner) notFound();
  const services = await all<Service>("SELECT * FROM services WHERE cleaner_id = ? AND is_active = 1 ORDER BY name", id);
  const reviews = await all<Review>(`SELECT r.*, u.name AS customer_name FROM reviews r LEFT JOIN users u ON u.id = r.customer_id WHERE r.cleaner_id = ? ORDER BY r.created_at DESC`, id);
  return (
    <div className="page">
      <section className="surface overflow-hidden"><div className="h-2 bg-[linear-gradient(90deg,#2563eb,#60a5fa,#14b8a6,#a7f3e0)]" /><div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="eyebrow">Approved LaundryLink cleaner</p><h1 className="page-title">{cleaner.business_name}</h1><p className="page-copy">{cleaner.description}</p><div className="mt-5 flex flex-wrap gap-4 text-sm text-zinc-600"><span className="flex items-center gap-2"><MapPin size={17} className="text-brand-blue" />{cleaner.address}, {cleaner.city}</span><span className="flex items-center gap-2"><Clock3 size={17} className="text-brand-teal" />{cleaner.turnaround_time || "Flexible turnaround"}</span><span className="flex items-center gap-2"><Phone size={17} className="text-brand-blue" />{cleaner.phone}</span></div></div><div className="flex items-center gap-3"><span className="inline-flex items-center gap-1.5 text-lg font-bold text-amber-700"><Star size={20} fill="currentColor" />{Number(cleaner.rating).toFixed(1)}</span><Link className="btn-primary" href={`/orders/new?cleaner=${cleaner.id}`}>Book this cleaner</Link></div></div></section>
      <div className="mt-7 grid gap-7 lg:grid-cols-[1.4fr_.6fr]"><section><h2 className="section-title">Services and pricing</h2><div className="mt-4 grid gap-3">{services.map((service) => <article className="surface flex items-start justify-between gap-4 p-5" key={service.id}><div><h3 className="font-bold text-brand-navy">{service.name}</h3><p className="mt-1 text-sm leading-6 text-zinc-600">{service.description}</p><p className="mt-2 text-xs font-semibold uppercase text-zinc-500">{service.unit.replaceAll("_", " ")}</p></div><strong className="whitespace-nowrap text-brand-blue">{money(service.price)}</strong></article>)}</div></section>
      <aside><h2 className="section-title">Customer reviews</h2><div className="mt-4 grid gap-3">{reviews.length ? reviews.slice(0,5).map((review) => <article className="surface p-4" key={review.id}><div className="flex items-center justify-between"><strong className="text-sm text-brand-navy">{review.customer_name || "Customer"}</strong><span className="text-sm font-bold text-amber-700">{review.rating}/5</span></div><p className="mt-2 text-sm leading-6 text-zinc-600">{review.comment || "A positive LaundryLink experience."}</p></article>) : <div className="surface p-5 text-sm text-zinc-500">No reviews yet.</div>}</div></aside></div>
    </div>
  );
}
