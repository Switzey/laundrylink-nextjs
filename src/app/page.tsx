import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  CalendarCheck2,
  CheckCircle2,
  Footprints,
  House,
  MapPin,
  Package,
  PackageCheck,
  Shirt,
  ShieldCheck,
  Sparkles,
  Star,
  Waves,
} from "lucide-react";
import { CleanerCard } from "@/components/cleaner-card";
import { NearMeButton } from "@/components/near-me-button";
import { getMarketplaceFacets, getMarketplaceVendors, parseMarketplaceFilters } from "@/lib/marketplace";

const categories = [
  { name: "Washing", slug: "washing", icon: Waves, copy: "Everyday wash and fold" },
  { name: "Dry cleaning", slug: "dry-cleaning", icon: Shirt, copy: "Care for suits and delicates" },
  { name: "Ironing", slug: "ironing", icon: Sparkles, copy: "Crisp pressing and finishing" },
  { name: "Bedding", slug: "bedding", icon: BedDouble, copy: "Sheets, duvets, and covers" },
  { name: "Shoes", slug: "shoes", icon: Footprints, copy: "Specialist shoe cleaning" },
  { name: "Curtains", slug: "curtains", icon: House, copy: "Refresh home fabrics" },
  { name: "Other services", slug: "other", icon: Package, copy: "Special and custom items" },
];

export default async function HomePage() {
  const [marketplace, facets] = await Promise.all([
    getMarketplaceVendors(parseMarketplaceFilters({ sort: "recommended" })),
    getMarketplaceFacets(),
  ]);
  const featured = marketplace.filter((vendor) => vendor.is_bookable && Number(vendor.rating) >= 4.5);
  const locations = facets.areas.length ? facets.areas.slice(0, 6) : facets.cities.slice(0, 6);

  return (
    <>
      <section className="relative min-h-[580px] overflow-hidden bg-brand-navy text-white">
        <Image src="/laundrylink-hero.png" alt="LaundryLink order dashboard showing a laundry pickup in progress" fill priority className="object-cover object-center opacity-40" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,25,47,.97)_0%,rgba(11,37,69,.86)_52%,rgba(11,37,69,.25)_100%)]" />
        <div className="shell relative flex min-h-[580px] items-center py-14">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[.13em] text-brand-mint"><Sparkles size={17} /> Laundry day, simplified</p>
            <h1 className="mt-5 max-w-2xl text-5xl font-extrabold leading-[1.04] sm:text-6xl">Laundry pickup and delivery, right where you live.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-blue-100">Compare verified local cleaners, see prices before signup, and book reliable care from pickup to fresh delivery.</p>
            <form action="/cleaners" className="hero-search mt-8">
              <label className="min-w-0 flex-1"><span className="sr-only">Location or service</span><span className="flex items-center gap-2"><MapPin className="shrink-0 text-brand-blue" size={19} /><input name="q" maxLength={100} placeholder="State, city, neighbourhood, or service" /></span></label>
              <button className="btn-primary" type="submit">Find laundry near me <ArrowRight size={18} /></button>
            </form>
            <div className="mt-3 max-w-xs"><NearMeButton /></div>
            <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm text-blue-100"><span className="flex items-center gap-2"><ShieldCheck size={18} className="text-brand-mint" />Verified businesses</span><span className="flex items-center gap-2"><CalendarCheck2 size={18} className="text-brand-mint" />Flexible pickup</span><span className="flex items-center gap-2"><PackageCheck size={18} className="text-brand-mint" />Live tracking</span></div>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-white">
        <div className="shell grid gap-6 py-7 sm:grid-cols-3">
          <div className="flex items-center gap-3"><ShieldCheck className="text-teal-700" size={23} /><div><strong className="block text-brand-navy">Verified cleaners</strong><span className="text-sm text-zinc-500">Identity and business checks</span></div></div>
          <div className="flex items-center gap-3"><Star className="text-amber-600" size={23} /><div><strong className="block text-brand-navy">Customer reviews</strong><span className="text-sm text-zinc-500">From completed LaundryLink orders</span></div></div>
          <div className="flex items-center gap-3"><CheckCircle2 className="text-brand-blue" size={23} /><div><strong className="block text-brand-navy">Clear pricing</strong><span className="text-sm text-zinc-500">Compare before creating an account</span></div></div>
        </div>
      </section>

      <section className="shell py-14">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Browse by service</p><h2 className="mt-2 text-3xl font-bold text-brand-navy">Care for every load</h2></div><Link href="/cleaners" className="btn-ghost">See all services <ArrowRight size={17} /></Link></div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map(({ name, slug, icon: Icon, copy }) => <Link className="category-tile" href={`/services/${slug}`} key={slug}><Icon aria-hidden="true" size={24} /><strong>{name}</strong><span>{copy}</span></Link>)}
        </div>
      </section>

      <section className="border-y border-blue-100 bg-white py-14">
        <div className="shell"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Recommended nearby</p><h2 className="mt-2 text-3xl font-bold text-brand-navy">Featured cleaners</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Featured cleaners are verified, accepting orders, rated 4.5 or higher, and ranked by reviews and completed orders.</p></div><Link href="/cleaners" className="btn-secondary">Browse all <ArrowRight size={17} /></Link></div>
          {featured.length ? <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{featured.slice(0, 3).map((cleaner) => <CleanerCard key={cleaner.id} cleaner={cleaner} />)}</div> : <div className="empty mt-8">Verified cleaners will appear here as LaundryLink launches in each city.</div>}
        </div>
      </section>

      <section className="shell py-14">
        <div className="grid gap-9 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
          <div><p className="eyebrow">How it works</p><h2 className="mt-2 text-3xl font-bold text-brand-navy">Fresh laundry in three clear steps</h2><p className="page-copy">Choose with confidence, schedule around your day, and follow your order from pickup to delivery.</p><Link className="btn-secondary mt-5" href="/how-it-works">See how LaundryLink works</Link></div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {[['01','Choose','Compare services, prices, ratings, coverage, and turnaround.'],['02','Schedule','Select services, quantities, pickup time, and delivery details.'],['03','Track','Follow every status update through completed delivery.']].map(([number,title,copy]) => <li className="border-l-2 border-blue-200 pl-5" key={number}><span className="text-sm font-black text-teal-800">{number}</span><h3 className="mt-3 font-bold text-brand-navy">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-600">{copy}</p></li>)}
          </ol>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-[#eef8f7] py-14">
        <div className="shell grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div><p className="eyebrow">Supported locations</p><h2 className="mt-2 text-3xl font-bold text-brand-navy">Growing neighbourhood by neighbourhood</h2><div className="mt-5 flex flex-wrap gap-2">{locations.map((location) => <Link className="location-chip" href={`/cleaners?area=${encodeURIComponent(location)}`} key={location}><MapPin size={14} />{location}</Link>)}</div></div>
          <div className="max-w-md border-l-2 border-teal-300 pl-6"><h3 className="text-lg font-bold text-brand-navy">Not in your city yet?</h3><p className="mt-2 text-sm leading-6 text-zinc-600">Join as a customer or laundry business and help us choose where LaundryLink opens next.</p><Link className="btn-primary mt-4" href="/waitlist">Get early access</Link></div>
        </div>
      </section>
    </>
  );
}
