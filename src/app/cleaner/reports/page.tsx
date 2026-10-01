import type { Metadata } from "next";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { VENDOR_MANAGEMENT_ROLES } from "@/lib/types";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Cleaner reports" };
type MonthRow = { month: string; orders: number; revenue: number };

export default async function CleanerReportsPage() {
  const user = await requireUser(VENDOR_MANAGEMENT_ROLES, { returnTo: "/cleaner/reports" });
  const cleanerId = await cleanerIdForUser(user.id);
  const stats = cleanerId ? await one<{ orders: number; completed: number; revenue: number; average_order: number }>(`SELECT COUNT(1) AS orders, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed, COALESCE(SUM(CASE WHEN status='completed' THEN subtotal ELSE 0 END),0) AS revenue, COALESCE(AVG(subtotal),0) AS average_order FROM orders WHERE cleaner_id = ?`, cleanerId) : null;
  const months = cleanerId ? await all<MonthRow>(`SELECT substr(created_at,1,7) AS month, COUNT(1) AS orders, COALESCE(SUM(CASE WHEN status='completed' THEN subtotal ELSE 0 END),0) AS revenue FROM orders WHERE cleaner_id = ? GROUP BY substr(created_at,1,7) ORDER BY month DESC LIMIT 12`, cleanerId) : [];
  return <div className="page"><div className="page-header"><div><p className="eyebrow">Performance</p><h1 className="page-title">Cleaner reports</h1><p className="page-copy">A practical view of order volume and completed service revenue.</p></div></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="surface stat"><p className="text-sm text-zinc-500">All orders</p><p className="stat-value">{stats?.orders ?? 0}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Completed</p><p className="stat-value">{stats?.completed ?? 0}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Revenue</p><p className="stat-value text-xl">{money(stats?.revenue)}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Average order</p><p className="stat-value text-xl">{money(stats?.average_order)}</p></div></div><section className="mt-8"><h2 className="section-title">Monthly performance</h2><div className="surface mt-4 overflow-x-auto"><table className="data-table"><thead><tr><th>Month</th><th>Orders</th><th>Completed revenue</th></tr></thead><tbody>{months.map((row) => <tr key={row.month}><td className="font-bold text-brand-navy">{row.month}</td><td>{row.orders}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></section></div>;
}
