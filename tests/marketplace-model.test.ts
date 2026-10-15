import { describe, expect, test } from "vitest";
import { distanceBetween, prepareMarketplaceVendors, turnaroundHours, type MarketplaceFilters, type MarketplaceVendor } from "@/lib/marketplace-model";

const baseFilters: MarketplaceFilters = {
  q: "",
  state: "",
  city: "",
  area: "",
  category: "",
  minPrice: null,
  maxPrice: null,
  minimumRating: null,
  maximumDistance: null,
  express: false,
  pickup: false,
  delivery: false,
  verified: false,
  sort: "recommended",
  latitude: null,
  longitude: null,
  view: "list",
};

function vendor(overrides: Partial<MarketplaceVendor> = {}): Omit<MarketplaceVendor, "distance_km" | "turnaround_hours"> {
  return {
    id: 1,
    user_id: 1,
    business_name: "FreshFold Laundry",
    description: "Reliable laundry care in Lekki.",
    address: "8 Admiralty Road",
    city: "Lagos",
    phone: "+2348030000001",
    business_phone_verified_at: "2026-10-15",
    business_phone_verified_e164: "+2348030000001",
    rating: 4.8,
    turnaround_time: "24 hours",
    opening_hours: "Mon-Sat",
    is_available: 1,
    is_approved: 1,
    is_published: 1,
    is_suspended: 0,
    contact_name: "Bisi Fresh",
    business_email: "freshfold@example.com",
    state: "Lagos",
    lga: "Eti-Osa",
    area: "Lekki",
    latitude: 6.4281,
    longitude: 3.4219,
    pickup_radius_km: 8,
    delivery_radius_km: 12,
    verification_status: "approved",
    onboarding_step: "submitted",
    submitted_at: "2026-10-15",
    approved_at: "2026-10-15",
    services_count: 4,
    is_bookable: 1,
    reviews_count: 12,
    starting_price: 1200,
    has_express: 1,
    categories: "washing,dry cleaning,bedding",
    completed_orders: 20,
    ...overrides,
  };
}

describe("marketplace discovery", () => {
  test("calculates distance and normalizes turnaround values", () => {
    expect(distanceBetween(6.4281, 3.4219, 6.4281, 3.4219)).toBeCloseTo(0);
    expect(turnaroundHours("2 days")).toBe(48);
    expect(turnaroundHours("24-48 hours")).toBe(24);
    expect(turnaroundHours("Flexible")).toBeNull();
  });

  test("filters by location, category, price, rating, express, and coverage", () => {
    const results = prepareMarketplaceVendors(
      [vendor(), vendor({ id: 2, business_name: "Budget Clean", state: "Oyo", area: "Bodija", city: "Ibadan", rating: 3.5, starting_price: 700, has_express: 0, categories: "ironing", pickup_radius_km: 0 })],
      { ...baseFilters, state: "Lagos", area: "Lekki", category: "washing", minPrice: 1000, maxPrice: 2000, minimumRating: 4, express: true, pickup: true, verified: true },
    );
    expect(results.map((item) => item.id)).toEqual([1]);
  });

  test("sorts nearest vendors using supplied device coordinates", () => {
    const results = prepareMarketplaceVendors(
      [vendor({ id: 1 }), vendor({ id: 2, business_name: "Far Cleaner", latitude: 6.6018, longitude: 3.3515 })],
      { ...baseFilters, sort: "nearest", latitude: 6.43, longitude: 3.42 },
    );
    expect(results.map((item) => item.id)).toEqual([1, 2]);
    expect(results[0].distance_km).toBeLessThan(results[1].distance_km!);
  });
});
