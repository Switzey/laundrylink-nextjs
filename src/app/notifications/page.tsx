import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/account";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateTimeLabel, humanize } from "@/lib/format";

export const metadata: Metadata = { title: "Notifications" };
type Notification = { id: number; title: string; message: string; type: string | null; data: string | null; read_at: string | null; created_at: string };

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await all<Notification>("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", user.id);
  return <div className="page"><div className="page-header"><div><p className="eyebrow">Activity centre</p><h1 className="page-title">Notifications</h1><p className="page-copy">Order, schedule, review, and account updates in one place.</p></div>{notifications.some((item) => !item.read_at) && <form action={markAllNotificationsReadAction}><button className="btn-secondary"><CheckCheck size={17} />Mark all read</button></form>}</div><div className="grid gap-3">{notifications.length ? notifications.map((notification) => { let orderId: number | null = null; try { orderId = JSON.parse(notification.data || "{}").order_id ?? null; } catch {} return <article className={`surface flex items-start gap-4 p-5 ${notification.read_at ? "opacity-75" : "border-blue-200"}`} key={notification.id}><span className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${notification.read_at ? "bg-zinc-100 text-zinc-500" : "bg-blue-50 text-brand-blue"}`}><Bell size={19} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-brand-navy">{notification.title}</h2>{notification.type && <span className="badge border-zinc-200 bg-zinc-50 text-zinc-600">{humanize(notification.type)}</span>}</div><p className="mt-1 text-sm leading-6 text-zinc-600">{notification.message}</p><p className="mt-2 text-xs text-zinc-400">{dateTimeLabel(notification.created_at)}</p>{orderId && <Link className="mt-3 inline-block text-sm font-bold text-brand-blue" href={`/orders/${orderId}`}>View order</Link>}</div>{!notification.read_at && <form action={markNotificationReadAction}><input type="hidden" name="notification_id" value={notification.id} /><button className="icon-button" title="Mark read"><CheckCheck size={17} /></button></form>}</article>; }) : <div className="surface empty">You are all caught up.</div>}</div></div>;
}

