import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createReviewAction } from "@/app/actions/orders";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";

export const metadata: Metadata = { title: "Review order" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("customer");
  const orderId = Number((await params).id);
  const order = await one<{ id: number; customer_id: number; status: string; business_name: string }>(`SELECT o.id, o.customer_id, o.status, c.business_name FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.id = ?`, orderId);
  if (!order) notFound();
  if (order.customer_id !== user.id || order.status !== "completed" || await one("SELECT id FROM reviews WHERE order_id = ?", orderId)) redirect(`/orders/${orderId}`);
  return (
    <div className="page flex flex-1 items-center justify-center"><form action={createReviewAction} className="surface w-full max-w-xl p-6 sm:p-8"><input type="hidden" name="order_id" value={order.id} /><p className="eyebrow">Order #{order.id}</p><h1 className="mt-2 text-3xl font-bold text-brand-navy">Review {order.business_name}</h1><p className="mt-2 text-zinc-600">Share an honest rating to help other customers choose confidently.</p><div className="form-grid mt-7"><label><span className="field-label">Rating</span><select className="field" name="rating" required defaultValue="5"><option value="5">5 - Excellent</option><option value="4">4 - Very good</option><option value="3">3 - Good</option><option value="2">2 - Fair</option><option value="1">1 - Poor</option></select></label><label><span className="field-label">Comment</span><textarea className="field min-h-32" name="comment" maxLength={1000} placeholder="How was the pickup, cleaning quality, and delivery?" /></label><button className="btn-primary" type="submit">Submit review</button></div></form></div>
  );
}
