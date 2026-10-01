import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { VENDOR_ROLES } from "@/lib/types";
import { all } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import type { OrderSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Pickup schedule" };

export default async function CleanerSchedulePage() {
  const user = await requireUser(VENDOR_ROLES, { returnTo: "/cleaner/schedule" });
  const cleanerId = await cleanerIdForUser(user.id);
  const orders = cleanerId ? await all<OrderSummary>(`SELECT o.*, c.business_name, u.name AS customer_name FROM orders o JOIN cleaners c ON c.id = o.cleaner_id LEFT JOIN users u ON u.id = o.customer_id WHERE o.cleaner_id = ? AND o.status NOT IN ('completed','cancelled') ORDER BY o.pickup_date, o.pickup_time_window`, cleanerId) : [];
  return <div className="page"><div className="page-header"><div><p className="eyebrow">Operations</p><h1 className="page-title">Pickup schedule</h1><p className="page-copy">Upcoming pickups and deliveries in chronological order.</p></div></div><div className="grid gap-4">{orders.length ? orders.map((order) => <article className="surface grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center" key={order.id}><div className="flex h-12 w-12 items-center justify-center rounded-md bg-blue-50 text-brand-blue"><CalendarDays size={22} /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-brand-navy">Order #{order.id} · {order.customer_name || "Customer"}</h2><StatusBadge status={order.status} /></div><p className="mt-2 text-sm text-zinc-600">Pickup {dateLabel(order.pickup_date)} during {order.pickup_time_window}</p><p className="mt-1 text-xs text-zinc-500">Delivery {dateLabel(order.delivery_date)} · {order.delivery_time_window || "Window pending"}</p></div><Link className="icon-button" href={`/orders/${order.id}`}><ArrowRight size={17} /></Link></article>) : <div className="surface empty">No active pickups are scheduled.</div>}</div></div>;
}

