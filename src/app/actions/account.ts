"use server";

import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { authorizeAction } from "@/lib/authorization";
import { destroySession } from "@/lib/auth";
import { now, one, run, transaction } from "@/lib/db";
import { appConfig, phoneVerificationConfigured } from "@/lib/env";
import { normalizePhoneNumber } from "@/lib/phone-numbers";
import { applyAccountPhoneChange } from "@/lib/phone-state";
import { roleRequiresPhoneVerification } from "@/lib/types";
import { optionalTextField, parseFormOrRedirect, positiveId, strongPassword, textField } from "@/lib/validation";

const phoneField = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(7).max(30)
    .refine((value) => Boolean(normalizePhoneNumber(value)), "Enter a valid international phone number.")
    .transform((value) => normalizePhoneNumber(value)!)
    .optional(),
);

const optionalCoordinate = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.number().finite().optional(),
);

const addressSchema = z.object({
  label: optionalTextField(50),
  address: textField(3, 250),
  city: textField(2, 100),
  phone: phoneField,
  landmark: optionalTextField(250),
  latitude: optionalCoordinate.refine((value) => value === undefined || (value >= -90 && value <= 90), "Choose a valid map location."),
  longitude: optionalCoordinate.refine((value) => value === undefined || (value >= -180 && value <= 180), "Choose a valid map location."),
  delivery_notes: optionalTextField(1000),
  is_default: z.string().optional().transform((value) => value === "on"),
}).superRefine((input, context) => {
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "Choose a complete map location." });
  }
});

const profileSchema = z.object({
  name: textField(2, 100),
  phone: phoneField,
  address: optionalTextField(250),
});

const addressIdSchema = z.object({ address_id: positiveId });
const notificationIdSchema = z.object({ notification_id: positiveId });
const favoriteCleanerSchema = z.object({
  cleaner_id: positiveId,
  intent: z.enum(["add", "remove"]),
});
const preferencesSchema = z.object({
  fragrance_preference: optionalTextField(120),
  detergent_sensitivity: optionalTextField(500),
  ironing_instructions: optionalTextField(500),
  folding_style: optionalTextField(120),
  special_garment_care: optionalTextField(1000),
});
const supportTicketSchema = z.object({
  order_id: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    positiveId.optional(),
  ),
  category: z.enum(["order", "payment", "pickup_delivery", "quality", "account", "other"]),
  subject: textField(3, 120),
  message: textField(10, 2000),
});
const passwordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: strongPassword,
  confirm_password: z.string().min(1).max(128),
}).superRefine((input, context) => {
  if (input.new_password !== input.confirm_password) {
    context.addIssue({ code: "custom", path: ["confirm_password"], message: "The new passwords do not match." });
  }
  if (input.new_password === input.current_password) {
    context.addIssue({ code: "custom", path: ["new_password"], message: "Choose a different password." });
  }
});

