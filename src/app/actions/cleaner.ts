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
import { PRICING_UNITS, SERVICE_CATEGORIES } from "@/lib/pricing-engine";

const nonnegativeMoney = z.coerce.number().finite().nonnegative().max(10_000_000);
const optionalMoney = z.preprocess((value) => value === "" ? null : value, z.coerce.number().finite().nonnegative().max(10_000_000).nullable());

const serviceSchema = z.object({
  name: textField(2, 120),
  category: z.enum(SERVICE_CATEGORIES),
  description: optionalTextField(500),
  price: boundedMoney,
  unit: z.enum(PRICING_UNITS),
  turnaround_time: textField(2, 100),
  express_available: z.string().optional().transform((value) => value === "on"),
  express_fee_type: z.enum(["fixed", "percentage"]),
  express_fee_value: nonnegativeMoney,
  special_treatment_available: z.string().optional().transform((value) => value === "on"),
  special_treatment_fee: nonnegativeMoney,
  minimum_quantity: z.coerce.number().positive().max(10000),
  quantity_step: z.coerce.number().positive().max(10000),
  package_details: optionalTextField(500),
  requires_final_confirmation: z.string().optional().transform((value) => value === "on"),
}).superRefine((input, context) => {
  if (input.express_available && input.express_fee_value <= 0) context.addIssue({ code: "custom", path: ["express_fee_value"], message: "Add an express fee." });
  if (input.express_fee_type === "percentage" && input.express_fee_value > 100) context.addIssue({ code: "custom", path: ["express_fee_value"], message: "Percentage fees cannot exceed 100%." });
  if (input.special_treatment_available && input.special_treatment_fee <= 0) context.addIssue({ code: "custom", path: ["special_treatment_fee"], message: "Add a treatment fee." });
  if (input.unit === "flat_rate" && !input.package_details) context.addIssue({ code: "custom", path: ["package_details"], message: "Describe what the package includes." });
});
const serviceIdSchema = z.object({ service_id: positiveId });
const discountSchema = z.object({
  service_id: positiveId,
  minimum_quantity: z.coerce.number().positive().max(10000),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: boundedMoney,
}).superRefine((input, context) => {
  if (input.discount_type === "percentage" && input.discount_value > 100) context.addIssue({ code: "custom", path: ["discount_value"], message: "Percentage discounts cannot exceed 100%." });
});
const discountIdSchema = z.object({ discount_id: positiveId });
const pricingSettingsSchema = z.object({
  minimum_order_amount: nonnegativeMoney,
  delivery_pricing_type: z.enum(["fixed", "distance", "free"]),
  base_delivery_fee: nonnegativeMoney,
  delivery_fee_per_km: nonnegativeMoney,
  free_delivery_threshold: optionalMoney,
});
const deliveryZoneSchema = z.object({
  name: textField(2, 100),
  pricing_type: z.enum(["fixed", "distance", "free"]),
  base_fee: nonnegativeMoney,
  per_km_fee: nonnegativeMoney,
  minimum_fee: nonnegativeMoney,
  maximum_fee: optionalMoney,
  radius_km: z.preprocess((value) => value === "" ? null : value, z.coerce.number().positive().max(250).nullable()),
}).superRefine((input, context) => {
  if (input.maximum_fee !== null && input.maximum_fee < input.minimum_fee) context.addIssue({ code: "custom", path: ["maximum_fee"], message: "Maximum fee must be at least the minimum fee." });
});
const zoneIdSchema = z.object({ zone_id: positiveId });
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
  daily_order_capacity: z.coerce.number().int().min(1).max(500),
  express_daily_capacity: z.coerce.number().int().min(0).max(500),
  minimum_lead_hours: z.coerce.number().int().min(0).max(168),
  express_turnaround_hours: z.coerce.number().int().min(1).max(168),
  booking_hold_minutes: z.coerce.number().int().min(5).max(120),
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
        (cleaner_id, name, category, description, price, unit, turnaround_time, express_available,
         express_fee_type, express_fee_value, special_treatment_available, special_treatment_fee,
         minimum_quantity, quantity_step, package_details, requires_final_confirmation, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      cleanerId,
      input.name,
      input.category,
      input.description ?? null,
      input.price,
      input.unit,
      input.turnaround_time,
      input.express_available ? 1 : 0,
      input.express_fee_type,
      input.express_available ? input.express_fee_value : 0,
      input.special_treatment_available ? 1 : 0,
      input.special_treatment_available ? input.special_treatment_fee : 0,
      input.minimum_quantity,
      input.quantity_step,
      input.package_details ?? null,
      input.requires_final_confirmation || input.unit === "per_kg" ? 1 : 0,
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

export async function updateServiceAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.service_update", roles: VENDOR_MANAGEMENT_ROLES });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  const serviceId = positiveId.safeParse(formData.get("service_id"));
  const input = parseFormOrRedirect(serviceSchema, formData, "/cleaner/services", "Enter valid service details.");
  if (!serviceId.success) redirect("/cleaner/services?error=Choose+a+valid+service");
  const result = await run(
    `UPDATE services SET name = ?, category = ?, description = ?, price = ?, unit = ?, turnaround_time = ?,
      express_available = ?, express_fee_type = ?, express_fee_value = ?, special_treatment_available = ?,
      special_treatment_fee = ?, minimum_quantity = ?, quantity_step = ?, package_details = ?,
      requires_final_confirmation = ?, price_version = price_version + 1, updated_at = ?
     WHERE id = ? AND cleaner_id = ?`,
    input.name, input.category, input.description ?? null, input.price, input.unit, input.turnaround_time,
    input.express_available ? 1 : 0, input.express_fee_type, input.express_available ? input.express_fee_value : 0,
    input.special_treatment_available ? 1 : 0, input.special_treatment_available ? input.special_treatment_fee : 0,
    input.minimum_quantity, input.quantity_step, input.package_details ?? null,
    input.requires_final_confirmation || input.unit === "per_kg" ? 1 : 0, now(), serviceId.data, cleanerId,
  );
  if (!result.changes) redirect("/cleaner/services?error=Service+not+found");
  await writeAuditLog({ actorUserId: user.id, action: "cleaner.service_update", targetType: "service", targetId: serviceId.data, outcome: "succeeded", context });
  await pauseVendorWhenIneligible(cleanerId);
  revalidatePath("/cleaner/services");
  revalidatePath("/cleaners");
  revalidatePath(`/cleaners/${cleanerId}`);
}

