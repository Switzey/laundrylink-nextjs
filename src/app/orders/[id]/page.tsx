import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, MapPin, PackageCheck, Star } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { rescheduleOrderAction, updateOrderStatusAction } from "@/app/actions/orders";
import { StatusBadge } from "@/components/status-badge";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { STATUS_FLOW, TIME_WINDOWS } from "@/lib/constants";
import { all, one } from "@/lib/db";
import { dateLabel, dateTimeLabel, humanize, money } from "@/lib/format";

export const metadata: Metadata = { title: "Order details" };
type OrderDetail = { id: number; customer_id: number | null; cleaner_id: number; pickup_address: string | null; delivery_address: string | null; pickup_date: string | null; pickup_time_window: string | null; delivery_date: string | null; delivery_time_window: string | null; status: string; subtotal: number; delivery_fee: number; platform_fee: number; total: number; payment_status: string; pickup_notes: string | null; delivery_notes: string | null; notes: string | null; created_at: string; business_name: string; cleaner_user_id: number | null; customer_name: string | null };
type Item = { id: number; name: string; quantity: number; price: number; unit: string };
type Activity = { id: number; action: string; description: string; created_at: string; user_name: string | null };
type Review = { rating: number; comment: string | null; customer_name: string | null };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await requireUser();
  const orderId = Number((await params).id);
  const message = await searchParams;
  const order = await one<OrderDetail>(`SELECT o.*, c.business_name, c.user_id AS cleaner_user_id, u.name AS customer_name FROM orders o JOIN cleaners c ON c.id = o.cleaner_id LEFT JOIN users u ON u.id = o.customer_id WHERE o.id = ?`, orderId);
  if (!order) notFound();
  const cleanerId = user.role === "cleaner" ? await cleanerIdForUser(user.id) : null;
  if (user.role === "customer" && order.customer_id !== user.id) redirect("/customer/dashboard");
  if (user.role === "cleaner" && order.cleaner_id !== cleanerId) redirect("/cleaner/dashboard");
  const items = await all<Item>(`SELECT oi.id, s.name, s.unit, oi.quantity, oi.price FROM order_items oi JOIN services s ON s.id = oi.service_id WHERE oi.order_id = ?`, orderId);
  const activities = await all<Activity>(`SELECT a.*, u.name AS user_name FROM order_activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.order_id = ? ORDER BY a.created_at`, orderId);
  const review = await one<Review>(`SELECT r.rating, r.comment, u.name AS customer_name FROM reviews r LEFT JOIN users u ON u.id = r.customer_id WHERE r.order_id = ?`, orderId);
  const nextStatuses = STATUS_FLOW[order.status] ?? [];
  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Order #{order.id}</p><h1 className="page-title">{order.business_name}</h1><p className="page-copy">Created {dateTimeLabel(order.created_at)} for {order.customer_name || "LaundryLink customer"}.</p></div><div className="flex flex-wrap gap-2"><StatusBadge status={order.status} /><StatusBadge status={order.payment_status} /></div></div>
      {message.success && <p className="mb-5 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-700">{message.success.replaceAll("+", " ")}</p>}{message.error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{message.error.replaceAll("+", " ")}</p>}
      <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <div className="grid gap-6"><section className="surface panel"><h2 className="section-title">Services</h2><div className="mt-4 divide-y divide-zinc-100">{items.map((item) => <div className="flex items-center justify-between gap-4 py-3" key={item.id}><div><strong className="text-brand-navy">{item.name}</strong><p className="mt-1 text-xs text-zinc-500">{item.quantity} × {money(item.price)} / {item.unit.replaceAll("_", " ")}</p></div><strong>{money(item.quantity * Number(item.price))}</strong></div>)}</div><div className="mt-4 grid gap-2 border-t border-zinc-200 pt-4 text-sm"><div className="flex justify-between text-zinc-600"><span>Subtotal</span><span>{money(order.subtotal)}</span></div><div className="flex justify-between text-zinc-600"><span>Delivery fee</span><span>{money(order.delivery_fee)}</span></div><div className="flex justify-between text-zinc-600"><span>Platform fee</span><span>{money(order.platform_fee)}</span></div><div className="flex justify-between pt-2 text-lg font-bold text-brand-navy"><span>Total</span><span>{money(order.total)}</span></div></div></section>
          <section className="surface panel"><h2 className="section-title">Order activity</h2><div className="relative mt-5 grid gap-5 border-l-2 border-brand-mint pl-5">{activities.length ? activities.map((item) => <article className="relative" key={item.id}><span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-teal" /><p className="font-bold text-brand-navy">{humanize(item.action)}</p><p className="mt-1 text-sm leading-6 text-zinc-600">{item.description}</p><p className="mt-1 text-xs text-zinc-400">{dateTimeLabel(item.created_at)}{item.user_name ? ` by ${item.user_name}` : ""}</p></article>) : <p className="text-sm text-zinc-500">Activity will appear as the order progresses.</p>}</div></section>
          {review && <section className="surface panel"><div className="flex items-center gap-2"><Star className="text-amber-500" fill="currentColor" size={20} /><h2 className="section-title">Customer review</h2></div><p className="mt-3 font-bold text-brand-navy">{review.rating}/5 from {review.customer_name || "Customer"}</p><p className="mt-2 text-sm leading-6 text-zinc-600">{review.comment || "A positive LaundryLink experience."}</p></section>}
        </div>
        <aside className="grid h-fit gap-5"><section className="surface panel"><div className="flex items-center gap-2"><CalendarClock size={20} className="text-brand-blue" /><h2 className="section-title">Schedule</h2></div><div className="mt-4 grid gap-4 text-sm"><div><p className="font-bold text-brand-navy">Pickup</p><p className="mt-1 text-zinc-600">{dateLabel(order.pickup_date)} · {order.pickup_time_window}</p></div><div><p className="font-bold text-brand-navy">Delivery</p><p className="mt-1 text-zinc-600">{dateLabel(order.delivery_date)} · {order.delivery_time_window || "Window pending"}</p></div></div></section>
          <section className="surface panel"><div className="flex items-center gap-2"><MapPin size={20} className="text-brand-teal" /><h2 className="section-title">Addresses</h2></div><div className="mt-4 grid gap-4 text-sm"><div><p className="font-bold text-brand-navy">Pickup</p><p className="mt-1 leading-6 text-zinc-600">{order.pickup_address}</p>{order.pickup_notes && <p className="mt-1 text-xs text-zinc-500">{order.pickup_notes}</p>}</div><div><p className="font-bold text-brand-navy">Delivery</p><p className="mt-1 leading-6 text-zinc-600">{order.delivery_address}</p>{order.delivery_notes && <p className="mt-1 text-xs text-zinc-500">{order.delivery_notes}</p>}</div></div></section>
          {user.role === "cleaner" && nextStatuses.length > 0 && <section className="surface panel"><h2 className="section-title">Update progress</h2><div className="mt-4 grid gap-2">{nextStatuses.map((status) => <form action={updateOrderStatusAction} key={status}><input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="status" value={status} /><button className={status === "cancelled" ? "btn-danger w-full" : "btn-primary w-full"} type="submit">Mark as {humanize(status)}</button></form>)}</div></section>}
          {user.role === "customer" && ["pending", "accepted"].includes(order.status) && <details className="surface panel"><summary className="font-bold text-brand-navy">Reschedule pickup</summary><form action={rescheduleOrderAction} className="form-grid mt-5"><input type="hidden" name="order_id" value={order.id} /><label><span className="field-label">Pickup date</span><input className="field" type="date" name="pickup_date" defaultValue={order.pickup_date ?? ""} required /></label><label><span className="field-label">Pickup window</span><select className="field" name="pickup_time_window" defaultValue={order.pickup_time_window ?? ""}>{TIME_WINDOWS.map((window) => <option key={window}>{window}</option>)}</select></label><label><span className="field-label">Delivery date</span><input className="field" type="date" name="delivery_date" defaultValue={order.delivery_date ?? ""} /></label><label><span className="field-label">Delivery window</span><select className="field" name="delivery_time_window" defaultValue={order.delivery_time_window ?? ""}><option value="">Not set</option>{TIME_WINDOWS.map((window) => <option key={window}>{window}</option>)}</select></label><button className="btn-secondary" type="submit">Save schedule</button></form></details>}
          {user.role === "customer" && order.status === "completed" && !review && <Link className="btn-primary" href={`/orders/${order.id}/review`}><Star size={17} />Review this cleaner</Link>}
          <Link className="btn-secondary" href={user.role === "admin" ? "/admin/dashboard" : user.role === "cleaner" ? "/cleaner/dashboard" : "/customer/dashboard"}><PackageCheck size={17} />Back to dashboard</Link>
        </aside>
      </div>
    </div>
  );
}

