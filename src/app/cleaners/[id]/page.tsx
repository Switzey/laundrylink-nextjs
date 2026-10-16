import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, Heart, MapPin, PauseCircle, Phone, ShieldCheck, Sparkles, Star, Truck } from "lucide-react";
import { notFound } from "next/navigation";
import { setFavoriteCleanerAction } from "@/app/actions/account";
import { MarketplaceMap } from "@/components/marketplace-map";
import { VendorImage } from "@/components/vendor-image";
import { getCurrentUser } from "@/lib/auth";
import { authPath } from "@/lib/auth-intent";
import { all, one, run } from "@/lib/db";
import { humanize, money } from "@/lib/format";
import { getMarketplaceVendorByIds } from "@/lib/marketplace";
import type { Service } from "@/lib/types";
import { getVendorEligibility } from "@/lib/vendor-eligibility";
import { publicAvailabilityMessage, showPublicBookingAction } from "@/lib/vendor-eligibility-model";

type Review = { id: number; rating: number; comment: string | null; customer_name: string | null; created_at: string; vendor_response: string | null };

async function publicVendor(id: number) {
  return (await getMarketplaceVendorByIds([id]))[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const vendor = await publicVendor(Number((await params).id));
  if (!vendor) return { title: "Cleaner not found", robots: { index: false, follow: false } };
  const location = [vendor.area, vendor.city, vendor.state].filter(Boolean).join(", ");
  return {
    title: `${vendor.business_name} laundry services`,
    description: `${vendor.business_name} offers verified laundry care in ${location}. Compare services, prices, reviews, coverage, and turnaround times.`,
    alternates: { canonical: `/cleaners/${vendor.id}` },
    openGraph: {
      title: vendor.business_name,
      description: vendor.description || `Verified laundry services in ${location}.`,
      type: "website",
    },
  };
}

export default async function CleanerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const cleaner = await publicVendor(id);
  if (!cleaner) notFound();
  await run("UPDATE cleaners SET profile_view_count = profile_view_count + 1 WHERE id = ?", id);

  const [services, reviews, eligibility, user] = await Promise.all([
    all<Service>("SELECT * FROM services WHERE cleaner_id = ? AND is_active = 1 AND price > 0 AND price <= 10000000 ORDER BY category, price, name", id),
    all<Review>(`SELECT r.*, u.name AS customer_name, rr.response AS vendor_response FROM reviews r LEFT JOIN users u ON u.id = r.customer_id LEFT JOIN review_responses rr ON rr.review_id = r.id WHERE r.cleaner_id = ? ORDER BY r.created_at DESC`, id),
    getVendorEligibility(id),
    getCurrentUser(),
  ]);
  if (!eligibility?.publicProfile) notFound();
  const isFavourite = user?.role === "CUSTOMER" && Boolean(await one(
    "SELECT 1 FROM favorite_cleaners WHERE user_id = ? AND cleaner_id = ?",
    user.id,
    id,
  ));
  const availabilityMessage = publicAvailabilityMessage(eligibility);
  const categories = [...new Set(services.map((service) => service.category))];
  const location = [cleaner.area, cleaner.lga, cleaner.state].filter(Boolean).join(", ");
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Laundry",
    name: cleaner.business_name,
    description: cleaner.description,
    telephone: cleaner.phone,
    address: { "@type": "PostalAddress", streetAddress: cleaner.address, addressLocality: cleaner.city, addressRegion: cleaner.state, addressCountry: "NG" },
    aggregateRating: reviews.length ? { "@type": "AggregateRating", ratingValue: Number(cleaner.rating), reviewCount: reviews.length } : undefined,
    priceRange: cleaner.starting_price === null ? undefined : `From ${money(cleaner.starting_price)}`,
  }).replace(/</g, "\\u003c");

  return (
    <div className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      <section className="surface overflow-hidden">
        <div className="relative aspect-[5/2] min-h-56 overflow-hidden bg-blue-50 sm:aspect-[5/1]"><VendorImage alt={`${cleaner.business_name} storefront`} businessName={cleaner.business_name} className="object-cover" fileId={cleaner.cover_file_id} kind="cover" /></div>
        <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><div className="flex items-center gap-4"><div className="relative h-17 w-17 shrink-0 overflow-hidden rounded-md border border-zinc-200"><VendorImage alt={`${cleaner.business_name} logo`} businessName={cleaner.business_name} className="object-cover" fileId={cleaner.logo_file_id} kind="logo" /></div><div><p className="eyebrow flex items-center gap-2"><ShieldCheck size={15} />Verified LaundryLink cleaner</p><h1 className="page-title">{cleaner.business_name}</h1></div></div><p className="page-copy">{cleaner.description || "Professional laundry care with pickup and delivery."}</p><div className="mt-5 flex flex-wrap gap-4 text-sm text-zinc-600"><span className="flex items-center gap-2"><MapPin size={17} className="text-brand-blue" />{cleaner.address}, {location}</span><span className="flex items-center gap-2"><Clock3 size={17} className="text-brand-teal" />{cleaner.turnaround_time || "Flexible turnaround"}</span><span className="flex items-center gap-2"><Phone size={17} className="text-brand-blue" />{cleaner.phone}</span></div></div>
          <div className="flex max-w-sm flex-col items-start gap-3 lg:items-end"><span className="inline-flex items-center gap-1.5 text-lg font-bold text-amber-800"><Star size={20} fill="currentColor" />{Number(cleaner.rating).toFixed(1)} <span className="text-sm font-medium">({reviews.length} reviews)</span></span><span className="text-sm text-zinc-600">From <strong className="text-brand-navy">{cleaner.starting_price === null ? "ask for price" : money(cleaner.starting_price)}</strong></span><div className="flex flex-wrap gap-2">{user?.role === "CUSTOMER" ? <form action={setFavoriteCleanerAction}><input type="hidden" name="cleaner_id" value={cleaner.id} /><input type="hidden" name="intent" value={isFavourite ? "remove" : "add"} /><button className="btn-secondary" type="submit"><Heart size={17} fill={isFavourite ? "currentColor" : "none"} />{isFavourite ? "Saved" : "Save"}</button></form> : !user ? <Link className="btn-secondary" href={authPath("/login", `/cleaners/${cleaner.id}`)}><Heart size={17} />Save</Link> : null}{showPublicBookingAction(eligibility) ? <Link className="btn-primary" href={`/orders/new?cleaner=${cleaner.id}`}>Book this cleaner</Link> : null}</div>{!showPublicBookingAction(eligibility) && <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><span className="mb-1 flex items-center gap-2 font-bold"><PauseCircle size={17} />Bookings paused</span>{availabilityMessage}</div>}</div>
        </div>
      </section>

      <nav className="profile-jump" aria-label="Cleaner profile sections"><a href="#services">Services</a><a href="#coverage">Coverage</a><a href="#hours">Hours</a><a href="#photos">Photos</a><a href="#reviews">Reviews</a></nav>

      <div className="mt-7 grid gap-8 lg:grid-cols-[1.35fr_.65fr]">
        <div className="grid gap-8">
          <section id="services"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Pricing</p><h2 className="section-title mt-1">Services and prices</h2></div><div className="flex flex-wrap gap-2">{categories.map((category) => <span className="badge border-blue-200 bg-blue-50 text-blue-800" key={category}>{humanize(category)}</span>)}</div></div><div className="mt-4 grid gap-3">{services.map((service) => <article className="surface flex items-start justify-between gap-4 p-5" key={service.id}><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-brand-navy">{service.name}</h3><span className="badge border-blue-200 bg-blue-50 text-blue-800">{humanize(service.category)}</span>{service.express_available ? <span className="badge border-teal-200 bg-teal-50 text-teal-800"><Sparkles size={13} />Express</span> : null}</div><p className="mt-1 text-sm leading-6 text-zinc-600">{service.description || "Professional garment care."}</p><p className="mt-2 text-xs font-semibold uppercase text-zinc-500">{humanize(service.unit)} · {service.turnaround_time || cleaner.turnaround_time || "Flexible turnaround"}</p></div><strong className="whitespace-nowrap text-brand-blue">{money(service.price)}</strong></article>)}</div></section>

          <section id="photos"><p className="eyebrow">Business gallery</p><h2 className="section-title mt-1">Photos</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{cleaner.cover_file_id && <figure className="surface overflow-hidden"><div className="relative aspect-[16/10]"><VendorImage alt={`${cleaner.business_name} business location`} businessName={cleaner.business_name} className="object-cover" fileId={cleaner.cover_file_id} kind="cover" /></div><figcaption className="p-3 text-sm font-semibold text-zinc-600">Business cover</figcaption></figure>}{cleaner.logo_file_id && <figure className="surface overflow-hidden"><div className="relative aspect-[16/10] bg-blue-50"><VendorImage alt={`${cleaner.business_name} brand logo`} businessName={cleaner.business_name} className="object-contain p-7" fileId={cleaner.logo_file_id} kind="logo" /></div><figcaption className="p-3 text-sm font-semibold text-zinc-600">Business logo</figcaption></figure>}</div></section>

          <section id="reviews"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Customer feedback</p><h2 className="section-title mt-1">Verified order reviews</h2></div><strong className="text-brand-navy">{Number(cleaner.rating).toFixed(1)} / 5</strong></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{reviews.length ? reviews.slice(0, 8).map((review) => <article className="surface p-4" key={review.id}><div className="flex items-center justify-between"><strong className="text-sm text-brand-navy">{review.customer_name || "Customer"}</strong><span className="text-sm font-bold text-amber-800">{review.rating}/5</span></div><p className="mt-2 text-sm leading-6 text-zinc-600">{review.comment || "A positive LaundryLink experience."}</p>{review.vendor_response&&<div className="mt-3 border-l-2 border-brand-teal pl-3"><p className="text-xs font-bold text-brand-navy">Response from {cleaner.business_name}</p><p className="mt-1 text-sm text-zinc-600">{review.vendor_response}</p></div>}</article>) : <div className="surface p-5 text-sm text-zinc-500">No reviews yet.</div>}</div></section>
        </div>

        <aside className="grid content-start gap-5">
          <section id="coverage" className="surface panel"><div className="flex items-center gap-2"><Truck className="text-brand-blue" size={20} /><h2 className="section-title">Service coverage</h2></div><dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-zinc-500">Operating area</dt><dd className="font-bold text-brand-navy">{location}</dd></div><div><dt className="text-zinc-500">Pickup radius</dt><dd className="font-bold text-brand-navy">{cleaner.pickup_radius_km} km</dd></div><div><dt className="text-zinc-500">Delivery radius</dt><dd className="font-bold text-brand-navy">{cleaner.delivery_radius_km} km</dd></div></dl></section>
          <section id="hours" className="surface panel"><div className="flex items-center gap-2"><Clock3 className="text-teal-700" size={20} /><h2 className="section-title">Opening hours</h2></div><p className="mt-4 text-sm leading-6 text-zinc-600">{cleaner.opening_hours || "Contact the cleaner to confirm today's hours."}</p></section>
          <MarketplaceMap vendors={[cleaner]} />
        </aside>
      </div>
    </div>
  );
}
