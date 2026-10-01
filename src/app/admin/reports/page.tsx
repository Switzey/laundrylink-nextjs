import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/types";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Platform reports" };
type MonthRow = { month: string; orders: number; completed: number; volume: number; fees: number };

export default async function AdminReportsPage() {
  await requireUser(ADMIN_ROLES, { returnTo: "/admin/reports" });
  const stats = await one<{ orders: number; completed: number; volume: number; fees: number }>(`SELECT COUNT(1) AS orders, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed, COALESCE(SUM(CASE WHEN status='completed' THEN total ELSE 0 END),0) AS volume, COALESCE(SUM(CASE WHEN status='completed' THEN platform_fee ELSE 0 END),0) AS fees FROM orders`);
  const months = await all<MonthRow>(`SELECT substr(created_at,1,7) AS month, COUNT(1) AS orders, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed, COALESCE(SUM(CASE WHEN status='completed' THEN total ELSE 0 END),0) AS volume, COALESCE(SUM(CASE WHEN status='completed' THEN platform_fee ELSE 0 END),0) AS fees FROM orders GROUP BY substr(created_at,1,7) ORDER BY month DESC LIMIT 12`);
  return <div className="page"><div className="page-header"><div><p className="eyebrow">Marketplace performance</p><h1 className="page-title">Platform reports</h1><p className="page-copy">Order throughput, completed booking volume, and platform fee performance.</p></div></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="surface stat"><p className="text-sm text-zinc-500">All orders</p><p className="stat-value">{stats?.orders ?? 0}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Completed</p><p className="stat-value">{stats?.completed ?? 0}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Completed volume</p><p className="stat-value text-xl">{money(stats?.volume)}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Platform fees</p><p className="stat-value text-xl">{money(stats?.fees)}</p></div></div><section className="mt-8"><h2 className="section-title">Monthly summary</h2><div className="surface mt-4 overflow-x-auto"><table className="data-table"><thead><tr><th>Month</th><th>Orders</th><th>Completed</th><th>Volume</th><th>Platform fees</th></tr></thead><tbody>{months.map((row) => <tr key={row.month}><td className="font-bold text-brand-navy">{row.month}</td><td>{row.orders}</td><td>{row.completed}</td><td>{money(row.volume)}</td><td>{money(row.fees)}</td></tr>)}</tbody></table></div></section></div>;
}

