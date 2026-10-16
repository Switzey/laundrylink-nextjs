import { describe, expect, test } from "vitest";
import { calculateOrderPricing, calculatePricingLine, distanceKm, quantityIsValid, type PriceableService } from "../src/lib/pricing-engine";

function service(overrides: Partial<PriceableService> = {}): PriceableService {
  return {
    id: 1,
    name: "Wash and fold",
    category: "Washing",
    price: 1800,
    unit: "per_kg",
    minimum_quantity: 0.5,
    quantity_step: 0.5,
    express_available: true,
    express_fee_type: "percentage",
    express_fee_value: 20,
    special_treatment_available: true,
    special_treatment_fee: 200,
    requires_final_confirmation: true,
    price_version: 1,
    discounts: [{ minimum_quantity: 2, discount_type: "percentage", discount_value: 10 }],
    ...overrides,
  };
}

describe("service pricing", () => {
  test("supports decimal weight, bulk discounts, express pricing, and treatment fees", () => {
    expect(calculatePricingLine({ service: service(), quantity: 2.5, express: true, specialTreatment: true })).toMatchObject({
      baseSubtotal: 4500,
      discountAmount: 450,
      expressFee: 900,
      specialTreatmentFee: 500,
      lineTotal: 5450,
      requiresFinalConfirmation: true,
    });
  });

  test("supports per-bag and fixed-package services", () => {
    const bag = calculatePricingLine({ service: service({ unit: "per_bag", price: 5000, minimum_quantity: 1, quantity_step: 1, requires_final_confirmation: false, discounts: [] }), quantity: 2 });
    const pack = calculatePricingLine({ service: service({ unit: "flat_rate", price: 8500, minimum_quantity: 1, quantity_step: 1, requires_final_confirmation: false, discounts: [] }), quantity: 1 });
    expect(bag.lineTotal).toBe(10000);
    expect(pack.lineTotal).toBe(8500);
  });

  test("enforces configured minimums and increments", () => {
    expect(quantityIsValid(service(), 2.5)).toBe(true);
    expect(quantityIsValid(service(), 2.25)).toBe(false);
    expect(() => calculatePricingLine({ service: service(), quantity: 0.25 })).toThrow(/invalid quantity/i);
  });
});

describe("order pricing", () => {
  test("shows a transparent total with distance delivery and a platform fee", () => {
    const pricing = calculateOrderPricing({
      items: [{ service: service(), quantity: 2.5, express: true, specialTreatment: true }],
      delivery: { pricingType: "distance", baseFee: 1000, perKmFee: 200, distanceKm: 5, maximumFee: 2500 },
      platformFee: 500,
      minimumOrderAmount: 4000,
    });
    expect(pricing).toMatchObject({ subtotal: 4500, discountAmount: 450, expressFee: 900, specialTreatmentFee: 500, deliveryFee: 2000, platformFee: 500, total: 7950, meetsMinimum: true, pricingStatus: "estimate" });
  });

  test("flags orders below the vendor minimum and applies free-delivery thresholds", () => {
    const pricing = calculateOrderPricing({
      items: [{ service: service({ price: 1000, express_available: false, special_treatment_available: false, discounts: [], requires_final_confirmation: false }), quantity: 1 }],
      delivery: { pricingType: "fixed", baseFee: 1500 },
      platformFee: 500,
      minimumOrderAmount: 2000,
      freeDeliveryThreshold: 1000,
    });
    expect(pricing.meetsMinimum).toBe(false);
    expect(pricing.deliveryFee).toBe(0);
    expect(pricing.total).toBe(1500);
  });

  test("keeps a confirmed quote independent from a later catalogue price", () => {
    const snapshot = service({ price: 1800 });
    const original = calculateOrderPricing({ items: [{ service: snapshot, quantity: 2 }], delivery: { pricingType: "free", baseFee: 0 }, platformFee: 0 });
    const changed = calculateOrderPricing({ items: [{ service: service({ price: 2400, price_version: 2 }), quantity: 2 }], delivery: { pricingType: "free", baseFee: 0 }, platformFee: 0 });
    expect(original.total).toBe(3240);
    expect(changed.total).toBe(4320);
  });

  test("calculates delivery distance without trusting a client-supplied fee", () => {
    expect(distanceKm({ latitude: 6.4281, longitude: 3.4219 }, { latitude: 6.455, longitude: 3.47 })).toBeGreaterThan(5);
  });
});
