import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, X } from "lucide-react";
import { setCleanerApprovalAction } from "@/app/actions/admin";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/types";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";
import type { Cleaner, OrderSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminDashboardPage() {
  await requireUser(ADMIN_ROLES);
  const stats = await one<{ users: number; cleaners: number; active_orders: number; volume: number }>(`SELECT (SELECT COUNT(1) FROM users) AS users, (SELECT COUNT(1) FROM cleaners WHERE is_approved = 1) AS cleaners, (SELECT COUNT(1) FROM orders WHERE status NOT IN ('completed','cancelled')) AS active_orders, (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'completed') AS volume`);
  const cleaners = await all<Cleaner>("SELECT * FROM cleaners ORDER BY is_approved ASC, created_at DESC");
  const orders = await all<OrderSummary>(`SELECT o.*, c.business_name, u.name AS customer_name FROM orders o JOIN cleaners c ON c.id = o.cleaner_id LEFT JOIN users u ON u.id = o.customer_id ORDER BY o.created_at DESC LIMIT 8`);
  return (
    <div className="page"><div className="page-header"><div><p className="eyebrow">Platform administration</p><h1 className="page-title">LaundryLink overview</h1><p className="page-copy">Monitor marketplace health, cleaner approvals, active operations, and completed volume.</p></div><div className="flex gap-2"><Link className="btn-secondary" href="/admin/logistics">Logistics</Link><Link className="btn-primary" href="/admin/reports">Reports</Link></div></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="surface stat"><p className="text-sm text-zinc-500">Registered users</p><p className="stat-value">{stats?.users ?? 0}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Approved cleaners</p><p className="stat-value">{stats?.cleaners ?? 0}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Active orders</p><p className="stat-value">{stats?.active_orders ?? 0}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Completed volume</p><p className="stat-value text-xl">{money(stats?.volume)}</p></div></div>
      <section className="mt-8"><div className="flex items-center gap-2"><ShieldCheck className="text-brand-blue" size={21} /><h2 className="section-title">Cleaner approvals</h2></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{cleaners.map((cleaner) => <article className="surface flex items-start justify-between gap-4 p-5" key={cleaner.id}><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-brand-navy">{cleaner.business_name}</h3><span className={`badge ${cleaner.is_approved ? "border-teal-200 bg-teal-50 text-teal-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{cleaner.is_approved ? "Approved" : "Pending"}</span></div><p className="mt-1 text-sm text-zinc-600">{cleaner.city} · {cleaner.phone}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{cleaner.description}</p></div><form action={setCleanerApprovalAction}><input type="hidden" name="cleaner_id" value={cleaner.id} /><input type="hidden" name="approved" value={cleaner.is_approved ? "0" : "1"} /><button className={cleaner.is_approved ? "icon-button text-rose-600" : "icon-button text-teal-600"} title={cleaner.is_approved ? "Pause approval" : "Approve cleaner"}>{cleaner.is_approved ? <X size={17} /> : <Check size={17} />}</button></form></article>)}</div></section>
      <section className="mt-8"><div className="flex items-center justify-between"><h2 className="section-title">Recent orders</h2><Link className="text-sm font-bold text-brand-blue" href="/admin/logistics">View all</Link></div><div className="surface mt-4 overflow-x-auto"><table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Cleaner</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td className="font-bold text-brand-navy">#{order.id}</td><td>{order.customer_name || "Customer"}</td><td>{order.business_name}</td><td><StatusBadge status={order.status} /></td><td>{money(order.total)}</td><td><Link className="icon-button" href={`/orders/${order.id}`}><ArrowRight size={17} /></Link></td></tr>)}</tbody></table></div></section>
    </div>
  );
}

