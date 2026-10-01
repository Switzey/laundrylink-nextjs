import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin, PackageCheck, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { dateLabel, money } from "@/lib/format";
import type { OrderSummary } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Customer dashboard" };

export default async function CustomerDashboard() {
  const user = await requireUser("CUSTOMER");
  const orders = await all<OrderSummary>(`SELECT o.*, c.business_name FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.customer_id = ? ORDER BY o.created_at DESC`, user.id);
  const active = orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length;
  const completed = orders.filter((order) => order.status === "completed").length;
  const spend = orders.filter((order) => order.payment_status === "paid").reduce((sum, order) => sum + Number(order.total), 0);
  const addressCount = (await one<{ count: number }>("SELECT COUNT(1) AS count FROM addresses WHERE user_id = ?", user.id))?.count ?? 0;
  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Customer workspace</p><h1 className="page-title">Good to see you, {user.name.split(" ")[0]}</h1><p className="page-copy">Track every order, schedule the next pickup, and keep your delivery details ready.</p></div><Link className="btn-primary" href="/orders/new"><Plus size={18} />New order</Link></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface stat"><p className="text-sm text-zinc-500">Active orders</p><p className="stat-value">{active}</p></div>
        <div className="surface stat"><p className="text-sm text-zinc-500">Completed</p><p className="stat-value">{completed}</p></div>
        <div className="surface stat"><p className="text-sm text-zinc-500">Paid spend</p><p className="stat-value text-xl">{money(spend)}</p></div>
        <Link href="/customer/addresses" className="surface stat transition hover:border-blue-300"><p className="text-sm text-zinc-500">Saved addresses</p><p className="stat-value flex items-center gap-2"><MapPin size={23} className="text-brand-teal" />{addressCount}</p></Link>
      </div>
      <section className="mt-8"><div className="flex items-center justify-between"><h2 className="section-title">Recent orders</h2><Link href="/cleaners" className="text-sm font-bold text-brand-blue">Browse cleaners</Link></div>
        <div className="surface mt-4 overflow-x-auto">{orders.length ? <table className="data-table"><thead><tr><th>Order</th><th>Cleaner</th><th>Pickup</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td className="font-bold text-brand-navy">#{order.id}</td><td>{order.business_name}</td><td>{dateLabel(order.pickup_date)}<span className="block text-xs text-zinc-500">{order.pickup_time_window}</span></td><td><StatusBadge status={order.status} /></td><td>{money(order.total)}</td><td><Link href={`/orders/${order.id}`} className="icon-button" aria-label={`View order ${order.id}`}><ArrowRight size={17} /></Link></td></tr>)}</tbody></table> : <div className="empty"><PackageCheck className="mx-auto mb-3 text-brand-sky" size={34} /><p>No orders yet.</p><Link href="/cleaners" className="btn-primary mt-4">Find a cleaner</Link></div>}</div>
      </section>
    </div>
  );
}

