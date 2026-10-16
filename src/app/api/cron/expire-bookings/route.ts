import { NextResponse } from "next/server";
import { expireUnpaidReservations } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await expireUnpaidReservations();
  return NextResponse.json({ expired: result.changes });
}
