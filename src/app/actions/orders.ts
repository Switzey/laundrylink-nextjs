"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { DELIVERY_FEE, PLATFORM_FEE, STATUS_FLOW, TIME_WINDOWS } from "@/lib/constants";
import { all, now, one, run, transaction } from "@/lib/db";
import type { Service } from "@/lib/types";

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function notify(userId: number, title: string, message: string, type: string, data: object) {
  await run(
    "INSERT INTO notifications (user_id, title, message, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    userId, title, message, type, JSON.stringify(data), now(), now(),
  );
}

async function activity(orderId: number, userId: number | null, action: string, description: string, metadata?: object) {
  await run(
    "INSERT INTO order_activities (order_id, user_id, action, description, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    orderId, userId, action, description, metadata ? JSON.stringify(metadata) : null, now(), now(),
  );
}

export async function createOrderAction(formData: FormData) {
  const user = await requireUser("customer");
  const cleanerId = Number(text(formData, "cleaner_id"));
  const cleaner = await one<{ id: number; user_id: number | null; business_name: string }>(
    "SELECT id, user_id, business_name FROM cleaners WHERE id = ? AND is_approved = 1 AND is_available = 1", cleanerId,
  );
  if (!cleaner) redirect("/orders/new?error=Choose+an+approved+and+available+cleaner");

  const availableServices = await all<Service>("SELECT * FROM services WHERE cleaner_id = ? AND is_active = 1", cleanerId);
  const selected = availableServices.map((service) => ({ service, quantity: Number(text(formData, `service_${service.id}`) || 0) })).filter((item) => item.quantity > 0 && item.quantity <= 100);
  if (!selected.length) redirect(`/orders/new?cleaner=${cleanerId}&error=Select+at+least+one+service`);

  const pickupDate = text(formData, "pickup_date");
  const pickupWindow = text(formData, "pickup_time_window");
  const deliveryDate = text(formData, "delivery_date");
  const deliveryWindow = text(formData, "delivery_time_window");
  if (!pickupDate || pickupDate < new Date().toISOString().slice(0, 10) || !TIME_WINDOWS.includes(pickupWindow as (typeof TIME_WINDOWS)[number])) {
    redirect(`/orders/new?cleaner=${cleanerId}&error=Choose+a+valid+pickup+date+and+window`);
  }

  const pickupAddressId = Number(text(formData, "pickup_address_id"));
  const deliveryAddressId = Number(text(formData, "delivery_address_id"));
  const addressFor = async (id: number, fallback: string) => {
    if (!id) return fallback;
    const address = await one<{ address: string; city: string }>("SELECT address, city FROM addresses WHERE id = ? AND user_id = ?", id, user.id);
    return address ? `${address.address}, ${address.city}` : "";
  };
  const pickupAddress = await addressFor(pickupAddressId, text(formData, "pickup_address"));
  const deliveryAddress = await addressFor(deliveryAddressId, text(formData, "delivery_address"));
  if (!pickupAddress || !deliveryAddress) redirect(`/orders/new?cleaner=${cleanerId}&error=Add+valid+pickup+and+delivery+addresses`);

  const subtotal = selected.reduce((sum, item) => sum + Number(item.service.price) * item.quantity, 0);
  const total = subtotal + DELIVERY_FEE + PLATFORM_FEE;
  const orderId = await transaction(async () => {
    const result = await run(
      `INSERT INTO orders
       (customer_id, cleaner_id, pickup_address, delivery_address, pickup_date, pickup_time_window, delivery_date, delivery_time_window, status, subtotal, delivery_fee, platform_fee, total, payment_status, pickup_notes, delivery_notes, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?)`,
      user.id, cleanerId, pickupAddress, deliveryAddress, pickupDate, pickupWindow, deliveryDate || null, deliveryWindow || null, subtotal, DELIVERY_FEE, PLATFORM_FEE, total, text(formData, "pickup_notes") || null, text(formData, "delivery_notes") || null, text(formData, "notes") || null, now(), now(),
    );
    const id = Number(result.lastInsertRowid);
    for (const item of selected) {
      await run("INSERT INTO order_items (order_id, service_id, quantity, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", id, item.service.id, item.quantity, item.service.price, now(), now());
    }
    await activity(id, user.id, "order_created", `Order was created by ${user.name} and sent to ${cleaner.business_name}.`, { total });
    await activity(id, user.id, "schedule_created", `Pickup scheduled for ${pickupDate} during ${pickupWindow}.`, { pickupDate, pickupWindow, deliveryDate, deliveryWindow });
    if (cleaner.user_id) await notify(cleaner.user_id, "New laundry order", `${user.name} created a new order for pickup on ${pickupDate} during ${pickupWindow}.`, "order_created", { order_id: id });
    return id;
  });
  redirect(`/orders/${orderId}?success=Order+created+successfully`);
}