export async function saveAddressAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "address.create",
    roles: "CUSTOMER",
    rateLimit: { limit: 20, windowSeconds: 60 },
  });
  const input = parseFormOrRedirect(addressSchema, formData, "/customer/addresses", "Enter a valid address.");

  await transaction(async () => {
    const hasAddress = Boolean(await one("SELECT id FROM addresses WHERE user_id = ?", user.id));
    const shouldBeDefault = input.is_default || !hasAddress;
    if (shouldBeDefault) await run("UPDATE addresses SET is_default = 0 WHERE user_id = ?", user.id);
    const result = await run(
      `INSERT INTO addresses
        (user_id, label, address, city, phone, landmark, latitude, longitude, is_default, delivery_notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      input.label ?? null,
      input.address,
      input.city,
      input.phone ?? null,
      input.landmark ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      shouldBeDefault ? 1 : 0,
      input.delivery_notes ?? null,
      now(),
      now(),
    );
    await writeAuditLog({
      actorUserId: user.id,
      action: "address.create",
      targetType: "address",
      targetId: Number(result.lastInsertRowid),
      outcome: "succeeded",
      context,
    });
  });
  revalidatePath("/customer/addresses");
}

export async function setFavoriteCleanerAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "favorite_cleaner.update",
    roles: "CUSTOMER",
    rateLimit: { limit: 30, windowSeconds: 60 },
  });
  const input = parseFormOrRedirect(favoriteCleanerSchema, formData, "/customer/favourites", "Choose a valid cleaner.");
  const cleaner = await one<{ id: number }>(
    `SELECT c.id FROM cleaners c
     JOIN vendor_eligibility ve ON ve.cleaner_id = c.id
     WHERE c.id = ? AND ve.public_profile = 1`,
    input.cleaner_id,
  );
  if (!cleaner) redirect("/customer/favourites?error=That+cleaner+is+not+available");

  if (input.intent === "add") {
    await run(
      "INSERT INTO favorite_cleaners (user_id, cleaner_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, cleaner_id) DO NOTHING",
      user.id,
      input.cleaner_id,
      now(),
    );
  } else {
    await run("DELETE FROM favorite_cleaners WHERE user_id = ? AND cleaner_id = ?", user.id, input.cleaner_id);
  }
  await writeAuditLog({
    actorUserId: user.id,
    action: "favorite_cleaner.update",
    targetType: "cleaner",
    targetId: input.cleaner_id,
    outcome: "succeeded",
    metadata: { intent: input.intent },
    context,
  });
  revalidatePath("/customer/favourites");
  revalidatePath(`/cleaners/${input.cleaner_id}`);
}

export async function saveCustomerPreferencesAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "customer_preferences.update",
    roles: "CUSTOMER",
    rateLimit: { limit: 15, windowSeconds: 60 },
  });
  const input = parseFormOrRedirect(
    preferencesSchema,
    formData,
    "/customer/preferences",
    "Enter valid laundry preferences.",
  );
  const timestamp = now();
  await run(
    `INSERT INTO customer_preferences
      (user_id, fragrance_preference, detergent_sensitivity, ironing_instructions, folding_style,
       special_garment_care, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       fragrance_preference = excluded.fragrance_preference,
       detergent_sensitivity = excluded.detergent_sensitivity,
       ironing_instructions = excluded.ironing_instructions,
       folding_style = excluded.folding_style,
       special_garment_care = excluded.special_garment_care,
       updated_at = excluded.updated_at`,
    user.id,
    input.fragrance_preference ?? null,
    input.detergent_sensitivity ?? null,
    input.ironing_instructions ?? null,
    input.folding_style ?? null,
    input.special_garment_care ?? null,
    timestamp,
    timestamp,
  );
  await writeAuditLog({
    actorUserId: user.id,
    action: "customer_preferences.update",
    targetType: "user",
    targetId: user.id,
    outcome: "succeeded",
    context,
  });
  redirect("/customer/preferences?success=Preferences+saved");
}

export async function createSupportTicketAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "support_ticket.create",
    roles: "CUSTOMER",
    rateLimit: { limit: 5, windowSeconds: 600 },
  });
  const input = parseFormOrRedirect(
    supportTicketSchema,
    formData,
    "/customer/support",
    "Enter valid support request details.",
  );
  if (input.order_id) {
    const ownedOrder = await one<{ id: number }>("SELECT id FROM orders WHERE id = ? AND customer_id = ?", input.order_id, user.id);
    if (!ownedOrder) redirect("/customer/support?error=Choose+one+of+your+orders");
  }
  const timestamp = now();
  const result = await run(
    `INSERT INTO support_tickets
      (user_id, order_id, category, subject, message, status, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', 'normal', ?, ?)`,
    user.id,
    input.order_id ?? null,
    input.category,
    input.subject,
    input.message,
    timestamp,
    timestamp,
  );
  await writeAuditLog({
    actorUserId: user.id,
    action: "support_ticket.create",
    targetType: "support_ticket",
    targetId: Number(result.lastInsertRowid),
    outcome: "succeeded",
    metadata: { category: input.category, orderId: input.order_id ?? null },
    context,
  });
  redirect(`/customer/support?success=${encodeURIComponent(`Support request #${result.lastInsertRowid} submitted`)}`);
}

export async function deleteAddressAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "address.delete", roles: "CUSTOMER" });
  const { address_id: addressId } = parseFormOrRedirect(
    addressIdSchema,
    formData,
    "/customer/addresses",
    "Choose a valid address.",
  );

  await transaction(async () => {
    const address = await one<{ is_default: number }>(
      "SELECT is_default FROM addresses WHERE id = ? AND user_id = ?",
      addressId,
      user.id,
    );
    if (!address) return;
    await run("DELETE FROM addresses WHERE id = ? AND user_id = ?", addressId, user.id);
    if (address.is_default) {
      const replacement = await one<{ id: number }>("SELECT id FROM addresses WHERE user_id = ? ORDER BY id LIMIT 1", user.id);
      if (replacement) await run("UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?", replacement.id, user.id);
    }
    await writeAuditLog({
      actorUserId: user.id,
      action: "address.delete",
      targetType: "address",
      targetId: addressId,
      outcome: "succeeded",
      context,
    });
  });
  revalidatePath("/customer/addresses");
}

export async function updateProfileAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "profile.update", rateLimit: { limit: 10, windowSeconds: 60 } });
  const input = parseFormOrRedirect(profileSchema, formData, "/profile", "Enter valid profile details.");
  const phoneState = await transaction(async () => {
    const state = await applyAccountPhoneChange(user.id, user.id, input.phone);
    await run(
      "UPDATE users SET name = ?, address = ?, updated_at = ? WHERE id = ?",
      input.name,
      input.address ?? null,
      now(),
      user.id,
    );
    await writeAuditLog({
      actorUserId: user.id,
      action: "profile.update",
      targetType: "user",
      targetId: user.id,
      outcome: "succeeded",
      metadata: { phoneChanged: state.changed, phoneVerificationRetained: Boolean(state.verifiedAt) },
      context,
    });
    return state;
  });
  if (phoneVerificationConfigured() && roleRequiresPhoneVerification(user.role) && !phoneState.verifiedAt) {
    redirect("/verify-phone?notice=Verify+your+new+phone+number+to+continue.");
  }
  redirect("/profile?success=Profile+updated");
}

