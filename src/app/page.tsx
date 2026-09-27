import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarCheck2, PackageCheck, ShieldCheck, Sparkles } from "lucide-react";
import { CleanerCard } from "@/components/cleaner-card";
import { all } from "@/lib/db";
import type { Cleaner } from "@/lib/types";

export default async function HomePage() {
  const featured = await all<Cleaner>(
    `SELECT c.*, COUNT(DISTINCT s.id) AS services_count, COUNT(DISTINCT r.id) AS reviews_count
     FROM cleaners c
     LEFT JOIN services s ON s.cleaner_id = c.id AND s.is_active = 1
     LEFT JOIN reviews r ON r.cleaner_id = c.id
     WHERE c.is_approved = 1 AND c.is_available = 1
     GROUP BY c.id ORDER BY c.rating DESC, c.business_name LIMIT 3`,
  );

  return (
    <>
      <section className="relative min-h-[620px] overflow-hidden bg-brand-navy text-white">
        <Image src="/laundrylink-hero.png" alt="LaundryLink order dashboard showing a laundry pickup in progress" fill priority className="object-cover object-center opacity-45" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,25,47,.96)_0%,rgba(11,37,69,.84)_48%,rgba(11,37,69,.28)_100%)]" />
        <div className="shell relative flex min-h-[620px] items-center py-16">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[.13em] text-brand-mint"><Sparkles size={17} /> Laundry day, simplified</p>
            <h1 className="mt-5 text-5xl font-extrabold leading-[1.04] sm:text-6xl">Laundry pickup and delivery you can trust.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-blue-100">Compare verified local cleaners, book the services you need, and follow every step from pickup to fresh delivery.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link href="/cleaners" className="btn-primary">Find a cleaner <ArrowRight size={18} /></Link><Link href="/register" className="btn-secondary border-white/30 bg-white/10 text-white hover:bg-white hover:text-brand-navy">Join LaundryLink</Link></div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-blue-100"><span className="flex items-center gap-2"><ShieldCheck size={18} className="text-brand-mint" />Verified cleaners</span><span className="flex items-center gap-2"><CalendarCheck2 size={18} className="text-brand-mint" />Scheduled pickup</span><span className="flex items-center gap-2"><PackageCheck size={18} className="text-brand-mint" />Live order tracking</span></div>
          </div>
        </div>
      </section>

      <section className="shell py-16">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div><p className="eyebrow">How it works</p><h2 className="mt-2 text-3xl font-bold text-brand-navy">Three steps to fresh laundry</h2><p className="page-copy">LaundryLink keeps booking and delivery clear, with one place to manage every detail.</p></div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[['01','Choose','Compare services, pricing, ratings, and turnaround times.'],['02','Schedule','Select your services, pickup window, and delivery details.'],['03','Track','Follow progress from acceptance through completed delivery.']].map(([n,title,copy]) => <div className="surface panel" key={n}><span className="text-sm font-black text-brand-teal">{n}</span><h3 className="mt-4 font-bold text-brand-navy">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-600">{copy}</p></div>)}
          </div>
        </div>
      </section>

      <section className="border-y border-blue-100 bg-white py-16">
        <div className="shell"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Trusted nearby</p><h2 className="mt-2 text-3xl font-bold text-brand-navy">Featured cleaners</h2></div><Link href="/cleaners" className="btn-secondary">Browse all <ArrowRight size={17} /></Link></div>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{featured.map((cleaner) => <CleanerCard key={cleaner.id} cleaner={cleaner} />)}</div>
        </div>
      </section>
    </>
  );
}
