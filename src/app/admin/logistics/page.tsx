import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { LOGISTICS_ROLES } from "@/lib/types";
import { all } from "@/lib/db";
import { dateLabel, money } from "@/lib/format";
import { boundedSearchTerm, likePattern } from "@/lib/validation";
import type { OrderSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Logistics" };

export default async function LogisticsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireUser(LOGISTICS_ROLES);
  const { status: requestedStatus = "active", q } = await searchParams;
  const allowedStatuses = ["active", "all", "pending", "accepted", "picked_up", "in_cleaning", "ready", "out_for_delivery", "completed", "cancelled"];
  const status = allowedStatuses.includes(requestedStatus) ? requestedStatus : "active";
  const statusSql = status === "all" ? "1=1" : status === "active" ? "o.status NOT IN ('completed','cancelled')" : "o.status = ?";
  const params: (string | number)[] = status === "all" || status === "active" ? [] : [status];
  const query = boundedSearchTerm(q);
  const search = likePattern(query);
  const orders = await all<OrderSummary>(`SELECT o.*, c.business_name, u.name AS customer_name FROM orders o JOIN cleaners c ON c.id = o.cleaner_id LEFT JOIN users u ON u.id = o.customer_id WHERE ${statusSql} AND (CAST(o.id AS TEXT) LIKE ? ESCAPE '\\' OR c.business_name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\') ORDER BY COALESCE(o.pickup_date, o.created_at), o.created_at DESC`, ...params, search, search, search);
  return <div className="page"><div className="page-header"><div><p className="eyebrow">Operations</p><h1 className="page-title">Logistics board</h1><p className="page-copy">Scan scheduled work and open any order for full handoff details.</p></div></div><form className="surface mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto]"><label className="relative"><Search className="absolute left-3 top-3 text-zinc-400" size={18} /><input className="field pl-10" name="q" defaultValue={query} maxLength={100} placeholder="Order, customer, or cleaner" /></label><select className="field" name="status" defaultValue={status}><option value="active">Active</option><option value="all">All orders</option>{["pending","accepted","picked_up","in_cleaning","ready","out_for_delivery","completed","cancelled"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><button className="btn-primary" type="submit">Filter</button></form><div className="surface overflow-x-auto">{orders.length ? <table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Cleaner</th><th>Pickup</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td className="font-bold text-brand-navy">#{order.id}</td><td>{order.customer_name || "Customer"}</td><td>{order.business_name}</td><td>{dateLabel(order.pickup_date)}<span className="block text-xs text-zinc-500">{order.pickup_time_window}</span></td><td><StatusBadge status={order.status} /></td><td>{money(order.total)}</td><td><Link className="icon-button" href={`/orders/${order.id}`}><ArrowRight size={17} /></Link></td></tr>)}</tbody></table> : <div className="empty">No orders match this view.</div>}</div></div>;
}

