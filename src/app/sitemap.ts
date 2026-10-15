import type { MetadataRoute } from "next";
import { getMarketplaceFacets, getMarketplaceVendors, parseMarketplaceFilters } from "@/lib/marketplace";
import { marketplaceSlug } from "@/lib/marketplace-slugs";

const origin = "https://www.laundrylink.com.ng";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [vendors, facets] = await Promise.all([
    getMarketplaceVendors(parseMarketplaceFilters({})),
    getMarketplaceFacets(),
  ]);
  const staticPaths = ["", "/cleaners", "/how-it-works", "/help", "/contact", "/terms", "/privacy", "/cancellation", "/vendor-registration", "/waitlist", "/login", "/register"];
  const locations = [...new Set(vendors.map((vendor) => vendor.state && (vendor.lga || vendor.city) ? `${marketplaceSlug(vendor.state)}/${marketplaceSlug(vendor.lga || vendor.city)}` : "").filter(Boolean))];
  return [
    ...staticPaths.map((path) => ({ url: `${origin}${path}`, changeFrequency: path === "" || path === "/cleaners" ? "daily" as const : "monthly" as const, priority: path === "" ? 1 : path === "/cleaners" ? 0.9 : 0.6 })),
    ...vendors.map((vendor) => ({ url: `${origin}/cleaners/${vendor.id}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...facets.categories.map((category) => ({ url: `${origin}/services/${marketplaceSlug(category)}`, changeFrequency: "weekly" as const, priority: 0.75 })),
    ...locations.map((location) => ({ url: `${origin}/laundry/${location}`, changeFrequency: "weekly" as const, priority: 0.75 })),
  ];
}
