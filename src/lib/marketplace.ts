import "server-only";

import { all } from "@/lib/db";
import { boundedSearchTerm } from "@/lib/validation";
import {
  MARKETPLACE_SORTS,
  prepareMarketplaceVendors,
  type MarketplaceFilters,
  type MarketplaceSort,
  type MarketplaceVendor,
} from "@/lib/marketplace-model";

type SearchValue = string | string[] | undefined;
export type MarketplaceSearchParams = Record<string, SearchValue>;

const marketplaceQuery = `
  SELECT c.*, ve.active_service_count AS services_count, ve.bookable AS is_bookable,
    COUNT(DISTINCT r.id) AS reviews_count,
    COUNT(DISTINCT CASE WHEN o.status = 'completed' THEN o.id END) AS completed_orders,
    MIN(CASE WHEN s.is_active = 1 AND s.price > 0 THEN s.price END) AS starting_price,
    MAX(CASE WHEN s.is_active = 1 THEN s.express_available ELSE 0 END) AS has_express,
    COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN s.is_active = 1 THEN lower(s.category) END), '') AS categories,
    (SELECT id FROM vendor_files WHERE cleaner_id = c.id AND kind = 'logo') AS logo_file_id,
    (SELECT id FROM vendor_files WHERE cleaner_id = c.id AND kind = 'cover') AS cover_file_id
  FROM cleaners c
  JOIN vendor_eligibility ve ON ve.cleaner_id = c.id
  LEFT JOIN services s ON s.cleaner_id = c.id
  LEFT JOIN reviews r ON r.cleaner_id = c.id
  LEFT JOIN orders o ON o.cleaner_id = c.id
  WHERE ve.public_profile = 1
  GROUP BY c.id
`;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function boundedNumber(value: SearchValue, minimum: number, maximum: number) {
  const raw = first(value);
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function checked(value: SearchValue) {
  return first(value) === "1" || first(value) === "on" || first(value) === "true";
}

export function parseMarketplaceFilters(params: MarketplaceSearchParams): MarketplaceFilters {
  const requestedSort = first(params.sort);
  const latitude = boundedNumber(params.lat, -90, 90);
  const longitude = boundedNumber(params.lng, -180, 180);
  return {
    q: boundedSearchTerm(first(params.q)),
    state: boundedSearchTerm(first(params.state), 80),
    city: boundedSearchTerm(first(params.city), 100),
    area: boundedSearchTerm(first(params.area), 100),
    category: boundedSearchTerm(first(params.category), 80),
    minPrice: boundedNumber(params.minPrice, 0, 10_000_000),
    maxPrice: boundedNumber(params.maxPrice, 0, 10_000_000),
    minimumRating: boundedNumber(params.rating, 0, 5),
    maximumDistance: boundedNumber(params.distance, 1, 100),
    express: checked(params.express),
    pickup: checked(params.pickup),
    delivery: checked(params.delivery),
    verified: checked(params.verified),
    sort: MARKETPLACE_SORTS.includes(requestedSort as MarketplaceSort) ? requestedSort as MarketplaceSort : "recommended",
    latitude: latitude !== null && longitude !== null ? latitude : null,
    longitude: latitude !== null && longitude !== null ? longitude : null,
    view: first(params.view) === "map" ? "map" : "list",
  };
}

export async function getMarketplaceVendors(filters: MarketplaceFilters) {
  const rows = await all<Omit<MarketplaceVendor, "distance_km" | "turnaround_hours">>(marketplaceQuery);
  return prepareMarketplaceVendors(rows, filters);
}

export async function getMarketplaceVendorByIds(ids: number[]) {
  if (!ids.length) return [];
  const filters = parseMarketplaceFilters({});
  const vendors = await getMarketplaceVendors(filters);
  return ids.map((id) => vendors.find((vendor) => Number(vendor.id) === id)).filter(Boolean) as MarketplaceVendor[];
}

export async function getMarketplaceFacets() {
  const vendors = await getMarketplaceVendors(parseMarketplaceFilters({}));
  const unique = (values: Array<string | null>) => [...new Set(values.filter(Boolean).map((value) => value!.trim()))].sort();
  return {
    states: unique(vendors.map((vendor) => vendor.state)),
    cities: unique(vendors.flatMap((vendor) => [vendor.city, vendor.lga])),
    areas: unique(vendors.map((vendor) => vendor.area)),
    categories: unique(vendors.flatMap((vendor) => vendor.categories.split(",").map((category) => category.trim()).filter(Boolean))),
  };
}

export function marketplacePath(filters: MarketplaceFilters, overrides: Record<string, string | number | null>) {
  const params = new URLSearchParams();
  const values: Record<string, string | number | boolean | null> = {
    q: filters.q,
    state: filters.state,
    city: filters.city,
    area: filters.area,
    category: filters.category,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    rating: filters.minimumRating,
    distance: filters.maximumDistance,
    express: filters.express,
    pickup: filters.pickup,
    delivery: filters.delivery,
    verified: filters.verified,
    sort: filters.sort,
    lat: filters.latitude,
    lng: filters.longitude,
    view: filters.view,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === "" || value === false || value === "recommended" || value === "list") continue;
    params.set(key, value === true ? "1" : String(value));
  }
  const query = params.toString();
  return query ? `/cleaners?${query}` : "/cleaners";
}
