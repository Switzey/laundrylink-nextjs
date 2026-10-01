"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { authorizeAction } from "@/lib/authorization";
import { cleanerIdForUser } from "@/lib/auth";
import { now, one, run, transaction } from "@/lib/db";
import { boundedMoney, optionalTextField, parseFormOrRedirect, positiveId, textField } from "@/lib/validation";

const serviceSchema = z.object({
  name: textField(2, 120),
  description: optionalTextField(500),
  price: boundedMoney,
  unit: z.enum(["per_item", "per_kg", "flat_rate"]),
});
const serviceIdSchema = z.object({ service_id: positiveId });
const cleanerProfileSchema = z.object({
  business_name: textField(2, 120),
  description: optionalTextField(1000),
  address: textField(3, 250),
  city: textField(2, 100),
  phone: textField(7, 30).refine((value) => /^[+0-9().\-\s]{7,30}$/.test(value), "Enter a valid phone number."),
  turnaround_time: optionalTextField(100),
  opening_hours: optionalTextField(150),
  is_available: z.string().optional().transform((value) => value === "on"),
});

export async function addServiceAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.service_create", roles: "cleaner" });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  const input = parseFormOrRedirect(serviceSchema, formData, "/cleaner/services", "Enter valid service details.");
  await transaction(async () => {
    const result = await run(
      `INSERT INTO services
        (cleaner_id, name, description, price, unit, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      cleanerId,
      input.name,
      input.description ?? null,
      input.price,
      input.unit,
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
  revalidatePath("/cleaner/services");
}

export async function toggleServiceAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.service_toggle", roles: "cleaner" });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
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
    await writeAuditLog({ actorUserId: user.id, action: "cleaner.service_toggle", targetType: "service", targetId: serviceId, outcome: "succeeded", context });
  }
  revalidatePath("/cleaner/services");
}

export async function deleteServiceAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "cleaner.service_delete", roles: "cleaner" });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/services?error=Cleaner+profile+not+found");
  const { service_id: serviceId } = parseFormOrRedirect(serviceIdSchema, formData, "/cleaner/services", "Choose a valid service.");
  const service = await one<{ id: number }>("SELECT id FROM services WHERE id = ? AND cleaner_id = ?", serviceId, cleanerId);
  if (!service) return;
  if (!await one("SELECT id FROM order_items WHERE service_id = ?", serviceId)) {
    await run("DELETE FROM services WHERE id = ? AND cleaner_id = ?", serviceId, cleanerId);
    await writeAuditLog({ actorUserId: user.id, action: "cleaner.service_delete", targetType: "service", targetId: serviceId, outcome: "succeeded", context });
  }
  revalidatePath("/cleaner/services");
}

export async function updateCleanerProfileAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "cleaner.profile_update",
    roles: "cleaner",
    rateLimit: { limit: 10, windowSeconds: 60 },
  });
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/profile?error=Cleaner+profile+not+found");
  const input = parseFormOrRedirect(cleanerProfileSchema, formData, "/cleaner/profile", "Enter valid business details.");
  await transaction(async () => {
    await run(
      `UPDATE cleaners SET
        business_name = ?, description = ?, address = ?, city = ?, phone = ?, turnaround_time = ?,
        opening_hours = ?, is_available = ?, updated_at = ?
       WHERE id = ?`,
      input.business_name,
      input.description ?? null,
      input.address,
      input.city,
      input.phone,
      input.turnaround_time ?? null,
      input.opening_hours ?? null,
      input.is_available ? 1 : 0,
      now(),
      cleanerId,
    );
    await writeAuditLog({ actorUserId: user.id, action: "cleaner.profile_update", targetType: "cleaner", targetId: cleanerId, outcome: "succeeded", context });
  });
  redirect("/cleaner/profile?success=Business+profile+updated");
}