export async function markNotificationReadAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "notification.read" });
  const { notification_id: notificationId } = parseFormOrRedirect(
    notificationIdSchema,
    formData,
    "/notifications",
    "Choose a valid notification.",
  );
  const result = await run(
    "UPDATE notifications SET read_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    now(),
    now(),
    notificationId,
    user.id,
  );
  if (result.changes) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "notification.read",
      targetType: "notification",
      targetId: notificationId,
      outcome: "succeeded",
      context,
    });
  }
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const { user, context } = await authorizeAction({ action: "notification.read_all", rateLimit: { limit: 10, windowSeconds: 60 } });
  const result = await run(
    "UPDATE notifications SET read_at = ?, updated_at = ? WHERE user_id = ? AND read_at IS NULL",
    now(),
    now(),
    user.id,
  );
  await writeAuditLog({
    actorUserId: user.id,
    action: "notification.read_all",
    targetType: "notification",
    outcome: "succeeded",
    metadata: { affected: result.changes },
    context,
  });
  revalidatePath("/notifications");
}

export async function changePasswordAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "account.password_change",
    rateLimit: { limit: 5, windowSeconds: 900 },
  });
  const input = parseFormOrRedirect(passwordSchema, formData, "/profile", "Enter valid password details.");
  const account = await one<{ password: string }>("SELECT password FROM users WHERE id = ?", user.id);

  if (!account || !await compare(input.current_password, account.password)) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "account.password_change",
      targetType: "user",
      targetId: user.id,
      outcome: "failed",
      metadata: { reason: "invalid_current_password" },
      context,
    });
    redirect("/profile?error=Current+password+is+incorrect");
  }

  await transaction(async () => {
    await run(
      "UPDATE users SET password = ?, updated_at = ? WHERE id = ?",
      await hash(input.new_password, appConfig.bcryptCost),
      now(),
      user.id,
    );
    await run("DELETE FROM js_sessions WHERE user_id = ?", user.id);
    await writeAuditLog({
      actorUserId: user.id,
      action: "account.password_change",
      targetType: "user",
      targetId: user.id,
      outcome: "succeeded",
      context,
    });
  });
  await destroySession();
  redirect("/login?success=Password+updated.+Sign+in+again.");
}
