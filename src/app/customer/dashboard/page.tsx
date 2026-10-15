import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, CalendarClock, CreditCard, PackageCheck, Plus } from "lucide-react";
import { CustomerAccountNav } from "@/components/customer-account-nav";
import { requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { dateLabel, money } from "@/lib/format";
import type { OrderSummary } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Customer dashboard" };

export default async function CustomerDashboard() {
  const user = await requireUser("CUSTOMER", { returnTo: "/customer/dashboard" });
  const [orders, metrics, unread] = await Promise.all([
    all<OrderSummary>(`SELECT o.*, c.business_name FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.customer_id = ? ORDER BY o.created_at DESC LIMIT 5`, user.id),
    one<{ active: number; upcoming: number; pending_payments: number }>(`SELECT
      SUM(CASE WHEN status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status NOT IN ('completed', 'cancelled') AND pickup_date >= date('now') THEN 1 ELSE 0 END) AS upcoming,
      SUM(CASE WHEN status <> 'cancelled' AND payment_status IN ('unpaid', 'pending', 'failed') THEN 1 ELSE 0 END) AS pending_payments
      FROM orders WHERE customer_id = ?`, user.id),
    one<{ count: number }>("SELECT COUNT(1) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL", user.id),
  ]);
  return (
    <div className="page">
      <CustomerAccountNav />
      <div className="page-header"><div><p className="eyebrow">Customer workspace</p><h1 className="page-title">Good to see you, {user.name.split(" ")[0]}</h1><p className="page-copy">Track every order, schedule the next pickup, and keep your delivery details ready.</p></div><Link className="btn-primary" href="/orders/new"><Plus size={18} />New order</Link></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/customer/orders?status=active" className="surface stat transition hover:border-blue-300"><p className="flex items-center gap-2 text-sm text-zinc-500"><PackageCheck size={16} />Active orders</p><p className="stat-value">{Number(metrics?.active ?? 0)}</p></Link>
        <Link href="/customer/orders?status=active" className="surface stat transition hover:border-blue-300"><p className="flex items-center gap-2 text-sm text-zinc-500"><CalendarClock size={16} />Upcoming pickups</p><p className="stat-value">{Number(metrics?.upcoming ?? 0)}</p></Link>
        <Link href="/customer/orders" className="surface stat transition hover:border-blue-300"><p className="flex items-center gap-2 text-sm text-zinc-500"><CreditCard size={16} />Pending payments</p><p className="stat-value">{Number(metrics?.pending_payments ?? 0)}</p></Link>
        <Link href="/notifications" className="surface stat transition hover:border-blue-300"><p className="flex items-center gap-2 text-sm text-zinc-500"><Bell size={16} />Unread notifications</p><p className="stat-value">{Number(unread?.count ?? 0)}</p></Link>
      </div>
      <section className="mt-8"><div className="flex items-center justify-between"><h2 className="section-title">Recent orders</h2><Link href="/customer/orders" className="text-sm font-bold text-brand-blue">View all orders</Link></div>
        <div className="surface mt-4 overflow-x-auto">{orders.length ? <table className="data-table"><thead><tr><th>Order</th><th>Cleaner</th><th>Pickup</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td className="font-bold text-brand-navy">#{order.id}</td><td>{order.business_name}</td><td>{dateLabel(order.pickup_date)}<span className="block text-xs text-zinc-500">{order.pickup_time_window}</span></td><td><StatusBadge status={order.status} /></td><td>{money(order.total)}</td><td><Link href={`/orders/${order.id}`} className="icon-button" aria-label={`View order ${order.id}`}><ArrowRight size={17} /></Link></td></tr>)}</tbody></table> : <div className="empty"><PackageCheck className="mx-auto mb-3 text-brand-sky" size={34} /><p>No orders yet.</p><Link href="/cleaners" className="btn-primary mt-4">Find a cleaner</Link></div>}</div>
      </section>
    </div>
  );
}
