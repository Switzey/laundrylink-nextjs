"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { now, one, run } from "@/lib/db";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function setCleanerApprovalAction(formData: FormData) {
  await requireUser("admin");
  const cleanerId = Number(text(formData, "cleaner_id"));
  const approved = text(formData, "approved") === "1" ? 1 : 0;
  const cleaner = await one<{ user_id: number | null; business_name: string }>("SELECT user_id, business_name FROM cleaners WHERE id = ?", cleanerId);
  if (!cleaner) return;
  await run("UPDATE cleaners SET is_approved = ?, updated_at = ? WHERE id = ?", approved, now(), cleanerId);
  if (cleaner.user_id) await run("INSERT INTO notifications (user_id, title, message, type, data, created_at, updated_at) VALUES (?, ?, ?, 'cleaner_approval', ?, ?, ?)", cleaner.user_id, approved ? "Cleaner profile approved" : "Cleaner approval paused", approved ? `${cleaner.business_name} is now visible to customers.` : `${cleaner.business_name} is no longer accepting new marketplace orders.`, JSON.stringify({ cleaner_id: cleanerId, approved: Boolean(approved) }), now(), now());
  revalidatePath("/admin/dashboard");
  revalidatePath("/cleaners");
}

export async function deleteReviewAction(formData: FormData) {
  await requireUser("admin");
  const reviewId = Number(text(formData, "review_id"));
  const review = await one<{ cleaner_id: number }>("SELECT cleaner_id FROM reviews WHERE id = ?", reviewId);
  if (!review) return;
  await run("DELETE FROM reviews WHERE id = ?", reviewId);
  const average = (await one<{ rating: number }>("SELECT AVG(rating) AS rating FROM reviews WHERE cleaner_id = ?", review.cleaner_id))?.rating ?? 0;
  await run("UPDATE cleaners SET rating = ?, updated_at = ? WHERE id = ?", Number(average).toFixed(1), now(), review.cleaner_id);
  revalidatePath("/admin/reviews");
}
