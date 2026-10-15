"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { authorizeAction } from "@/lib/authorization";
import { cleanerIdForUser } from "@/lib/auth";
import { now, one, run, transaction } from "@/lib/db";
import { phoneVerificationConfigured } from "@/lib/env";
import { normalizePhoneNumber } from "@/lib/phone-numbers";
import { beginPhoneVerification, completePhoneVerification } from "@/lib/phone-verification-attempts";
import { applyBusinessPhoneChange, businessPhoneIsVerified } from "@/lib/phone-state";
import { boundedMoney, optionalTextField, parseFormOrRedirect, positiveId, textField } from "@/lib/validation";
import { VENDOR_MANAGEMENT_ROLES } from "@/lib/types";
import { getVendorEligibility, pauseVendorWhenIneligible } from "@/lib/vendor-eligibility";
import { vendorEligibilityIssues } from "@/lib/vendor-eligibility-model";

const serviceSchema = z.object({
  name: textField(2, 120),
  category: textField(2, 80),
  description: optionalTextField(500),
  price: boundedMoney,
  unit: z.enum(["per_item", "per_kg", "per_pair", "per_set", "flat_rate"]),
  turnaround_time: textField(2, 100),
  express_available: z.string().optional().transform((value) => value === "on"),
});
const serviceIdSchema = z.object({ service_id: positiveId });
const cleanerProfileSchema = z.object({
  business_name: textField(2, 120),
  description: optionalTextField(1000),
  address: textField(3, 250),
  city: textField(2, 100),
  phone: textField(7, 30)
    .refine((value) => Boolean(normalizePhoneNumber(value)), "Enter a valid international phone number.")
    .transform((value) => normalizePhoneNumber(value)!),
  turnaround_time: optionalTextField(100),
  opening_hours: optionalTextField(150),
  is_published: z.string().optional().transform((value) => value === "on"),
  is_available: z.string().optional().transform((value) => value === "on"),
});
const phoneCodeSchema = z.object({ code: z.string().trim().regex(/^\d{4,10}$/, "Enter the verification code.") });