export async function addBulkDiscountAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.discount_create", roles: VENDOR_MANAGEMENT_ROLES });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  const input = parseFormOrRedirect(discountSchema, formData, "/cleaner/services", "Enter a valid discount rule.");
  if (!await one("SELECT id FROM services WHERE id = ? AND cleaner_id = ?", input.service_id, cleanerId)) redirect("/cleaner/services?error=Service+not+found");
  const result = await run(
    `INSERT INTO service_bulk_discounts (service_id, minimum_quantity, discount_type, discount_value, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(service_id, minimum_quantity) DO UPDATE SET discount_type = excluded.discount_type, discount_value = excluded.discount_value, is_active = 1, updated_at = excluded.updated_at`,
    input.service_id, input.minimum_quantity, input.discount_type, input.discount_value, now(), now(),
  );
  await writeAuditLog({ actorUserId: user.id, action: "cleaner.discount_create", targetType: "service", targetId: input.service_id, outcome: "succeeded", metadata: { discountId: Number(result.lastInsertRowid) }, context });
  revalidatePath("/cleaner/services");
}

export async function deleteBulkDiscountAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.discount_delete", roles: VENDOR_MANAGEMENT_ROLES });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  const { discount_id: discountId } = parseFormOrRedirect(discountIdSchema, formData, "/cleaner/services", "Choose a valid discount.");
  const result = await run("DELETE FROM service_bulk_discounts WHERE id = ? AND service_id IN (SELECT id FROM services WHERE cleaner_id = ?)", discountId, cleanerId);
  if (result.changes) await writeAuditLog({ actorUserId: user.id, action: "cleaner.discount_delete", targetType: "service_bulk_discount", targetId: discountId, outcome: "succeeded", context });
  revalidatePath("/cleaner/services");
}

export async function updatePricingSettingsAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.pricing_settings_update", roles: VENDOR_MANAGEMENT_ROLES });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  const input = parseFormOrRedirect(pricingSettingsSchema, formData, "/cleaner/services", "Enter valid pricing settings.");
  await run(`UPDATE cleaners SET minimum_order_amount = ?, delivery_pricing_type = ?, base_delivery_fee = ?, delivery_fee_per_km = ?, free_delivery_threshold = ?, updated_at = ? WHERE id = ?`,
    input.minimum_order_amount, input.delivery_pricing_type, input.base_delivery_fee, input.delivery_fee_per_km, input.free_delivery_threshold, now(), cleanerId);
  await writeAuditLog({ actorUserId: user.id, action: "cleaner.pricing_settings_update", targetType: "cleaner", targetId: cleanerId, outcome: "succeeded", context });
  revalidatePath("/cleaner/services");
}

export async function addDeliveryZoneAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.delivery_zone_create", roles: VENDOR_MANAGEMENT_ROLES });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  const input = parseFormOrRedirect(deliveryZoneSchema, formData, "/cleaner/services", "Enter a valid delivery zone.");
  const result = await run(`INSERT INTO delivery_zones (cleaner_id, name, pricing_type, base_fee, per_km_fee, minimum_fee, maximum_fee, radius_km, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    cleanerId, input.name, input.pricing_type, input.base_fee, input.per_km_fee, input.minimum_fee, input.maximum_fee, input.radius_km, now(), now());
  await writeAuditLog({ actorUserId: user.id, action: "cleaner.delivery_zone_create", targetType: "delivery_zone", targetId: Number(result.lastInsertRowid), outcome: "succeeded", context });
  revalidatePath("/cleaner/services");
}

export async function deleteDeliveryZoneAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.delivery_zone_delete", roles: VENDOR_MANAGEMENT_ROLES });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  const { zone_id: zoneId } = parseFormOrRedirect(zoneIdSchema, formData, "/cleaner/services", "Choose a valid delivery zone.");
  const result = await run("DELETE FROM delivery_zones WHERE id = ? AND cleaner_id = ?", zoneId, cleanerId);
  if (result.changes) await writeAuditLog({ actorUserId: user.id, action: "cleaner.delivery_zone_delete", targetType: "delivery_zone", targetId: zoneId, outcome: "succeeded", context });
  revalidatePath("/cleaner/services");
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
        opening_hours = ?, daily_order_capacity = ?, express_daily_capacity = ?, minimum_lead_hours = ?,
        express_turnaround_hours = ?, booking_hold_minutes = ?, is_published = 0, is_available = 0, updated_at = ?
       WHERE id = ?`,
      input.business_name,
      input.description ?? null,
      input.address,
      input.city,
      input.turnaround_time ?? null,
      input.opening_hours ?? null,
      input.daily_order_capacity,
      Math.min(input.express_daily_capacity, input.daily_order_capacity),
      input.minimum_lead_hours,
      input.express_turnaround_hours,
      input.booking_hold_minutes,
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
