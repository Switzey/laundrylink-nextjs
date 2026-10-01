"use server";

import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { authorizeAction } from "@/lib/authorization";
import { destroySession } from "@/lib/auth";
import { now, one, run, transaction } from "@/lib/db";
import { appConfig } from "@/lib/env";
import { optionalTextField, parseFormOrRedirect, positiveId, strongPassword, textField } from "@/lib/validation";

const phoneField = optionalTextField(30).refine(
  (value) => !value || /^[+0-9().\-\s]{7,30}$/.test(value),
  "Enter a valid phone number.",
);

const addressSchema = z.object({
  label: optionalTextField(50),
  address: textField(3, 250),
  city: textField(2, 100),
  phone: phoneField,
  delivery_notes: optionalTextField(1000),
  is_default: z.string().optional().transform((value) => value === "on"),
});

const profileSchema = z.object({
  name: textField(2, 100),
  phone: phoneField,
  address: optionalTextField(250),
});

const addressIdSchema = z.object({ address_id: positiveId });
const notificationIdSchema = z.object({ notification_id: positiveId });
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
    roles: "customer",
    rateLimit: { limit: 20, windowSeconds: 60 },
  });
  const input = parseFormOrRedirect(addressSchema, formData, "/customer/addresses", "Enter a valid address.");

  await transaction(async () => {
    const hasAddress = Boolean(await one("SELECT id FROM addresses WHERE user_id = ?", user.id));
    const shouldBeDefault = input.is_default || !hasAddress;
    if (shouldBeDefault) await run("UPDATE addresses SET is_default = 0 WHERE user_id = ?", user.id);
    const result = await run(
      `INSERT INTO addresses
        (user_id, label, address, city, phone, is_default, delivery_notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      input.label ?? null,
      input.address,
      input.city,
      input.phone ?? null,
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

export async function deleteAddressAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "address.delete", roles: "customer" });
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
  await transaction(async () => {
    await run(
      "UPDATE users SET name = ?, phone = ?, address = ?, updated_at = ? WHERE id = ?",
      input.name,
      input.phone ?? null,
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
      context,
    });
  });
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
