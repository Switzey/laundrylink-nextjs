import type { Metadata } from "next";
import { CustomerAccountNav } from "@/components/customer-account-nav";
import { requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Spending history" };
type Month = { month: string; total: number; orders: number };
type ServiceUsage = { name: string; quantity: number; spend: number };

export default async function SpendingPage() {
  const user = await requireUser("CUSTOMER", { returnTo: "/customer/spending" });
  const [months, services, lifetime] = await Promise.all([
    all<Month>(`SELECT substr(COALESCE(p.paid_at, p.created_at), 1, 7) AS month, SUM(p.amount) AS total, COUNT(DISTINCT p.order_id) AS orders FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.customer_id = ? AND o.customer_id = ? AND p.status = 'paid' GROUP BY month ORDER BY month DESC LIMIT 12`, user.id, user.id),
    all<ServiceUsage>(`SELECT s.name, SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.price) AS spend FROM order_items oi JOIN services s ON s.id = oi.service_id JOIN orders o ON o.id = oi.order_id WHERE o.customer_id = ? AND o.payment_status = 'paid' GROUP BY s.name ORDER BY quantity DESC, spend DESC LIMIT 10`, user.id),
    one<{ total: number; orders: number }>(`SELECT COALESCE(SUM(p.amount), 0) AS total, COUNT(DISTINCT p.order_id) AS orders FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.customer_id = ? AND o.customer_id = ? AND p.status = 'paid'`, user.id, user.id),
  ]);
  return <div className="page"><CustomerAccountNav /><div className="page-header"><div><p className="eyebrow">Usage insights</p><h1 className="page-title">Spending history</h1><p className="page-copy">A monthly view of confirmed laundry payments and the services you use most.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="surface stat"><p className="text-sm text-zinc-500">Lifetime paid spend</p><p className="stat-value text-xl">{money(Number(lifetime?.total ?? 0))}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Paid orders</p><p className="stat-value">{Number(lifetime?.orders ?? 0)}</p></div></div><div className="mt-7 grid gap-7 lg:grid-cols-2"><section><h2 className="section-title">Monthly expenses</h2><div className="surface mt-4 overflow-x-auto">{months.length ? <table className="data-table"><thead><tr><th>Month</th><th>Orders</th><th>Spend</th></tr></thead><tbody>{months.map((month) => <tr key={month.month}><td className="font-bold text-brand-navy">{month.month}</td><td>{month.orders}</td><td>{money(month.total)}</td></tr>)}</tbody></table> : <div className="empty">No paid transactions yet.</div>}</div></section><section><h2 className="section-title">Service usage</h2><div className="surface mt-4 overflow-x-auto">{services.length ? <table className="data-table"><thead><tr><th>Service</th><th>Items</th><th>Value</th></tr></thead><tbody>{services.map((service) => <tr key={service.name}><td className="font-bold text-brand-navy">{service.name}</td><td>{service.quantity}</td><td>{money(service.spend)}</td></tr>)}</tbody></table> : <div className="empty">No paid service usage yet.</div>}</div></section></div></div>;
}
