import type { Metadata } from "next";
import Link from "next/link";
import { Download, ReceiptText } from "lucide-react";
import { CustomerAccountNav } from "@/components/customer-account-nav";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateTimeLabel, money } from "@/lib/format";

export const metadata: Metadata = { title: "Invoices and receipts" };
type Payment = { id: number; order_id: number; amount: number; provider: string; reference: string | null; status: string; paid_at: string | null; created_at: string; business_name: string };

export default async function ReceiptsPage() {
  const user = await requireUser("CUSTOMER", { returnTo: "/customer/receipts" });
  const payments = await all<Payment>(
    `SELECT p.id, p.order_id, p.amount, p.provider, p.reference, p.status, p.paid_at, p.created_at, c.business_name
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     JOIN cleaners c ON c.id = o.cleaner_id
     WHERE p.customer_id = ? AND o.customer_id = ?
     ORDER BY COALESCE(p.paid_at, p.created_at) DESC`,
    user.id,
    user.id,
  );
  return <div className="page"><CustomerAccountNav /><div className="page-header"><div><p className="eyebrow">Payment records</p><h1 className="page-title">Invoices and receipts</h1><p className="page-copy">View each payment and download a receipt for your records.</p></div></div><div className="surface overflow-x-auto">{payments.length ? <table className="data-table"><thead><tr><th>Payment</th><th>Order</th><th>Cleaner</th><th>Date</th><th>Status</th><th>Amount</th><th></th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><span className="font-bold text-brand-navy">#{payment.id}</span><span className="block text-xs text-zinc-500">{payment.reference || payment.provider}</span></td><td><Link className="font-bold text-brand-blue" href={`/orders/${payment.order_id}`}>#{payment.order_id}</Link></td><td>{payment.business_name}</td><td>{dateTimeLabel(payment.paid_at || payment.created_at)}</td><td><StatusBadge status={payment.status} /></td><td>{money(payment.amount)}</td><td><div className="flex gap-2"><Link className="icon-button" href={`/customer/receipts/${payment.id}`} aria-label={`View receipt ${payment.id}`}><ReceiptText size={16} /></Link><a className="icon-button" href={`/api/receipts/${payment.id}`} aria-label={`Download receipt ${payment.id}`}><Download size={16} /></a></div></td></tr>)}</tbody></table> : <div className="empty"><ReceiptText className="mx-auto mb-3 text-brand-sky" size={34} /><p>No payment receipts yet.</p></div>}</div></div>;
}
