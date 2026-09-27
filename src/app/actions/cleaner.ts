"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { now, one, run } from "@/lib/db";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function addServiceAction(formData: FormData) {
  const user = await requireUser("cleaner");
  const cleanerId = await cleanerIdForUser(user.id);
  const name = text(formData, "name");
  const price = Number(text(formData, "price"));
  if (!cleanerId || !name || price <= 0) redirect("/cleaner/services?error=Add+a+valid+service+name+and+price");
  await run("INSERT INTO services (cleaner_id, name, description, price, unit, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)", cleanerId, name, text(formData, "description") || null, price, text(formData, "unit") || "per_item", now(), now());
  revalidatePath("/cleaner/services");
}

export async function toggleServiceAction(formData: FormData) {
  const user = await requireUser("cleaner");
  const cleanerId = await cleanerIdForUser(user.id);
  await run("UPDATE services SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ? AND cleaner_id = ?", now(), Number(text(formData, "service_id")), cleanerId);
  revalidatePath("/cleaner/services");
}

export async function deleteServiceAction(formData: FormData) {
  const user = await requireUser("cleaner");
  const cleanerId = await cleanerIdForUser(user.id);
  const serviceId = Number(text(formData, "service_id"));
  if (!await one("SELECT id FROM order_items WHERE service_id = ?", serviceId)) await run("DELETE FROM services WHERE id = ? AND cleaner_id = ?", serviceId, cleanerId);
  revalidatePath("/cleaner/services");
}

export async function updateCleanerProfileAction(formData: FormData) {
  const user = await requireUser("cleaner");
  const cleanerId = await cleanerIdForUser(user.id);
  if (!cleanerId) redirect("/cleaner/profile?error=Cleaner+profile+not+found");
  await run(
    `UPDATE cleaners SET business_name = ?, description = ?, address = ?, city = ?, phone = ?, turnaround_time = ?, opening_hours = ?, is_available = ?, updated_at = ? WHERE id = ?`,
    text(formData, "business_name"), text(formData, "description") || null, text(formData, "address"), text(formData, "city"), text(formData, "phone"), text(formData, "turnaround_time") || null, text(formData, "opening_hours") || null, formData.get("is_available") === "on" ? 1 : 0, now(), cleanerId,
  );
  redirect("/cleaner/profile?success=Business+profile+updated");
}

