"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getAllAdmins } from "@/lib/auth";
import { authorizeAction } from "@/lib/authorization";
import { pathWithParams } from "@/lib/auth-intent";
import { all, now, one, run, transaction } from "@/lib/db";
import { encryptSensitiveValue } from "@/lib/sensitive-data";
import type { Cleaner, VendorVerification } from "@/lib/types";
import { boundedMoney, emailAddress, optionalTextField, parseFormOrRedirect, positiveId, textField } from "@/lib/validation";
import { prepareVendorFile, saveVendorFile, type VendorFileKind } from "@/lib/vendor-files";

const ONBOARDING_PATH = "/cleaner/onboarding";
const phone = textField(7, 30).refine((value) => /^[+0-9().\-\s]{7,30}$/.test(value), "Enter a valid phone number.");
const optionalCoordinate = (minimum: number, maximum: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.number().min(minimum).max(maximum).optional(),
);

const businessSchema = z.object({
  business_name: textField(2, 120),
  contact_name: textField(2, 100),
  business_phone: phone,
  business_email: emailAddress,
  description: textField(20, 1000),
});

const locationSchema = z.object({
  state: textField(2, 80),
  lga: textField(2, 100),
  area: textField(2, 100),
  address: textField(5, 250),
  latitude: optionalCoordinate(-90, 90),
  longitude: optionalCoordinate(-180, 180),
  pickup_radius_km: z.coerce.number().positive().max(100),
  delivery_radius_km: z.coerce.number().positive().max(100),
}).superRefine((input, context) => {
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "Provide both latitude and longitude, or leave both blank." });
  }
});

const serviceSchema = z.object({
  name: textField(2, 120),
  category: textField(2, 80),
  description: optionalTextField(500),
  price: boundedMoney,
  unit: z.enum(["per_item", "per_kg", "per_pair", "per_set", "flat_rate"]),
  turnaround_time: textField(2, 100),
  express_available: z.string().optional().transform((value) => value === "on"),
  is_active: z.string().optional().transform((value) => value === "on"),
});

const verificationSchema = z.object({
  identity_type: z.enum(["nin", "drivers_license", "passport", "voters_card"]),
  identity_number: optionalTextField(40).refine((value) => !value || /^[A-Za-z0-9-]+$/.test(value), "Enter a valid identity number."),
  business_registration_number: optionalTextField(80),
  bank_name: textField(2, 120),
  bank_account_name: textField(2, 120),
  bank_account_number: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().regex(/^\d{6,20}$/, "Enter a valid account number.").optional(),
  ),
  information_confirmed: z.literal("on", { error: "Confirm that the information is accurate." }),
});

const serviceIdSchema = z.object({ service_id: positiveId });
const submitSchema = z.object({ confirmation: z.literal("on", { error: "Confirm the submission before continuing." }) });

function stepPath(step: string, params: Record<string, string | null | undefined> = {}) {
  return pathWithParams(ONBOARDING_PATH, { step, ...params });
}

async function onboardingContext(action: string) {
  const { user, context } = await authorizeAction({
    action,
    roles: "VENDOR_OWNER",
    rateLimit: { limit: 20, windowSeconds: 60 },
    returnTo: ONBOARDING_PATH,
  });
  const cleaner = await one<Cleaner>("SELECT * FROM cleaners WHERE user_id = ?", user.id);
  if (!cleaner) redirect("/cleaner/dashboard?error=Business+profile+not+found");
  return { user, context, cleaner };
}

function ensureEditable(cleaner: Cleaner) {
  if (cleaner.verification_status === "pending" || cleaner.verification_status === "approved") {
    redirect(ONBOARDING_PATH);
  }
}

async function uploadedOrRedirect(formData: FormData, field: string, kind: VendorFileKind, returnPath: string) {
  try {
    return await prepareVendorFile(formData.get(field), kind);
  } catch (error) {
    redirect(pathWithParams(returnPath, { error: error instanceof Error ? error.message : "Upload a valid file." }));
  }
}

