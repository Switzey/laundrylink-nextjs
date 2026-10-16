import { NextRequest, NextResponse } from "next/server";
import { slotAvailability, type BookingCleaner } from "@/lib/booking";
import { one } from "@/lib/db";
import { getVendorEligibility } from "@/lib/vendor-eligibility";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cleanerId = Number(request.nextUrl.searchParams.get("cleaner"));
  const pickupDate = request.nextUrl.searchParams.get("pickupDate") ?? "";
  const express = request.nextUrl.searchParams.get("express") === "1";
  if (!Number.isSafeInteger(cleanerId) || cleanerId < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
    return NextResponse.json({ error: "Invalid availability request." }, { status: 400 });
  }
  if (pickupDate < new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "Pickup date cannot be in the past." }, { status: 400 });
  }
  const eligibility = await getVendorEligibility(cleanerId);
  if (!eligibility?.bookable) return NextResponse.json({ error: "Vendor is unavailable." }, { status: 404 });
  const cleaner = await one<BookingCleaner>(
    `SELECT id, user_id, business_name, daily_order_capacity, express_daily_capacity,
      minimum_lead_hours, express_turnaround_hours, booking_hold_minutes
     FROM cleaners WHERE id = ?`,
    cleanerId,
  );
  if (!cleaner) return NextResponse.json({ error: "Vendor is unavailable." }, { status: 404 });
  const slots = await slotAvailability(cleaner, pickupDate, express);
  return NextResponse.json(
    { slots, minimumLeadHours: Number(cleaner.minimum_lead_hours), expressTurnaroundHours: Number(cleaner.express_turnaround_hours) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
