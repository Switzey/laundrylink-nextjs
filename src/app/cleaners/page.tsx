import type { Metadata } from "next";
import { Search } from "lucide-react";
import { CleanerCard } from "@/components/cleaner-card";
import { all } from "@/lib/db";
import { boundedSearchTerm, likePattern } from "@/lib/validation";
import type { Cleaner } from "@/lib/types";

export const metadata: Metadata = { title: "Find a cleaner" };

export default async function CleanersPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const { q, sort = "rating" } = await searchParams;
  const query = boundedSearchTerm(q);
  const search = likePattern(query);
  const orderBy = sort === "name" ? "c.business_name ASC" : sort === "services" ? "services_count DESC" : "c.rating DESC";
  const cleaners = await all<Cleaner>(
    `SELECT c.*, COUNT(DISTINCT s.id) AS services_count, COUNT(DISTINCT r.id) AS reviews_count,
       (SELECT id FROM vendor_files WHERE cleaner_id = c.id AND kind = 'logo') AS logo_file_id,
       (SELECT id FROM vendor_files WHERE cleaner_id = c.id AND kind = 'cover') AS cover_file_id
     FROM cleaners c LEFT JOIN services s ON s.cleaner_id = c.id AND s.is_active = 1 LEFT JOIN reviews r ON r.cleaner_id = c.id
     WHERE c.is_approved = 1 AND c.is_available = 1 AND (c.business_name LIKE ? ESCAPE '\\' OR c.city LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')
     GROUP BY c.id ORDER BY ${orderBy}`,
    search, search, search,
  );
  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Local laundry care</p><h1 className="page-title">Find your cleaner</h1><p className="page-copy">Compare approved cleaners by service, location, rating, and turnaround time.</p></div></div>
      <form className="surface mb-7 grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto]" action="/cleaners">
        <label className="relative"><span className="sr-only">Search cleaners</span><Search className="absolute left-3 top-3 text-zinc-400" size={18} /><input className="field pl-10" name="q" defaultValue={query} maxLength={100} placeholder="Search name, city, or service" /></label>
        <select className="field" name="sort" defaultValue={sort}><option value="rating">Top rated</option><option value="services">Most services</option><option value="name">Name A-Z</option></select>
        <button className="btn-primary" type="submit">Search</button>
      </form>
      {cleaners.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{cleaners.map((cleaner) => <CleanerCard key={cleaner.id} cleaner={cleaner} />)}</div> : <div className="surface empty">No approved cleaners match that search.</div>}
    </div>
  );
}