export async function saveBusinessOnboardingAction(formData: FormData) {
  const returnPath = stepPath("business");
  const { user, context, cleaner } = await onboardingContext("onboarding.business_update");
  ensureEditable(cleaner);
  const input = parseFormOrRedirect(businessSchema, formData, returnPath, "Enter valid business details.");
  const [logo, cover] = await Promise.all([
    uploadedOrRedirect(formData, "logo", "logo", returnPath),
    uploadedOrRedirect(formData, "cover", "cover", returnPath),
  ]);
  const existingFiles = await all<{ kind: string }>("SELECT kind FROM vendor_files WHERE cleaner_id = ? AND kind IN ('logo', 'cover')", cleaner.id);
  const kinds = new Set(existingFiles.map((file) => file.kind));
  if (!logo && !kinds.has("logo")) redirect(pathWithParams(returnPath, { error: "Add a business logo." }));
  if (!cover && !kinds.has("cover")) redirect(pathWithParams(returnPath, { error: "Add a cover image." }));

  await transaction(async () => {
    await run(
      `UPDATE cleaners SET business_name = ?, contact_name = ?, phone = ?, business_email = ?,
       description = ?, onboarding_step = 'location', updated_at = ? WHERE id = ?`,
      input.business_name,
      input.contact_name,
      input.business_phone,
      input.business_email,
      input.description,
      now(),
      cleaner.id,
    );
    if (logo) await saveVendorFile(cleaner.id, logo);
    if (cover) await saveVendorFile(cleaner.id, cover);
    await writeAuditLog({ actorUserId: user.id, action: "onboarding.business_update", targetType: "cleaner", targetId: cleaner.id, outcome: "succeeded", context });
  });
  redirect(stepPath("location", { saved: "1" }));
}

export async function saveLocationOnboardingAction(formData: FormData) {
  const returnPath = stepPath("location");
  const { user, context, cleaner } = await onboardingContext("onboarding.location_update");
  ensureEditable(cleaner);
  const input = parseFormOrRedirect(locationSchema, formData, returnPath, "Enter valid location details.");
  await run(
    `UPDATE cleaners SET state = ?, lga = ?, area = ?, address = ?, city = ?, latitude = ?, longitude = ?,
     pickup_radius_km = ?, delivery_radius_km = ?, onboarding_step = 'services', updated_at = ? WHERE id = ?`,
    input.state,
    input.lga,
    input.area,
    input.address,
    input.area,
    input.latitude ?? null,
    input.longitude ?? null,
    input.pickup_radius_km,
    input.delivery_radius_km,
    now(),
    cleaner.id,
  );
  await writeAuditLog({ actorUserId: user.id, action: "onboarding.location_update", targetType: "cleaner", targetId: cleaner.id, outcome: "succeeded", context });
  redirect(stepPath("services", { saved: "1" }));
}

