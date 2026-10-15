import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, RefreshCw, Search } from "lucide-react";
import { reorderOrderAction } from "@/app/actions/orders";
import { CustomerAccountNav } from "@/components/customer-account-nav";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateLabel, money } from "@/lib/format";
import type { OrderSummary } from "@/lib/types";
import { boundedSearchTerm, likePattern } from "@/lib/validation";

export const metadata: Metadata = { title: "Order history" };

const filters = {
  all: "1 = 1",
  active: "o.status NOT IN ('completed', 'cancelled')",
  completed: "o.status = 'completed'",
  cancelled: "o.status = 'cancelled'",
  refunded: "o.payment_status = 'refunded'",
} as const;

export default async function CustomerOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; error?: string }> }) {
  const user = await requireUser("CUSTOMER", { returnTo: "/customer/orders" });
  const params = await searchParams;
  const q = boundedSearchTerm(params.q);
  const status = params.status && Object.prototype.hasOwnProperty.call(filters, params.status)
    ? params.status as keyof typeof filters
    : "all";
  const values: (string | number)[] = [user.id];
  let searchSql = "";
  if (q) {
    searchSql = "AND (c.business_name LIKE ? ESCAPE '\\' OR CAST(o.id AS TEXT) = ?)";
    values.push(likePattern(q), q);
  }
  const orders = await all<OrderSummary>(
    `SELECT o.*, c.business_name FROM orders o
     JOIN cleaners c ON c.id = o.cleaner_id
     WHERE o.customer_id = ? AND ${filters[status]} ${searchSql}
     ORDER BY o.created_at DESC`,
    ...values,
  );

  return (
    <div className="page">
      <CustomerAccountNav />
      <div className="page-header"><div><p className="eyebrow">Your bookings</p><h1 className="page-title">Order history</h1><p className="page-copy">Search every booking, check its status, or start again from a previous order.</p></div><Link className="btn-primary" href="/orders/new">New order</Link></div>
      {params.error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{params.error.replaceAll("+", " ")}</p>}
      <form className="surface mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto]" action="/customer/orders">
        <label><span className="field-label">Search</span><span className="relative block"><Search className="absolute left-3 top-3 text-zinc-400" size={17} /><input className="field pl-10" name="q" defaultValue={q} placeholder="Cleaner or order number" /></span></label>
        <label><span className="field-label">Status</span><select className="field" name="status" defaultValue={status}>{Object.keys(filters).map((value) => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
        <button className="btn-secondary self-end" type="submit">Apply</button>
      </form>
      <div className="surface overflow-x-auto">{orders.length ? <table className="data-table"><thead><tr><th>Order</th><th>Cleaner</th><th>Pickup</th><th>Status</th><th>Payment</th><th>Total</th><th>Actions</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td className="font-bold text-brand-navy">#{order.id}</td><td>{order.business_name}</td><td>{dateLabel(order.pickup_date)}<span className="block text-xs text-zinc-500">{order.pickup_time_window}</span></td><td><StatusBadge status={order.status} /></td><td><StatusBadge status={order.payment_status} /></td><td>{money(order.total)}</td><td><div className="flex gap-2"><Link href={`/orders/${order.id}`} className="icon-button" aria-label={`View order ${order.id}`}><ArrowRight size={17} /></Link>{["completed", "cancelled"].includes(order.status) && <form action={reorderOrderAction}><input type="hidden" name="order_id" value={order.id} /><button className="icon-button" type="submit" aria-label={`Reorder order ${order.id}`} title="Reorder"><RefreshCw size={16} /></button></form>}</div></td></tr>)}</tbody></table> : <div className="empty">No orders match this search.</div>}</div>
    </div>
  );
}