export async function addServiceAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.service_create", roles: VENDOR_MANAGEMENT_ROLES });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  if (!await one("SELECT id FROM cleaners WHERE id = ? AND verification_status = 'approved'", cleanerId)) redirect("/cleaner/onboarding");
  const input = parseFormOrRedirect(serviceSchema, formData, "/cleaner/services", "Enter valid service details.");
  await transaction(async () => {
    const result = await run(
      `INSERT INTO services
        (cleaner_id, name, category, description, price, unit, turnaround_time, express_available, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      cleanerId,
      input.name,
      input.category,
      input.description ?? null,
      input.price,
      input.unit,
      input.turnaround_time,
      input.express_available ? 1 : 0,
      now(),
      now(),
    );
    await writeAuditLog({
      actorUserId: user.id,
      action: "cleaner.service_create",
      targetType: "service",
      targetId: Number(result.lastInsertRowid),
      outcome: "succeeded",
      context,
    });
  });
  await pauseVendorWhenIneligible(cleanerId);
  revalidatePath("/cleaner/services");
  revalidatePath("/cleaners");
  revalidatePath(`/cleaners/${cleanerId}`);
}

export async function toggleServiceAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.service_toggle", roles: VENDOR_MANAGEMENT_ROLES });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  if (!await one("SELECT id FROM cleaners WHERE id = ? AND verification_status = 'approved'", cleanerId)) redirect("/cleaner/onboarding");
  const { service_id: serviceId } = parseFormOrRedirect(serviceIdSchema, formData, "/cleaner/services", "Choose a valid service.");
  const result = await run(
    `UPDATE services
     SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = ?
     WHERE id = ? AND cleaner_id = ?`,
    now(),
    serviceId,
    cleanerId,
  );
  if (result.changes) {
    await pauseVendorWhenIneligible(cleanerId);
    await writeAuditLog({ actorUserId: user.id, action: "cleaner.service_toggle", targetType: "service", targetId: serviceId, outcome: "succeeded", context });
  }
  revalidatePath("/cleaner/services");
  revalidatePath("/cleaners");
  revalidatePath(`/cleaners/${cleanerId}`);
}

export async function deleteServiceAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.service_delete", roles: VENDOR_MANAGEMENT_ROLES });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  if (!await one("SELECT id FROM cleaners WHERE id = ? AND verification_status = 'approved'", cleanerId)) redirect("/cleaner/onboarding");
  const { service_id: serviceId } = parseFormOrRedirect(serviceIdSchema, formData, "/cleaner/services", "Choose a valid service.");
  const service = await one<{ id: number }>("SELECT id FROM services WHERE id = ? AND cleaner_id = ?", serviceId, cleanerId);
  if (!service) return;
  if (!await one("SELECT id FROM order_items WHERE service_id = ?", serviceId)) {
    await run("DELETE FROM services WHERE id = ? AND cleaner_id = ?", serviceId, cleanerId);
    await pauseVendorWhenIneligible(cleanerId);
    await writeAuditLog({ actorUserId: user.id, action: "cleaner.service_delete", targetType: "service", targetId: serviceId, outcome: "succeeded", context });
  }
  revalidatePath("/cleaner/services");
  revalidatePath("/cleaners");
  revalidatePath(`/cleaners/${cleanerId}`);
}

export async function updateCleanerProfileAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "cleaner.profile_update",
    roles: VENDOR_MANAGEMENT_ROLES,
    rateLimit: { limit: 10, windowSeconds: 60 },
  });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/profile?error=Cleaner+profile+not+found");
  if (!await one("SELECT id FROM cleaners WHERE id = ? AND verification_status = 'approved'", cleanerId)) redirect("/cleaner/onboarding");
  const input = parseFormOrRedirect(cleanerProfileSchema, formData, "/cleaner/profile", "Enter valid business details.");
  const result = await transaction(async () => {
    const state = await applyBusinessPhoneChange(user.id, cleanerId, input.phone);
    await run(
      `UPDATE cleaners SET
        business_name = ?, description = ?, address = ?, city = ?, turnaround_time = ?,
        opening_hours = ?, is_published = 0, is_available = 0, updated_at = ?
       WHERE id = ?`,
      input.business_name,
      input.description ?? null,
      input.address,
      input.city,
      input.turnaround_time ?? null,
      input.opening_hours ?? null,
      now(),
      cleanerId,
    );
    let eligibility = await getVendorEligibility(cleanerId);
    if (input.is_published && eligibility?.publicationEligible) {
      await run("UPDATE cleaners SET is_published = 1, updated_at = ? WHERE id = ?", now(), cleanerId);
      eligibility = await getVendorEligibility(cleanerId);
    }
    if (input.is_available && eligibility?.bookingRequirementsMet) {
      await run("UPDATE cleaners SET is_available = 1, updated_at = ? WHERE id = ?", now(), cleanerId);
      eligibility = await getVendorEligibility(cleanerId);
    }
    await writeAuditLog({
      actorUserId: user.id,
      action: "cleaner.profile_update",
      targetType: "cleaner",
      targetId: cleanerId,
      outcome: "succeeded",
      metadata: {
        phoneChanged: state.changed,
        businessPhoneVerified: state.verified,
        published: eligibility?.isPublished ?? false,
        acceptingOrders: eligibility?.isAcceptingOrders ?? false,
      },
      context,
    });
    return { phoneState: state, eligibility };
  });
  if (!result.phoneState.verified) redirect("/cleaner/profile?error=Verify+the+business+phone+before+publishing+or+accepting+new+orders");
  if ((input.is_published && !result.eligibility?.isPublished) || (input.is_available && !result.eligibility?.bookable)) {
    const issue = result.eligibility ? vendorEligibilityIssues(result.eligibility)[0] : "The marketplace requirements are incomplete.";
    redirect(`/cleaner/profile?error=${encodeURIComponent(issue)}`);
  }
  revalidatePath("/cleaners");
  revalidatePath(`/cleaners/${cleanerId}`);
  redirect("/cleaner/profile?success=Business+profile+updated");
}

export async function sendBusinessPhoneVerificationAction() {
  const { user, context } = await authorizeAction({
    action: "cleaner.business_phone_send",
    roles: VENDOR_MANAGEMENT_ROLES,
    rateLimit: { limit: 3, windowSeconds: 900 },
  });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/profile?error=Cleaner+profile+not+found");
  const cleaner = await one<{ phone: string; business_phone_verified_at: string | null; business_phone_verified_e164: string | null }>(
    "SELECT phone, business_phone_verified_at, business_phone_verified_e164 FROM cleaners WHERE id = ? AND verification_status = 'approved'",
    cleanerId,
  );
  if (!cleaner) redirect("/cleaner/onboarding");
  if (businessPhoneIsVerified(cleaner)) redirect("/cleaner/profile?success=Business+phone+is+already+verified");
  if (!phoneVerificationConfigured()) redirect("/cleaner/profile?error=Phone+verification+is+temporarily+unavailable");
  const result = await beginPhoneVerification({ purpose: "vendor_business", userId: user.id, cleanerId });
  await writeAuditLog({ actorUserId: user.id, action: "cleaner.business_phone_send", targetType: "cleaner", targetId: cleanerId, outcome: result.status === "sent" ? "succeeded" : "failed", context });
  if (result.status !== "sent") redirect("/cleaner/profile?error=We+could+not+send+a+code+to+the+saved+business+phone");
  redirect("/cleaner/profile?sent=1");
}

export async function verifyBusinessPhoneAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "cleaner.business_phone_verify",
    roles: VENDOR_MANAGEMENT_ROLES,
    rateLimit: { limit: 5, windowSeconds: 900 },
  });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/profile?error=Cleaner+profile+not+found");
  if (!phoneVerificationConfigured()) redirect("/cleaner/profile?error=Phone+verification+is+temporarily+unavailable");
  const { code } = parseFormOrRedirect(phoneCodeSchema, formData, "/cleaner/profile", "Enter the verification code.");
  const result = await completePhoneVerification({ purpose: "vendor_business", userId: user.id, cleanerId }, code);
  await writeAuditLog({ actorUserId: user.id, action: "cleaner.business_phone_verify", targetType: "cleaner", targetId: cleanerId, outcome: result.status === "approved" ? "succeeded" : "failed", context });
  if (result.status !== "approved") redirect("/cleaner/profile?error=That+code+is+incorrect,+expired,+or+no+longer+matches+this+business+phone");
  redirect("/cleaner/profile?success=Business+phone+verified.+Enable+new+orders+when+ready.");
}
