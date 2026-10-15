import type { Cleaner } from "@/lib/types";

export const MARKETPLACE_SORTS = ["recommended", "nearest", "price", "rating", "fastest", "popular"] as const;
export type MarketplaceSort = (typeof MARKETPLACE_SORTS)[number];

export type MarketplaceVendor = Cleaner & {
  starting_price: number | null;
  has_express: number;
  categories: string;
  completed_orders: number;
  distance_km: number | null;
  turnaround_hours: number | null;
};

export type MarketplaceFilters = {
  q: string;
  state: string;
  city: string;
  area: string;
  category: string;
  minPrice: number | null;
  maxPrice: number | null;
  minimumRating: number | null;
  maximumDistance: number | null;
  express: boolean;
  pickup: boolean;
  delivery: boolean;
  verified: boolean;
  sort: MarketplaceSort;
  latitude: number | null;
  longitude: number | null;
  view: "list" | "map";
};

export function distanceBetween(
  latitude: number,
  longitude: number,
  vendorLatitude: number,
  vendorLongitude: number,
) {
  const radians = (value: number) => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = radians(vendorLatitude - latitude);
  const longitudeDelta = radians(vendorLongitude - longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitude)) * Math.cos(radians(vendorLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function turnaroundHours(value: string | null) {
  if (!value) return null;
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  if (!Number.isFinite(amount)) return null;
  return /day/i.test(value) ? amount * 24 : amount;
}

function includes(value: string | null | undefined, expected: string) {
  return String(value ?? "").toLocaleLowerCase().includes(expected.toLocaleLowerCase());
}

function recommendedScore(vendor: MarketplaceVendor) {
  return Number(vendor.is_bookable) * 1000 +
    Number(vendor.rating) * 100 +
    Math.min(Number(vendor.reviews_count ?? 0), 100) * 3 +
    Math.min(Number(vendor.completed_orders), 100);
}

export function prepareMarketplaceVendors(vendors: Omit<MarketplaceVendor, "distance_km" | "turnaround_hours">[], filters: MarketplaceFilters) {
  const prepared = vendors.map((vendor) => ({
    ...vendor,
    distance_km: filters.latitude !== null && filters.longitude !== null && vendor.latitude !== null && vendor.longitude !== null
      ? distanceBetween(filters.latitude, filters.longitude, Number(vendor.latitude), Number(vendor.longitude))
      : null,
    turnaround_hours: turnaroundHours(vendor.turnaround_time),
  }));

  const filtered = prepared.filter((vendor) => {
    const searchable = [vendor.business_name, vendor.description, vendor.state, vendor.city, vendor.lga, vendor.area, vendor.categories].join(" ");
    if (filters.q && !includes(searchable, filters.q)) return false;
    if (filters.state && !includes(vendor.state, filters.state)) return false;
    if (filters.city && !includes(`${vendor.city} ${vendor.lga}`, filters.city)) return false;
    if (filters.area && !includes(vendor.area, filters.area)) return false;
    if (filters.category && !vendor.categories.split(",").some((category) => includes(category, filters.category))) return false;
    if (filters.minPrice !== null && (vendor.starting_price === null || Number(vendor.starting_price) < filters.minPrice)) return false;
    if (filters.maxPrice !== null && (vendor.starting_price === null || Number(vendor.starting_price) > filters.maxPrice)) return false;
    if (filters.minimumRating !== null && Number(vendor.rating) < filters.minimumRating) return false;
    if (filters.maximumDistance !== null && (vendor.distance_km === null || vendor.distance_km > filters.maximumDistance)) return false;
    if (filters.express && !Number(vendor.has_express)) return false;
    if (filters.pickup && Number(vendor.pickup_radius_km) <= 0) return false;
    if (filters.delivery && Number(vendor.delivery_radius_km) <= 0) return false;
    if (filters.verified && vendor.verification_status !== "approved") return false;
    return true;
  });

  return filtered.sort((left, right) => {
    if (filters.sort === "nearest") return (left.distance_km ?? Number.MAX_VALUE) - (right.distance_km ?? Number.MAX_VALUE);
    if (filters.sort === "price") return Number(left.starting_price ?? Number.MAX_VALUE) - Number(right.starting_price ?? Number.MAX_VALUE);
    if (filters.sort === "rating") return Number(right.rating) - Number(left.rating) || Number(right.reviews_count ?? 0) - Number(left.reviews_count ?? 0);
    if (filters.sort === "fastest") return (left.turnaround_hours ?? Number.MAX_VALUE) - (right.turnaround_hours ?? Number.MAX_VALUE);
    if (filters.sort === "popular") return Number(right.completed_orders) - Number(left.completed_orders) || Number(right.reviews_count ?? 0) - Number(left.reviews_count ?? 0);
    return recommendedScore(right) - recommendedScore(left);
  });
}
