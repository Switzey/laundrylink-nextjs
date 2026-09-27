"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { now, one, run, transaction } from "@/lib/db";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function saveAddressAction(formData: FormData) {
  const user = await requireUser("customer");
  const label = text(formData, "label");
  const address = text(formData, "address");
  const city = text(formData, "city");
  const phone = text(formData, "phone");
  const notes = text(formData, "delivery_notes");
  const isDefault = formData.get("is_default") === "on";
  if (!address || !city) redirect("/customer/addresses?error=Address+and+city+are+required");
  await transaction(async () => {
    if (isDefault || !await one("SELECT id FROM addresses WHERE user_id = ?", user.id)) await run("UPDATE addresses SET is_default = 0 WHERE user_id = ?", user.id);
    await run("INSERT INTO addresses (user_id, label, address, city, phone, is_default, delivery_notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", user.id, label || null, address, city, phone || null, isDefault ? 1 : 0, notes || null, now(), now());
  });
  revalidatePath("/customer/addresses");
}

export async function deleteAddressAction(formData: FormData) {
  const user = await requireUser("customer");
  await run("DELETE FROM addresses WHERE id = ? AND user_id = ?", Number(text(formData, "address_id")), user.id);
  revalidatePath("/customer/addresses");
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  const name = text(formData, "name");
  const phone = text(formData, "phone");
  const address = text(formData, "address");
  if (name.length < 2) redirect("/profile?error=Enter+a+valid+name");
  await run("UPDATE users SET name = ?, phone = ?, address = ?, updated_at = ? WHERE id = ?", name, phone || null, address || null, now(), user.id);
  redirect("/profile?success=Profile+updated");
}

export async function markNotificationReadAction(formData: FormData) {
  const user = await requireUser();
  await run("UPDATE notifications SET read_at = ?, updated_at = ? WHERE id = ? AND user_id = ?", now(), now(), Number(text(formData, "notification_id")), user.id);
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await run("UPDATE notifications SET read_at = ?, updated_at = ? WHERE user_id = ? AND read_at IS NULL", now(), now(), user.id);
  revalidatePath("/notifications");
}

