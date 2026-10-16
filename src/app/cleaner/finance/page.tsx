import type { Metadata } from "next";
import Link from "next/link";
import { Download, Landmark, ReceiptText, TrendingUp } from "lucide-react";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";
import { vendorNetRevenue } from "@/lib/vendor-operations";
import { VENDOR_MANAGEMENT_ROLES } from "@/lib/types";

export const metadata: Metadata={title:"Vendor finance"};
type Summary={revenue:number;pending:number;settled:number;orders:number;commission_rate:number};
type Period={period:string;orders:number;revenue:number;refunds:number};
type Category={category:string;revenue:number;quantity:number};
type Resolution={id:number;order_id:number;type:string;amount:number|null;reason:string;status:string;created_at:string};
export default async function FinancePage(){
 const user=await requireUser(VENDOR_MANAGEMENT_ROLES,{returnTo:"/cleaner/finance"}); const cleanerId=await cleanerIdForUser(user.id);
 const [summary,months,categories,resolutions]=await Promise.all([
  cleanerId?one<Summary>(`SELECT COALESCE(SUM(CASE WHEN o.status='completed' THEN o.subtotal ELSE 0 END),0) revenue,COALESCE(SUM(CASE WHEN o.status='completed' AND o.payment_status<>'paid' THEN o.subtotal ELSE 0 END),0) pending,COALESCE(SUM(CASE WHEN o.status='completed' AND o.payment_status='paid' THEN o.subtotal ELSE 0 END),0) settled,COUNT(CASE WHEN o.status='completed' THEN 1 END) orders,c.commission_rate FROM cleaners c LEFT JOIN orders o ON o.cleaner_id=c.id WHERE c.id=? GROUP BY c.id`,cleanerId):null,
  cleanerId?all<Period>(`SELECT substr(created_at,1,7) period,COUNT(*) orders,COALESCE(SUM(CASE WHEN status='completed' THEN subtotal ELSE 0 END),0) revenue,0 refunds FROM orders WHERE cleaner_id=? GROUP BY substr(created_at,1,7) ORDER BY period DESC LIMIT 12`,cleanerId):[],
  cleanerId?all<Category>(`SELECT s.category,COALESCE(SUM(oi.price*oi.quantity),0) revenue,COALESCE(SUM(oi.quantity),0) quantity FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN services s ON s.id=oi.service_id WHERE o.cleaner_id=? AND o.status='completed' GROUP BY s.category ORDER BY revenue DESC`,cleanerId):[],
  cleanerId?all<Resolution>(`SELECT r.id,r.order_id,r.type,r.amount,r.reason,r.status,r.created_at FROM order_resolution_requests r JOIN orders o ON o.id=r.order_id WHERE o.cleaner_id=? ORDER BY r.created_at DESC LIMIT 30`,cleanerId):[],
 ]);
 const revenue=Number(summary?.revenue??0), rate=Number(summary?.commission_rate??10), result=vendorNetRevenue(revenue,rate);
 return <div className="page"><div className="page-header"><div><p className="eyebrow">Revenue and settlements</p><h1 className="page-title">Finance</h1><p className="page-copy">Monitor earnings, commission, settlement status, and authorized adjustments.</p></div><Link className="btn-primary" href="/api/vendor/finance.csv"><Download size={17}/>Download CSV</Link></div>
 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="surface stat"><p className="text-sm text-zinc-500">Gross revenue</p><p className="stat-value text-xl">{money(revenue)}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Marketplace commission ({rate}%)</p><p className="stat-value text-xl">{money(result.commission)}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Net earnings</p><p className="stat-value text-xl">{money(result.net)}</p></div><div className="surface stat"><p className="text-sm text-zinc-500">Pending collection</p><p className="stat-value text-xl">{money(summary?.pending)}</p></div></div>
 <div className="mt-7 grid gap-7 lg:grid-cols-2"><section><div className="flex items-center gap-2"><TrendingUp className="text-brand-blue"/><h2 className="section-title">Monthly performance</h2></div><div className="surface mt-4 overflow-x-auto"><table className="data-table"><thead><tr><th>Period</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>{months.map(row=><tr key={row.period}><td>{row.period}</td><td>{row.orders}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></section><section><div className="flex items-center gap-2"><Landmark className="text-brand-blue"/><h2 className="section-title">Revenue by category</h2></div><div className="surface mt-4 overflow-x-auto"><table className="data-table"><thead><tr><th>Category</th><th>Units</th><th>Revenue</th></tr></thead><tbody>{categories.map(row=><tr key={row.category}><td>{row.category}</td><td>{row.quantity}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></section></div>
 <section className="mt-7"><div className="flex items-center gap-2"><ReceiptText className="text-brand-blue"/><h2 className="section-title">Refund, compensation and amendment requests</h2></div><div className="surface mt-4 overflow-x-auto"><table className="data-table"><thead><tr><th>Order</th><th>Request</th><th>Amount</th><th>Reason</th><th>Status</th></tr></thead><tbody>{resolutions.map(row=><tr key={row.id}><td>#{row.order_id}</td><td>{row.type}</td><td>{row.amount?money(row.amount):"—"}</td><td>{row.reason}</td><td>{row.status}</td></tr>)}</tbody></table></div></section></div>;
}
