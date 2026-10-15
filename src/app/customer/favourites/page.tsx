import type { Metadata } from "next";
import Link from "next/link";
import { HeartOff, MapPin, Star } from "lucide-react";
import { setFavoriteCleanerAction } from "@/app/actions/account";
import { CustomerAccountNav } from "@/components/customer-account-nav";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Favourite cleaners" };
type Favourite = { id: number; business_name: string; city: string; area: string | null; rating: number; bookable: number; starting_price: number | null };

export default async function FavouritesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser("CUSTOMER", { returnTo: "/customer/favourites" });
  const { error } = await searchParams;
  const favourites = await all<Favourite>(
    `SELECT c.id, c.business_name, c.city, c.area, c.rating, ve.bookable,
       (SELECT MIN(s.price) FROM services s WHERE s.cleaner_id = c.id AND s.is_active = 1 AND s.price > 0) AS starting_price
     FROM favorite_cleaners f
     JOIN cleaners c ON c.id = f.cleaner_id
     JOIN vendor_eligibility ve ON ve.cleaner_id = c.id
     WHERE f.user_id = ? AND ve.public_profile = 1
     ORDER BY c.business_name`,
    user.id,
  );
  return <div className="page"><CustomerAccountNav /><div className="page-header"><div><p className="eyebrow">Saved businesses</p><h1 className="page-title">Favourite cleaners</h1><p className="page-copy">Keep trusted laundry businesses close for quicker repeat bookings.</p></div><Link className="btn-primary" href="/cleaners">Find cleaners</Link></div>{error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error.replaceAll("+", " ")}</p>}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{favourites.length ? favourites.map((cleaner) => <article className="surface p-5" key={cleaner.id}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-brand-navy">{cleaner.business_name}</h2><p className="mt-1 flex items-center gap-1 text-sm text-zinc-600"><MapPin size={15} />{cleaner.area || cleaner.city}</p></div><span className="flex items-center gap-1 text-sm font-bold text-amber-800"><Star size={16} fill="currentColor" />{Number(cleaner.rating).toFixed(1)}</span></div><p className="mt-4 text-sm text-zinc-600">{cleaner.starting_price ? `Services from ${money(cleaner.starting_price)}` : "View current services and prices"}</p><div className="mt-5 flex flex-wrap gap-2"><Link className="btn-secondary" href={`/cleaners/${cleaner.id}`}>View profile</Link>{cleaner.bookable ? <Link className="btn-primary" href={`/orders/new?cleaner=${cleaner.id}`}>Book</Link> : null}<form action={setFavoriteCleanerAction}><input type="hidden" name="cleaner_id" value={cleaner.id} /><input type="hidden" name="intent" value="remove" /><button className="icon-button text-rose-600" title="Remove favourite" aria-label={`Remove ${cleaner.business_name} from favourites`}><HeartOff size={16} /></button></form></div></article>) : <div className="surface empty sm:col-span-2 lg:col-span-3">You have not saved any cleaners yet.</div>}</div></div>;
}