export async function updateOrderStatusAction(formData: FormData) {
  const user = await requireUser("cleaner");
  const cleanerId = await cleanerIdForUser(user.id);
  const orderId = Number(text(formData, "order_id"));
  const status = text(formData, "status");
  const order = await one<{ id: number; cleaner_id: number; customer_id: number | null; status: string; business_name: string; is_approved: number }>(
    `SELECT o.id, o.cleaner_id, o.customer_id, o.status, c.business_name, c.is_approved FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.id = ?`, orderId,
  );
  if (!order || order.cleaner_id !== cleanerId || !order.is_approved) redirect("/cleaner/dashboard?error=Order+access+denied");
  if (!(STATUS_FLOW[order.status] ?? []).includes(status)) redirect(`/orders/${orderId}?error=That+status+change+is+not+allowed`);
  await run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", status, now(), orderId);
  const description = `${order.business_name} updated the order from ${order.status.replaceAll("_", " ")} to ${status.replaceAll("_", " ")}.`;
  await activity(orderId, user.id, "order_status_updated", description, { from: order.status, to: status });
  if (order.customer_id) await notify(order.customer_id, status === "accepted" ? "Order accepted" : "Order status updated", description, "order_status_updated", { order_id: orderId, status });
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/cleaner/dashboard");
}

export async function rescheduleOrderAction(formData: FormData) {
  const user = await requireUser("customer");
  const orderId = Number(text(formData, "order_id"));
  const order = await one<{ id: number; customer_id: number; cleaner_user_id: number | null; status: string }>(
    `SELECT o.id, o.customer_id, o.status, c.user_id AS cleaner_user_id FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.id = ?`, orderId,
  );
  if (!order || order.customer_id !== user.id || !["pending", "accepted"].includes(order.status)) redirect(`/orders/${orderId}?error=This+order+cannot+be+rescheduled`);
  const pickupDate = text(formData, "pickup_date");
  const pickupWindow = text(formData, "pickup_time_window");
  const deliveryDate = text(formData, "delivery_date");
  const deliveryWindow = text(formData, "delivery_time_window");
  if (!pickupDate || !TIME_WINDOWS.includes(pickupWindow as (typeof TIME_WINDOWS)[number])) redirect(`/orders/${orderId}?error=Choose+a+valid+schedule`);
  await run("UPDATE orders SET pickup_date = ?, pickup_time_window = ?, delivery_date = ?, delivery_time_window = ?, updated_at = ? WHERE id = ?", pickupDate, pickupWindow, deliveryDate || null, deliveryWindow || null, now(), orderId);
  await activity(orderId, user.id, "schedule_updated", `Pickup rescheduled for ${pickupDate} during ${pickupWindow}.`);
  if (order.cleaner_user_id) await notify(order.cleaner_user_id, "Order rescheduled", `${user.name} updated the pickup schedule.`, "schedule_updated", { order_id: orderId });
  redirect(`/orders/${orderId}?success=Schedule+updated`);
}

export async function createReviewAction(formData: FormData) {
  const user = await requireUser("customer");
  const orderId = Number(text(formData, "order_id"));
  const rating = Number(text(formData, "rating"));
  const comment = text(formData, "comment");
  const order = await one<{ id: number; customer_id: number; cleaner_id: number; cleaner_user_id: number | null; status: string }>(
    `SELECT o.id, o.customer_id, o.cleaner_id, o.status, c.user_id AS cleaner_user_id FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.id = ?`, orderId,
  );
  if (!order || order.customer_id !== user.id || order.status !== "completed" || rating < 1 || rating > 5 || await one("SELECT id FROM reviews WHERE order_id = ?", orderId)) redirect(`/orders/${orderId}?error=This+order+cannot+be+reviewed`);
  await transaction(async () => {
    await run("INSERT INTO reviews (order_id, customer_id, cleaner_id, rating, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", orderId, user.id, order.cleaner_id, rating, comment || null, now(), now());
    const average = (await one<{ rating: number }>("SELECT AVG(rating) AS rating FROM reviews WHERE cleaner_id = ?", order.cleaner_id))?.rating ?? 0;
    await run("UPDATE cleaners SET rating = ?, updated_at = ? WHERE id = ?", Number(average).toFixed(1), now(), order.cleaner_id);
    await activity(orderId, user.id, "review_created", `${user.name} left a ${rating}-star review.`);
    if (order.cleaner_user_id) await notify(order.cleaner_user_id, "New customer review", `${user.name} left a ${rating}-star review.`, "review_created", { order_id: orderId });
  });
  redirect(`/orders/${orderId}?success=Review+submitted`);
}

