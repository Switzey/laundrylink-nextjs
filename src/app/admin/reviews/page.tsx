import type { Metadata } from "next";
import { Star, Trash2 } from "lucide-react";
import { deleteReviewAction } from "@/app/actions/admin";
import { requireUser } from "@/lib/auth";
import { SUPPORT_ROLES } from "@/lib/types";
import { all } from "@/lib/db";
import { dateTimeLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Review moderation" };
type ReviewRow = { id: number; order_id: number; rating: number; comment: string | null; created_at: string; customer_name: string | null; business_name: string };

export default async function AdminReviewsPage() {
  await requireUser(SUPPORT_ROLES);
  const reviews = await all<ReviewRow>(`SELECT r.*, u.name AS customer_name, c.business_name FROM reviews r LEFT JOIN users u ON u.id = r.customer_id JOIN cleaners c ON c.id = r.cleaner_id ORDER BY r.created_at DESC`);
  return <div className="page"><div className="page-header"><div><p className="eyebrow">Trust and quality</p><h1 className="page-title">Review moderation</h1><p className="page-copy">Review marketplace feedback and remove content that should not remain public.</p></div></div><div className="grid gap-4">{reviews.length ? reviews.map((review) => <article className="surface flex items-start justify-between gap-4 p-5" key={review.id}><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-brand-navy">{review.business_name}</h2><span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700"><Star size={15} fill="currentColor" />{review.rating}/5</span></div><p className="mt-2 text-sm leading-6 text-zinc-600">{review.comment || "No written comment."}</p><p className="mt-2 text-xs text-zinc-400">Order #{review.order_id} · {review.customer_name || "Customer"} · {dateTimeLabel(review.created_at)}</p></div><form action={deleteReviewAction}><input type="hidden" name="review_id" value={review.id} /><button className="icon-button text-rose-600" title="Delete review"><Trash2 size={17} /></button></form></article>) : <div className="surface empty">No reviews have been submitted.</div>}</div></div>;
}