export async function addOnboardingServiceAction(formData: FormData) {
  const returnPath = stepPath("services");
  const { user, context, cleaner } = await onboardingContext("onboarding.service_create");
  ensureEditable(cleaner);
  const input = parseFormOrRedirect(serviceSchema, formData, returnPath, "Enter valid service details.");
  if (await one("SELECT id FROM services WHERE cleaner_id = ? AND lower(name) = lower(?)", cleaner.id, input.name)) {
    redirect(pathWithParams(returnPath, { error: "A service with that name already exists." }));
  }
  const result = await run(
    `INSERT INTO services
      (cleaner_id, name, category, description, price, unit, turnaround_time, express_available, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    cleaner.id,
    input.name,
    input.category,
    input.description ?? null,
    input.price,
    input.unit,
    input.turnaround_time,
    input.express_available ? 1 : 0,
    input.is_active ? 1 : 0,
    now(),
    now(),
  );
  await run("UPDATE cleaners SET onboarding_step = 'services', updated_at = ? WHERE id = ?", now(), cleaner.id);
  await writeAuditLog({ actorUserId: user.id, action: "onboarding.service_create", targetType: "service", targetId: Number(result.lastInsertRowid), outcome: "succeeded", context });
  revalidatePath(ONBOARDING_PATH);
  redirect(stepPath("services", { saved: "1" }));
}

export async function toggleOnboardingServiceAction(formData: FormData) {
  const returnPath = stepPath("services");
  const { user, context, cleaner } = await onboardingContext("onboarding.service_toggle");
  ensureEditable(cleaner);
  const { service_id: serviceId } = parseFormOrRedirect(serviceIdSchema, formData, returnPath, "Choose a valid service.");
  const result = await run(
    "UPDATE services SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ? AND cleaner_id = ?",
    now(), serviceId, cleaner.id,
  );
  if (result.changes) await writeAuditLog({ actorUserId: user.id, action: "onboarding.service_toggle", targetType: "service", targetId: serviceId, outcome: "succeeded", context });
  revalidatePath(ONBOARDING_PATH);
}

export async function deleteOnboardingServiceAction(formData: FormData) {
  const returnPath = stepPath("services");
  const { user, context, cleaner } = await onboardingContext("onboarding.service_delete");
  ensureEditable(cleaner);
  const { service_id: serviceId } = parseFormOrRedirect(serviceIdSchema, formData, returnPath, "Choose a valid service.");
  if (!await one("SELECT id FROM order_items WHERE service_id = ?", serviceId)) {
    const result = await run("DELETE FROM services WHERE id = ? AND cleaner_id = ?", serviceId, cleaner.id);
    if (result.changes) await writeAuditLog({ actorUserId: user.id, action: "onboarding.service_delete", targetType: "service", targetId: serviceId, outcome: "succeeded", context });
  }
  revalidatePath(ONBOARDING_PATH);
}

export async function continueOnboardingServicesAction() {
  const { cleaner } = await onboardingContext("onboarding.services_continue");
  ensureEditable(cleaner);
  const serviceCount = (await one<{ count: number }>("SELECT COUNT(1) AS count FROM services WHERE cleaner_id = ?", cleaner.id))?.count ?? 0;
  if (!serviceCount) redirect(stepPath("services", { error: "Add at least one service before continuing." }));
  await run("UPDATE cleaners SET onboarding_step = 'verification', updated_at = ? WHERE id = ?", now(), cleaner.id);
  redirect(stepPath("verification"));
}

export async function saveVerificationOnboardingAction(formData: FormData) {
  const returnPath = stepPath("verification");
  const { user, context, cleaner } = await onboardingContext("onboarding.verification_update");
  ensureEditable(cleaner);
  const input = parseFormOrRedirect(verificationSchema, formData, returnPath, "Enter valid verification and payout details.");
  const existing = await one<VendorVerification>("SELECT * FROM vendor_verifications WHERE cleaner_id = ?", cleaner.id);
  if (!input.identity_number && !existing?.identity_number_encrypted) {
    redirect(pathWithParams(returnPath, { error: "Enter the identity number." }));
  }
  if (!input.bank_account_number && !existing?.bank_account_number_encrypted) {
    redirect(pathWithParams(returnPath, { error: "Enter the payout account number." }));
  }
  const [identityDocument, businessDocument] = await Promise.all([
    uploadedOrRedirect(formData, "identity_document", "identity_document", returnPath),
    uploadedOrRedirect(formData, "business_document", "business_document", returnPath),
  ]);
  const identityFile = await one("SELECT id FROM vendor_files WHERE cleaner_id = ? AND kind = 'identity_document'", cleaner.id);
  if (!identityDocument && !identityFile) redirect(pathWithParams(returnPath, { error: "Upload an identity document." }));

  await transaction(async () => {
    const timestamp = now();
    await run(
      `INSERT INTO vendor_verifications
        (cleaner_id, identity_type, identity_number_encrypted, business_registration_number,
         bank_name, bank_account_name, bank_account_number_encrypted, information_confirmed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(cleaner_id) DO UPDATE SET
         identity_type = excluded.identity_type,
         identity_number_encrypted = COALESCE(excluded.identity_number_encrypted, vendor_verifications.identity_number_encrypted),
         business_registration_number = excluded.business_registration_number,
         bank_name = excluded.bank_name,
         bank_account_name = excluded.bank_account_name,
         bank_account_number_encrypted = COALESCE(excluded.bank_account_number_encrypted, vendor_verifications.bank_account_number_encrypted),
         information_confirmed = 1, updated_at = excluded.updated_at`,
      cleaner.id,
      input.identity_type,
      input.identity_number ? encryptSensitiveValue(input.identity_number) : null,
      input.business_registration_number ?? null,
      input.bank_name,
      input.bank_account_name,
      input.bank_account_number ? encryptSensitiveValue(input.bank_account_number) : null,
      timestamp,
      timestamp,
    );
    if (identityDocument) await saveVendorFile(cleaner.id, identityDocument);
    if (businessDocument) await saveVendorFile(cleaner.id, businessDocument);
    await run("UPDATE cleaners SET onboarding_step = 'review', updated_at = ? WHERE id = ?", timestamp, cleaner.id);
    await writeAuditLog({ actorUserId: user.id, action: "onboarding.verification_update", targetType: "cleaner", targetId: cleaner.id, outcome: "succeeded", context });
  });
  redirect(stepPath("review", { saved: "1" }));
}

export async function submitVendorOnboardingAction(formData: FormData) {
  const returnPath = stepPath("review");
  const { user, context, cleaner } = await onboardingContext("onboarding.submit");
  ensureEditable(cleaner);
  parseFormOrRedirect(submitSchema, formData, returnPath, "Confirm the submission before continuing.");

  const [services, verification, files] = await Promise.all([
    one<{ count: number }>("SELECT COUNT(1) AS count FROM services WHERE cleaner_id = ?", cleaner.id),
    one<VendorVerification>("SELECT * FROM vendor_verifications WHERE cleaner_id = ?", cleaner.id),
    all<{ kind: string }>("SELECT kind FROM vendor_files WHERE cleaner_id = ?", cleaner.id),
  ]);
  const fileKinds = new Set(files.map((file) => file.kind));
  const businessComplete = Boolean(cleaner.business_name && cleaner.contact_name && cleaner.business_email && cleaner.description && fileKinds.has("logo") && fileKinds.has("cover"));
  const locationComplete = Boolean(cleaner.state && cleaner.lga && cleaner.area && cleaner.address && cleaner.pickup_radius_km && cleaner.delivery_radius_km);
  const verificationComplete = Boolean(
    user.phone_verified_at && verification?.identity_type && verification.identity_number_encrypted &&
    verification.bank_name && verification.bank_account_name && verification.bank_account_number_encrypted &&
    verification.information_confirmed && fileKinds.has("identity_document"),
  );
  if (!businessComplete) redirect(stepPath("business", { error: "Complete the business section before submitting." }));
  if (!locationComplete) redirect(stepPath("location", { error: "Complete the location section before submitting." }));
  if (!services?.count) redirect(stepPath("services", { error: "Add at least one service before submitting." }));
  if (!verificationComplete) redirect(stepPath("verification", { error: "Complete verification before submitting." }));

  await transaction(async () => {
    const timestamp = now();
    await run(
      `UPDATE cleaners SET verification_status = 'pending', onboarding_step = 'submitted', submitted_at = ?,
       is_approved = 0, is_available = 0, updated_at = ? WHERE id = ?`,
      timestamp, timestamp, cleaner.id,
    );
    for (const admin of await getAllAdmins()) {
      await run(
        `INSERT INTO notifications (user_id, title, message, type, data, created_at, updated_at)
         VALUES (?, 'Vendor verification submitted', ?, 'vendor_verification', ?, ?, ?)`,
        admin.id,
        `${cleaner.business_name} submitted its onboarding information for review.`,
        JSON.stringify({ cleaner_id: cleaner.id }),
        timestamp,
        timestamp,
      );
    }
    await writeAuditLog({ actorUserId: user.id, action: "onboarding.submit", targetType: "cleaner", targetId: cleaner.id, outcome: "succeeded", context });
  });
  revalidatePath("/cleaner/dashboard");
  revalidatePath("/admin/dashboard");
  redirect(pathWithParams(ONBOARDING_PATH, { submitted: "1" }));
}
