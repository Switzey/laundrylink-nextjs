"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { authorizeAction } from "@/lib/authorization";
import { now, one, run, transaction } from "@/lib/db";
import { businessPhoneIsVerified } from "@/lib/phone-state";
import { parseFormOrRedirect, positiveId } from "@/lib/validation";
import { ADMIN_ROLES, SUPPORT_ROLES } from "@/lib/types";
import { getVendorEligibility } from "@/lib/vendor-eligibility";

const approvalSchema = z.object({
  cleaner_id: positiveId,
  approved: z.enum(["0", "1"]).transform((value) => value === "1"),
});
const suspensionSchema = z.object({
  cleaner_id: positiveId,
  suspended: z.enum(["0", "1"]).transform((value) => value === "1"),
});
const reviewSchema = z.object({ review_id: positiveId });

export async function setCleanerApprovalAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "admin.cleaner_approval",
    roles: ADMIN_ROLES,
    rateLimit: { limit: 30, windowSeconds: 60 },
  });
  const input = parseFormOrRedirect(approvalSchema, formData, "/admin/dashboard", "Choose a valid cleaner.");

  await transaction(async () => {
    const cleaner = await one<{ user_id: number | null; business_name: string; phone: string; business_phone_verified_at: string | null; business_phone_verified_e164: string | null; verification_status: string }>(
      "SELECT user_id, business_name, phone, business_phone_verified_at, business_phone_verified_e164, verification_status FROM cleaners WHERE id = ?",
      input.cleaner_id,
    );
    if (!cleaner) return;
    if (input.approved && cleaner.verification_status !== "pending") {
      redirect("/admin/dashboard?error=Only+submitted+vendor+applications+can+be+approved");
    }
    if (input.approved && !businessPhoneIsVerified(cleaner)) {
      redirect("/admin/dashboard?error=The+vendor+business+phone+must+be+verified+before+approval");
    }
    const eligibility = await getVendorEligibility(input.cleaner_id);
    if (input.approved && (!eligibility?.businessComplete || !eligibility.locationValid || !eligibility.verificationComplete)) {
      redirect("/admin/dashboard?error=The+vendor+must+complete+business,+location,+and+verification+requirements+before+approval");
    }
    await run(
      `UPDATE cleaners SET is_approved = ?, is_published = 0, is_available = 0, verification_status = ?,
       approved_at = ?, updated_at = ? WHERE id = ?`,
      input.approved ? 1 : 0,
      input.approved ? "approved" : "needs_changes",
      input.approved ? now() : null,
      now(),
      input.cleaner_id,
    );
    if (cleaner.user_id) {
      await run(
        `INSERT INTO notifications
          (user_id, title, message, type, data, created_at, updated_at)
         VALUES (?, ?, ?, 'cleaner_approval', ?, ?, ?)`,
        cleaner.user_id,
        input.approved ? "Vendor verification approved" : "Vendor changes requested",
        input.approved
          ? `${cleaner.business_name} passed verification. Review its marketplace settings before publishing and accepting orders.`
          : `${cleaner.business_name} requires changes before verification can be approved.`,
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
  revalidatePath(`/admin/cleaners/${input.cleaner_id}`);
  revalidatePath("/cleaners");
}

export async function setCleanerSuspensionAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "admin.cleaner_suspension",
    roles: ADMIN_ROLES,
    rateLimit: { limit: 30, windowSeconds: 60 },
  });
  const input = parseFormOrRedirect(suspensionSchema, formData, "/admin/dashboard", "Choose a valid cleaner.");

  await transaction(async () => {
    const cleaner = await one<{ id: number; user_id: number | null; business_name: string; verification_status: string }>(
      "SELECT id, user_id, business_name, verification_status FROM cleaners WHERE id = ?",
      input.cleaner_id,
    );
    if (!cleaner) return;
    if (cleaner.verification_status !== "approved") {
      redirect("/admin/dashboard?error=Only+approved+vendors+can+be+suspended");
    }

    await run(
      "UPDATE cleaners SET is_suspended = ?, is_available = 0, updated_at = ? WHERE id = ?",
      input.suspended ? 1 : 0,
      now(),
      input.cleaner_id,
    );
    if (cleaner.user_id) {
      await run(
        `INSERT INTO notifications
          (user_id, title, message, type, data, created_at, updated_at)
         VALUES (?, ?, ?, 'cleaner_suspension', ?, ?, ?)`,
        cleaner.user_id,
        input.suspended ? "Marketplace access suspended" : "Marketplace suspension lifted",
        input.suspended
          ? `${cleaner.business_name} cannot accept new orders while suspended. Existing orders remain available for authorized handling.`
          : `${cleaner.business_name} may be published again. Enable new orders when the business is ready.`,
        JSON.stringify({ cleaner_id: input.cleaner_id, suspended: input.suspended }),
        now(),
        now(),
      );
    }
    await writeAuditLog({
      actorUserId: user.id,
      action: "admin.cleaner_suspension",
      targetType: "cleaner",
      targetId: input.cleaner_id,
      outcome: "succeeded",
      metadata: { suspended: input.suspended },
      context,
    });
  });
  revalidatePath("/admin/dashboard");
  revalidatePath(`/admin/cleaners/${input.cleaner_id}`);
  revalidatePath("/cleaners");
  revalidatePath(`/cleaners/${input.cleaner_id}`);
}

export async function deleteReviewAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "admin.review_delete",
    roles: SUPPORT_ROLES,
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
