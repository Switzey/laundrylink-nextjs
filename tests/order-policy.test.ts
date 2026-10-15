import { describe, expect, test } from "vitest";
import { createOrderSchema, rescheduleOrderSchema, reviewSchema } from "../src/lib/order-validation";
import {
  calculateOrderTotals,
  canTransitionOrder,
  customerCanRescheduleOrder,
  customerCanReviewOrder,
  customerOwnsOrder,
  parseServiceQuantity,
  vendorCanManageOrder,
} from "../src/lib/order-policy";

describe("cart and checkout", () => {
  test.each([
    ["0", 0],
    ["3", 3],
    [100, 100],
  ])("accepts cart quantity %s", (input, expected) => {
    expect(parseServiceQuantity(input)).toBe(expected);
  });

  test.each(["-1", "1.5", "101", "abc"])("rejects cart quantity %s", (input) => {
    expect(parseServiceQuantity(input)).toBeNull();
  });

  test("calculates service, delivery, platform, and total prices on the server", () => {
    expect(calculateOrderTotals([{ price: 1200, quantity: 2 }, { price: 1800, quantity: 3 }])).toEqual({
      subtotal: 7800,
      deliveryFee: 1500,
      platformFee: 500,
      total: 9800,
    });
  });

  test("rejects delivery before pickup and windows without a delivery date", () => {
    const base = {
      cleaner_id: 1,
      pickup_date: "2026-10-20",
      pickup_time_window: "8am - 10am",
      pickup_address_id: 1,
      delivery_address_id: 1,
    };
    expect(createOrderSchema.safeParse({ ...base, delivery_date: "2026-10-19" }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...base, delivery_time_window: "10am - 12pm" }).success).toBe(false);
    expect(rescheduleOrderSchema.safeParse({ order_id: 1, ...base, delivery_date: "2026-10-19" }).success).toBe(false);
  });
});

describe("order lifecycle and ownership", () => {
  test.each([
    ["pending", "accepted"],
    ["accepted", "picked_up"],
    ["picked_up", "in_cleaning"],
    ["in_cleaning", "ready"],
    ["ready", "out_for_delivery"],
    ["out_for_delivery", "completed"],
  ])("allows %s to transition to %s", (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(true);
  });

  test.each([
    ["pending", "completed"],
    ["completed", "accepted"],
    ["cancelled", "accepted"],
    ["accepted", "ready"],
  ])("blocks %s from transitioning to %s", (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(false);
  });

  test("enforces customer and vendor order ownership", () => {
    expect(customerOwnsOrder(10, 10)).toBe(true);
    expect(customerOwnsOrder(10, 11)).toBe(false);
    expect(vendorCanManageOrder(7, 7, true)).toBe(true);
    expect(vendorCanManageOrder(7, 8, true)).toBe(false);
    expect(vendorCanManageOrder(7, 7, false)).toBe(false);
  });

  test("limits rescheduling and reviews by owner and state", () => {
    expect(customerCanRescheduleOrder(10, 10, "pending")).toBe(true);
    expect(customerCanRescheduleOrder(10, 10, "completed")).toBe(false);
    expect(customerCanReviewOrder(10, 10, "completed", false)).toBe(true);
    expect(customerCanReviewOrder(10, 11, "completed", false)).toBe(false);
    expect(customerCanReviewOrder(10, 10, "completed", true)).toBe(false);
    expect(reviewSchema.safeParse({ order_id: 1, rating: 6 }).success).toBe(false);
  });
});
