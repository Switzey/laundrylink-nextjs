import "server-only";

import { randomBytes } from "node:crypto";
import { all, now, one, run } from "@/lib/db";
import { TIME_WINDOWS } from "@/lib/constants";
import { slotHasCapacity, voucherDiscount } from "@/lib/booking-policy";

export type BookingCleaner = {
  id: number;
  user_id?: number | null;
  business_name?: string;
  daily_order_capacity: number;
  express_daily_capacity: number;
  minimum_lead_hours: number;
  express_turnaround_hours: number;
  booking_hold_minutes: number;
};

type BookingCapacity = Pick<BookingCleaner, "id" | "daily_order_capacity" | "express_daily_capacity">;

type VoucherRow = {
  id: number;
  code: string;
  cleaner_id: number | null;
  discount_type: "fixed" | "percent";
  discount_value: number;
  minimum_subtotal: number;
  maximum_discount: number | null;
  starts_at: string | null;
  expires_at: string | null;
  usage_limit: number | null;
  per_user_limit: number;
  times_used: number;
  is_active: number;
};

export async function expireUnpaidReservations(cleanerId?: number) {
  const filter = cleanerId ? " AND cleaner_id = ?" : "";
  const values = cleanerId ? [now(), cleanerId] : [now()];
  return run(
    `UPDATE orders SET status = 'cancelled', cancelled_at = ?, cancellation_reason = 'Unpaid booking reservation expired', updated_at = ?
     WHERE status = 'pending' AND confirmed_at IS NULL AND payment_status IN ('unpaid', 'pending')
       AND booking_expires_at IS NOT NULL AND booking_expires_at <= ?${filter}`,
    now(),
    now(),
    ...values,
  );
}

export async function slotAvailability(
  cleaner: BookingCapacity,
  pickupDate: string,
  express: boolean,
  excludeOrderId?: number,
) {
  const exclusion = excludeOrderId ? " AND id <> ?" : "";
  const values = excludeOrderId ? [cleaner.id, pickupDate, now(), excludeOrderId] : [cleaner.id, pickupDate, now()];
  const rows = await all<{ pickup_time_window: string; count: number; express_count: number }>(
    `SELECT pickup_time_window, COUNT(1) AS count,
       SUM(CASE WHEN is_express = 1 THEN 1 ELSE 0 END) AS express_count
     FROM orders
     WHERE cleaner_id = ? AND pickup_date = ? AND status NOT IN ('completed', 'cancelled')
       AND (confirmed_at IS NOT NULL OR booking_expires_at > ?)${exclusion}
     GROUP BY pickup_time_window`,
    ...values,
  );
  const byWindow = new Map(rows.map((row) => [row.pickup_time_window, row]));
  const dailyCount = rows.reduce((sum, row) => sum + Number(row.count), 0);
  const expressDailyCount = rows.reduce((sum, row) => sum + Number(row.express_count), 0);
  return TIME_WINDOWS.map((window) => ({
    window,
    available: slotHasCapacity({
      dailyCount,
      windowCount: Number(byWindow.get(window)?.count ?? 0),
      expressDailyCount,
      dailyCapacity: Number(cleaner.daily_order_capacity),
      expressDailyCapacity: Number(cleaner.express_daily_capacity),
      timeWindowCount: TIME_WINDOWS.length,
      express,
    }),
  }));
}

export async function validateVoucherForOrder(input: {
  code: string;
  cleanerId: number;
  userId: number;
  subtotal: number;
}) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return { valid: false as const, message: "Enter a valid voucher code." };
  const voucher = await one<VoucherRow>(
    `SELECT * FROM vouchers WHERE code = ? AND is_active = 1
     AND (cleaner_id IS NULL OR cleaner_id = ?)
     AND (starts_at IS NULL OR starts_at <= ?) AND (expires_at IS NULL OR expires_at > ?)`,
    code,
    input.cleanerId,
    now(),
    now(),
  );
  if (!voucher || (voucher.usage_limit != null && Number(voucher.times_used) >= Number(voucher.usage_limit))) {
    return { valid: false as const, message: "This voucher is invalid or no longer available." };
  }
  const redemptionCount = await one<{ count: number }>(
    "SELECT COUNT(1) AS count FROM voucher_redemptions WHERE voucher_id = ? AND user_id = ?",
    voucher.id,
    input.userId,
  );
  if (Number(redemptionCount?.count ?? 0) >= Number(voucher.per_user_limit)) {
    return { valid: false as const, message: "You have already used this voucher." };
  }
  const discount = voucherDiscount(input.subtotal, {
    discountType: voucher.discount_type,
    discountValue: Number(voucher.discount_value),
    maximumDiscount: voucher.maximum_discount == null ? null : Number(voucher.maximum_discount),
    minimumSubtotal: Number(voucher.minimum_subtotal),
  });
  if (discount <= 0) {
    return { valid: false as const, message: `Spend at least NGN ${Number(voucher.minimum_subtotal).toLocaleString("en-NG")} to use this voucher.` };
  }
  return { valid: true as const, voucherId: voucher.id, code, discount };
}

export function generateOrderNumber(reference = new Date()) {
  const date = reference.toISOString().slice(0, 10).replaceAll("-", "");
  return `LL-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}
