import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3, MapPin, PauseCircle, Sparkles, Star, Truck } from "lucide-react";
import { VendorImage } from "@/components/vendor-image";
import { money } from "@/lib/format";
import type { MarketplaceVendor } from "@/lib/marketplace-model";

export function CleanerCard({ cleaner, compareControl }: { cleaner: MarketplaceVendor; compareControl?: ReactNode }) {
  return (
    <article className="surface flex h-full flex-col overflow-hidden">
      <div className="relative aspect-[16/7] overflow-hidden bg-blue-50"><VendorImage alt={`${cleaner.business_name} storefront`} businessName={cleaner.business_name} className="object-cover" fileId={cleaner.cover_file_id} kind="cover" />{cleaner.has_express ? <span className="absolute left-3 top-3 badge border-white/80 bg-white/95 text-teal-800"><Sparkles size={13} />Express</span> : null}</div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3"><div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-zinc-200"><VendorImage alt={`${cleaner.business_name} logo`} businessName={cleaner.business_name} className="object-cover" fileId={cleaner.logo_file_id} kind="logo" /></div><div><p className="text-xs font-bold uppercase text-teal-800">Verified cleaner</p><h2 className="mt-1 text-xl font-bold text-brand-navy">{cleaner.business_name}</h2></div></div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-800"><Star size={15} fill="currentColor" />{Number(cleaner.rating).toFixed(1)} <span className="font-medium text-amber-700">({cleaner.reviews_count ?? 0})</span></span>
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-600">{cleaner.description || "Professional laundry care with reliable pickup and delivery."}</p>
        <div className="mt-4 grid gap-2 text-sm text-zinc-600">
          <span className="flex items-center gap-2"><MapPin size={16} className="text-brand-blue" />{[cleaner.area, cleaner.city].filter(Boolean).join(", ")}{cleaner.distance_km !== null ? ` · ${cleaner.distance_km.toFixed(1)} km` : ""}</span>
          <span className="flex items-center gap-2"><Clock3 size={16} className="text-brand-teal" />{cleaner.turnaround_time || "Flexible turnaround"}</span>
          <span className="flex items-center gap-2"><Truck size={16} className="text-brand-blue" />Pickup {cleaner.pickup_radius_km} km · delivery {cleaner.delivery_radius_km} km</span>
          {cleaner.is_bookable ? <span className="flex items-center gap-2 font-semibold text-teal-700"><CheckCircle2 size={16} />Accepting orders</span> : <span className="flex items-center gap-2 font-semibold text-amber-700"><PauseCircle size={16} />Currently unavailable</span>}
        </div>
        <div className="mt-5 flex items-end justify-between gap-3 border-t border-zinc-100 pt-4">
          <div><span className="block text-xs font-semibold text-zinc-500">From</span><strong className="text-lg text-brand-navy">{cleaner.starting_price === null ? "Ask for price" : money(cleaner.starting_price)}</strong><span className="block text-xs text-zinc-500">{cleaner.services_count ?? 0} services</span></div>
          <Link href={`/cleaners/${cleaner.id}`} className="btn-primary">View cleaner</Link>
        </div>
        {compareControl && <div className="mt-4 border-t border-zinc-100 pt-3">{compareControl}</div>}
      </div>
    </article>
  );
}

