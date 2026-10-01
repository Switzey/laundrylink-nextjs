"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { authorizeAction } from "@/lib/authorization";
import { now, one, run, transaction } from "@/lib/db";
import { parseFormOrRedirect, positiveId } from "@/lib/validation";

const approvalSchema = z.object({
  cleaner_id: positiveId,
  approved: z.enum(["0", "1"]).transform((value) => value === "1"),
});
const reviewSchema = z.object({ review_id: positiveId });

export async function setCleanerApprovalAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "admin.cleaner_approval",
    roles: "admin",
    rateLimit: { limit: 30, windowSeconds: 60 },
  });
  const input = parseFormOrRedirect(approvalSchema, formData, "/admin/dashboard", "Choose a valid cleaner.");

  await transaction(async () => {
    const cleaner = await one<{ user_id: number | null; business_name: string }>(
      "SELECT user_id, business_name FROM cleaners WHERE id = ?",
      input.cleaner_id,
    );
    if (!cleaner) return;
    await run(
      "UPDATE cleaners SET is_approved = ?, updated_at = ? WHERE id = ?",
      input.approved ? 1 : 0,
      now(),
      input.cleaner_id,
    );
    if (cleaner.user_id) {
      await run(
        `INSERT INTO notifications
          (user_id, title, message, type, data, created_at, updated_at)
         VALUES (?, ?, ?, 'cleaner_approval', ?, ?, ?)`,
        cleaner.user_id,
        input.approved ? "Cleaner profile approved" : "Cleaner approval paused",
        input.approved
          ? `${cleaner.business_name} is now visible to customers.`
          : `${cleaner.business_name} is no longer accepting new marketplace orders.`,
        JSON.stringify({ cleaner_id: input.cleaner_id, approved: input.approved }),
        now(),
        now(),
      );
    }
    await writeAuditLog({
      actorUserId: user.id,
      action: "admin.cleaner_approval",
      targetType: "cleaner",
      targetId: input.cleaner_id,
      outcome: "succeeded",
      metadata: { approved: input.approved },
      context,
    });
  });
  revalidatePath("/admin/dashboard");
  revalidatePath("/cleaners");
}

export async function deleteReviewAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "admin.review_delete",
    roles: "admin",
    rateLimit: { limit: 20, windowSeconds: 60 },
  });
  const { review_id: reviewId } = parseFormOrRedirect(
    reviewSchema,
    formData,
    "/admin/reviews",
    "Choose a valid review.",
  );

  await transaction(async () => {
    const review = await one<{ cleaner_id: number }>("SELECT cleaner_id FROM reviews WHERE id = ?", reviewId);
    if (!review) return;
    await run("DELETE FROM reviews WHERE id = ?", reviewId);
    const average = (await one<{ rating: number }>(
      "SELECT AVG(rating) AS rating FROM reviews WHERE cleaner_id = ?",
      review.cleaner_id,
    ))?.rating ?? 0;
    await run("UPDATE cleaners SET rating = ?, updated_at = ? WHERE id = ?", Number(average).toFixed(1), now(), review.cleaner_id);
    await writeAuditLog({
      actorUserId: user.id,
      action: "admin.review_delete",
      targetType: "review",
      targetId: reviewId,
      outcome: "succeeded",
      context,
    });
  });
  revalidatePath("/admin/reviews");
}
