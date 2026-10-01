import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarDays, CircleDollarSign, Settings2 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { VENDOR_ROLES } from "@/lib/types";
import { all, one } from "@/lib/db";
import { dateLabel, money } from "@/lib/format";
import type { Cleaner, OrderSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Cleaner dashboard" };

export default async function CleanerDashboard() {
  const user = await requireUser(VENDOR_ROLES, { returnTo: "/cleaner/dashboard" });
  const cleanerId = await cleanerIdForUser(user.id);
  const cleaner = cleanerId ? await one<Cleaner>("SELECT * FROM cleaners WHERE id = ?", cleanerId) : null;
  if (!cleaner) return <div className="page"><div className="surface empty">Your cleaner profile is not ready yet.</div></div>;
  const orders = await all<OrderSummary>(`SELECT o.*, c.business_name, u.name AS customer_name FROM orders o JOIN cleaners c ON c.id = o.cleaner_id LEFT JOIN users u ON u.id = o.customer_id WHERE o.cleaner_id = ? ORDER BY o.created_at DESC`, cleaner.id);
  const active = orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length;
  const completed = orders.filter((order) => order.status === "completed").length;
  const revenue = orders.filter((order) => order.status === "completed").reduce((sum, order) => sum + Number(order.subtotal), 0);
  const services = (await one<{ count: number }>("SELECT COUNT(1) AS count FROM services WHERE cleaner_id = ? AND is_active = 1", cleaner.id))?.count ?? 0;
  return (
    <div className="page">
      <div className="page-header"><div><div className="flex flex-wrap items-center gap-2"><p className="eyebrow">Cleaner workspace</p><span className={`badge ${cleaner.is_approved ? "border-teal-200 bg-teal-50 text-teal-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{cleaner.is_approved ? "Approved" : "Awaiting approval"}</span></div><h1 className="page-title">{cleaner.business_name}</h1><p className="page-copy">Manage incoming work, services, availability, and customer handoffs.</p></div><div className="flex gap-2"><Link className="btn-secondary" href="/cleaner/profile"><Settings2 size={17} />Profile</Link><Link className="btn-primary" href="/cleaner/services"><BriefcaseBusiness size={17} />Services</Link></div></div>
      {!cleaner.is_approved && <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Your profile is visible to administrators and will appear in the marketplace after approval.</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="surface stat"><p className="text-sm text-zinc-500">Active orders</p><p className="stat-value">{active}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Completed</p><p className="stat-value">{completed}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Service revenue</p><p className="stat-value text-xl">{money(revenue)}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Active services</p><p className="stat-value">{services}</p></div></div>
      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">Incoming and recent orders</h2><div className="flex gap-2"><Link className="btn-ghost" href="/cleaner/schedule"><CalendarDays size={17} />Schedule</Link><Link className="btn-ghost" href="/cleaner/reports"><CircleDollarSign size={17} />Reports</Link></div></div><div className="surface mt-4 overflow-x-auto">{orders.length ? <table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Pickup</th><th>Status</th><th>Value</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td className="font-bold text-brand-navy">#{order.id}</td><td>{order.customer_name || "Customer"}</td><td>{dateLabel(order.pickup_date)}<span className="block text-xs text-zinc-500">{order.pickup_time_window}</span></td><td><StatusBadge status={order.status} /></td><td>{money(order.subtotal)}</td><td><Link className="icon-button" href={`/orders/${order.id}`}><ArrowRight size={17} /></Link></td></tr>)}</tbody></table> : <div className="empty">Orders will appear here after customers book your services.</div>}</div></section>
    </div>
  );
}

