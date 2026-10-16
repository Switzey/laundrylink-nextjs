import { describe, expect, test } from "vitest";
import {
  customerCancellationDecision,
  earliestDeliveryDate,
  pickupMeetsLeadTime,
  reservationExpiry,
  selectedTurnaroundHours,
  slotHasCapacity,
  turnaroundHours,
  voucherDiscount,
} from "../src/lib/booking-policy";

describe("booking schedule policy", () => {
  test("uses the slowest selected service to calculate a realistic return date", () => {
    expect(turnaroundHours("24 - 48 hours")).toBe(48);
    expect(turnaroundHours("3 days")).toBe(72);
    expect(selectedTurnaroundHours([{ turnaround_time: "24 hours" }, { turnaround_time: "3 days" }], false, 12)).toBe(72);
    expect(earliestDeliveryDate("2026-10-20", 72)).toBe("2026-10-23");
  });

  test("uses configured express turnaround and lead time", () => {
    expect(selectedTurnaroundHours([{ turnaround_time: "4 days" }], true, 12)).toBe(12);
    expect(pickupMeetsLeadTime("2026-10-20", 24, new Date("2026-10-18T12:00:00Z"))).toBe(true);
    expect(pickupMeetsLeadTime("2026-10-20", 72, new Date("2026-10-18T12:00:00Z"))).toBe(false);
  });

  test("enforces daily, window, and express capacity", () => {
    expect(slotHasCapacity({ dailyCount: 4, windowCount: 0, expressDailyCount: 1, dailyCapacity: 5, expressDailyCapacity: 2, timeWindowCount: 5, express: true })).toBe(true);
    expect(slotHasCapacity({ dailyCount: 5, windowCount: 0, expressDailyCount: 1, dailyCapacity: 5, expressDailyCapacity: 2, timeWindowCount: 5, express: false })).toBe(false);
    expect(slotHasCapacity({ dailyCount: 2, windowCount: 0, expressDailyCount: 2, dailyCapacity: 5, expressDailyCapacity: 2, timeWindowCount: 5, express: true })).toBe(false);
  });

  test("creates bounded reservation expirations", () => {
    expect(reservationExpiry(30, new Date("2026-10-20T10:00:00Z"))).toBe("2026-10-20T10:30:00.000Z");
  });
});

describe("booking money and cancellation policy", () => {
  test("validates fixed and capped percentage vouchers", () => {
    expect(voucherDiscount(10_000, { discountType: "fixed", discountValue: 1_500 })).toBe(1_500);
    expect(voucherDiscount(10_000, { discountType: "percent", discountValue: 20, maximumDiscount: 1_000 })).toBe(1_000);
    expect(voucherDiscount(4_000, { discountType: "fixed", discountValue: 500, minimumSubtotal: 5_000 })).toBe(0);
  });

  test("allows early cancellation but blocks processing-stage cancellation", () => {
    expect(customerCancellationDecision({ status: "pending", pickupDate: "2026-10-21", paymentStatus: "unpaid" }).allowed).toBe(true);
    expect(customerCancellationDecision({ status: "accepted", pickupDate: "2026-10-21", paymentStatus: "unpaid", reference: new Date("2026-10-20T00:00:00Z") }).allowed).toBe(true);
    expect(customerCancellationDecision({ status: "picked_up", pickupDate: "2026-10-21", paymentStatus: "unpaid" }).allowed).toBe(false);
  });
});
