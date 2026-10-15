import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { CustomerAccountNav } from "@/components/customer-account-nav";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { dateTimeLabel, money } from "@/lib/format";

export const metadata: Metadata = { title: "Payment receipt" };
type Receipt = { id: number; order_id: number; amount: number; provider: string; reference: string | null; status: string; paid_at: string | null; created_at: string; business_name: string; subtotal: number; delivery_fee: number; platform_fee: number; total: number };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("CUSTOMER", { returnTo: "/customer/receipts" });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const receipt = await one<Receipt>(
    `SELECT p.id, p.order_id, p.amount, p.provider, p.reference, p.status, p.paid_at, p.created_at,
       c.business_name, o.subtotal, o.delivery_fee, o.platform_fee, o.total
     FROM payments p JOIN orders o ON o.id = p.order_id JOIN cleaners c ON c.id = o.cleaner_id
     WHERE p.id = ? AND p.customer_id = ? AND o.customer_id = ?`,
    id,
    user.id,
    user.id,
  );
  if (!receipt) notFound();
  return <div className="page"><CustomerAccountNav /><div className="page-header"><div><p className="eyebrow">LaundryLink receipt</p><h1 className="page-title">Payment #{receipt.id}</h1><p className="page-copy">Recorded {dateTimeLabel(receipt.paid_at || receipt.created_at)}</p></div><a className="btn-primary" href={`/api/receipts/${receipt.id}`}><Download size={17} />Download receipt</a></div><article className="surface mx-auto max-w-2xl p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-6"><div><p className="text-sm text-zinc-500">Paid to</p><h2 className="mt-1 text-xl font-bold text-brand-navy">{receipt.business_name}</h2><Link className="mt-2 inline-block text-sm font-bold text-brand-blue" href={`/orders/${receipt.order_id}`}>Order #{receipt.order_id}</Link></div><StatusBadge status={receipt.status} /></div><dl className="mt-6 grid gap-3 text-sm"><div className="flex justify-between"><dt className="text-zinc-500">Services subtotal</dt><dd className="font-bold">{money(receipt.subtotal)}</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Delivery fee</dt><dd className="font-bold">{money(receipt.delivery_fee)}</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Platform fee</dt><dd className="font-bold">{money(receipt.platform_fee)}</dd></div><div className="flex justify-between border-t border-zinc-200 pt-4 text-base"><dt className="font-bold text-brand-navy">Order total</dt><dd className="font-bold text-brand-navy">{money(receipt.total)}</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Payment amount</dt><dd className="font-bold text-brand-blue">{money(receipt.amount)}</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Provider</dt><dd className="font-bold capitalize">{receipt.provider}</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Reference</dt><dd className="max-w-xs break-all text-right font-mono text-xs">{receipt.reference || "Not provided"}</dd></div></dl></article></div>;
}
