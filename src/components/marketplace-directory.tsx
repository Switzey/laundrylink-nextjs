import Link from "next/link";
import { List, Map, Search, SlidersHorizontal } from "lucide-react";
import { MarketplaceMap } from "@/components/marketplace-map";
import { NearMeButton } from "@/components/near-me-button";
import { VendorResults } from "@/components/vendor-results";
import { humanize } from "@/lib/format";
import {
  getMarketplaceFacets,
  getMarketplaceVendors,
  marketplacePath,
  parseMarketplaceFilters,
  type MarketplaceSearchParams,
} from "@/lib/marketplace";

type MarketplaceDirectoryProps = {
  searchParams: MarketplaceSearchParams;
  action?: string;
  preset?: MarketplaceSearchParams;
  eyebrow?: string;
  title?: string;
  description?: string;
};

function selectOptions(values: string[], selected: string) {
  return selected && !values.some((value) => value.toLocaleLowerCase() === selected.toLocaleLowerCase())
    ? [selected, ...values]
    : values;
}

export async function MarketplaceDirectory({
  searchParams,
  action = "/cleaners",
  preset = {},
  eyebrow = "Local laundry care",
  title = "Find laundry near you",
  description = "Compare verified cleaners by location, service, price, rating, and turnaround time.",
}: MarketplaceDirectoryProps) {
  const filters = parseMarketplaceFilters({ ...searchParams, ...preset });
  const [vendors, facets] = await Promise.all([getMarketplaceVendors(filters), getMarketplaceFacets()]);

  return (
    <div className="page">
      <div className="page-header">
        <div><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="page-copy">{description}</p></div>
        <Link className="btn-secondary" href="/waitlist">Can&apos;t find your city?</Link>
      </div>

      <form className="surface marketplace-filters" action={action}>
        {filters.latitude !== null && <input type="hidden" name="lat" value={filters.latitude} />}
        {filters.longitude !== null && <input type="hidden" name="lng" value={filters.longitude} />}
        <input type="hidden" name="view" value={filters.view} />
        <div className="marketplace-search-row">
          <label className="relative min-w-0 flex-1"><span className="field-label">Search</span><Search className="absolute bottom-3 left-3 text-zinc-400" size={18} /><input className="field pl-10" name="q" defaultValue={filters.q} maxLength={100} placeholder="Cleaner, city, neighbourhood, or service" /></label>
          <label><span className="field-label">State</span><select className="field" name="state" defaultValue={filters.state}><option value="">All states</option>{selectOptions(facets.states, filters.state).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span className="field-label">City or LGA</span><select className="field" name="city" defaultValue={filters.city}><option value="">All cities</option>{selectOptions(facets.cities, filters.city).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span className="field-label">Neighbourhood</span><select className="field" name="area" defaultValue={filters.area}><option value="">All areas</option>{selectOptions(facets.areas, filters.area).map((value) => <option key={value}>{value}</option>)}</select></label>
          <button className="btn-primary self-end" type="submit">Search</button>
        </div>

        <div className="mt-4 grid gap-3 border-t border-zinc-200 pt-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <details className="filter-details" open={Boolean(filters.category || filters.minPrice !== null || filters.maxPrice !== null || filters.minimumRating !== null || filters.maximumDistance !== null || filters.express || filters.pickup || filters.delivery || filters.verified)}>
            <summary><SlidersHorizontal size={17} />Filters</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label><span className="field-label">Service category</span><select className="field" name="category" defaultValue={filters.category}><option value="">All services</option>{selectOptions(facets.categories, filters.category).map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>
              <label><span className="field-label">Minimum price</span><input className="field" type="number" min="0" max="10000000" step="100" name="minPrice" defaultValue={filters.minPrice ?? ""} placeholder="Any" /></label>
              <label><span className="field-label">Maximum price</span><input className="field" type="number" min="0" max="10000000" step="100" name="maxPrice" defaultValue={filters.maxPrice ?? ""} placeholder="Any" /></label>
              <label><span className="field-label">Minimum rating</span><select className="field" name="rating" defaultValue={filters.minimumRating ?? ""}><option value="">Any rating</option><option value="4">4.0 and above</option><option value="4.5">4.5 and above</option></select></label>
              <label><span className="field-label">Within distance</span><select className="field" name="distance" defaultValue={filters.maximumDistance ?? ""}><option value="">Any distance</option><option value="3">3 km</option><option value="5">5 km</option><option value="10">10 km</option><option value="25">25 km</option></select></label>
              <fieldset className="sm:col-span-2 lg:col-span-3"><legend className="field-label">Availability</legend><div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-zinc-700"><label className="check-label"><input type="checkbox" name="express" value="1" defaultChecked={filters.express} />Express</label><label className="check-label"><input type="checkbox" name="pickup" value="1" defaultChecked={filters.pickup} />Pickup</label><label className="check-label"><input type="checkbox" name="delivery" value="1" defaultChecked={filters.delivery} />Delivery</label><label className="check-label"><input type="checkbox" name="verified" value="1" defaultChecked={filters.verified} />Verified only</label></div></fieldset>
            </div>
          </details>
          <NearMeButton />
        </div>
      </form>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-bold text-brand-navy">{vendors.length} cleaner{vendors.length === 1 ? "" : "s"} found</p>{filters.latitude !== null && <p className="mt-1 text-xs text-zinc-500">Sorted using your approximate device location.</p>}</div>
        <div className="flex flex-wrap items-end gap-3">
          <label><span className="field-label">Sort cleaners</span><select className="field min-w-48" name="sort" form="marketplace-sort" defaultValue={filters.sort}><option value="recommended">Recommended</option><option value="nearest">Nearest</option><option value="price">Lowest price</option><option value="rating">Highest rated</option><option value="fastest">Fastest turnaround</option><option value="popular">Most popular</option></select></label>
          <form id="marketplace-sort" action={action}>
            {Object.entries({ q: filters.q, state: filters.state, city: filters.city, area: filters.area, category: filters.category, minPrice: filters.minPrice, maxPrice: filters.maxPrice, rating: filters.minimumRating, distance: filters.maximumDistance, express: filters.express ? 1 : "", pickup: filters.pickup ? 1 : "", delivery: filters.delivery ? 1 : "", verified: filters.verified ? 1 : "", lat: filters.latitude, lng: filters.longitude, view: filters.view }).map(([key, value]) => value !== null && value !== "" ? <input key={key} type="hidden" name={key} value={String(value)} /> : null)}
            <button className="btn-secondary" type="submit">Apply sort</button>
          </form>
          <div className="segmented" aria-label="Results view">
            <Link aria-label="List view" aria-current={filters.view === "list" ? "page" : undefined} href={marketplacePath(filters, { view: "list" })}><List size={17} /></Link>
            <Link aria-label="Map view" aria-current={filters.view === "map" ? "page" : undefined} href={marketplacePath(filters, { view: "map" })}><Map size={17} /></Link>
          </div>
          <Link className="btn-ghost" href={action}>Clear</Link>
        </div>
      </div>

      {vendors.length ? filters.view === "map"
        ? <div className="grid gap-6"><MarketplaceMap vendors={vendors} /><VendorResults vendors={vendors} /></div>
        : <VendorResults vendors={vendors} />
        : <section className="surface empty"><h2 className="text-lg font-bold text-brand-navy">No cleaners match this search</h2><p className="mx-auto mt-2 max-w-lg">Try a nearby area or join the waitlist so we can let you know when LaundryLink reaches your city.</p><Link className="btn-primary mt-5" href="/waitlist">Join the waitlist</Link></section>}
    </div>
  );
}
