import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { createSupportTicketAction } from "@/app/actions/account";
import { CustomerAccountNav } from "@/components/customer-account-nav";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateTimeLabel, humanize } from "@/lib/format";

export const metadata: Metadata = { title: "Support centre" };
type OrderOption = { id: number; business_name: string };
type Ticket = { id: number; order_id: number | null; category: string; subject: string; message: string; status: string; resolution: string | null; created_at: string; updated_at: string };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await requireUser("CUSTOMER", { returnTo: "/customer/support" });
  const message = await searchParams;
  const [orders, tickets] = await Promise.all([
    all<OrderOption>(`SELECT o.id, c.business_name FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.customer_id = ? ORDER BY o.created_at DESC LIMIT 50`, user.id),
    all<Ticket>("SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC", user.id),
  ]);
  return <div className="page"><CustomerAccountNav /><div className="page-header"><div><p className="eyebrow">Help and complaints</p><h1 className="page-title">Support centre</h1><p className="page-copy">Report an order, payment, pickup, quality, or account issue and follow its resolution.</p></div></div>{message.success && <p className="mb-5 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{message.success.replaceAll("+", " ")}</p>}{message.error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{message.error.replaceAll("+", " ")}</p>}<div className="grid gap-7 lg:grid-cols-[.85fr_1.15fr]"><form action={createSupportTicketAction} className="surface panel form-grid h-fit"><div className="flex items-center gap-2"><LifeBuoy className="text-brand-blue" size={21} /><h2 className="section-title">New support request</h2></div><label><span className="field-label">Related order</span><select className="field" name="order_id"><option value="">Not order-specific</option>{orders.map((order) => <option value={order.id} key={order.id}>#{order.id} · {order.business_name}</option>)}</select></label><label><span className="field-label">Issue type</span><select className="field" name="category" required><option value="order">Order</option><option value="payment">Payment</option><option value="pickup_delivery">Pickup or delivery</option><option value="quality">Service quality</option><option value="account">Account</option><option value="other">Other</option></select></label><label><span className="field-label">Subject</span><input className="field" name="subject" minLength={3} maxLength={120} required /></label><label><span className="field-label">What happened?</span><textarea className="field min-h-36" name="message" minLength={10} maxLength={2000} required /></label><button className="btn-primary" type="submit">Submit request</button></form><section><h2 className="section-title">Your requests</h2><div className="mt-4 grid gap-3">{tickets.length ? tickets.map((ticket) => <article className="surface p-5" key={ticket.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-brand-blue">Request #{ticket.id} · {humanize(ticket.category)}</p><h3 className="mt-1 font-bold text-brand-navy">{ticket.subject}</h3></div><StatusBadge status={ticket.status} /></div><p className="mt-3 text-sm leading-6 text-zinc-600">{ticket.message}</p>{ticket.order_id && <Link className="mt-3 inline-block text-sm font-bold text-brand-blue" href={`/orders/${ticket.order_id}`}>View order #{ticket.order_id}</Link>}{ticket.resolution && <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3"><p className="text-xs font-bold uppercase text-teal-800">Resolution</p><p className="mt-1 text-sm text-teal-900">{ticket.resolution}</p></div>}<p className="mt-3 text-xs text-zinc-400">Opened {dateTimeLabel(ticket.created_at)} · Updated {dateTimeLabel(ticket.updated_at)}</p></article>) : <div className="surface empty">No support requests yet.</div>}</div></section></div></div>;
}
