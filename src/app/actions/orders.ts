"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { authorizeAction } from "@/lib/authorization";
import { cleanerIdForUser } from "@/lib/auth";
import { DELIVERY_FEE, PLATFORM_FEE, STATUS_FLOW, TIME_WINDOWS } from "@/lib/constants";
import { all, now, one, run, transaction } from "@/lib/db";
import { isoDate, optionalTextField, parseFormOrRedirect, positiveId } from "@/lib/validation";
import { VENDOR_ROLES, type Service } from "@/lib/types";

const optionalDate = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  isoDate.optional(),
);
const optionalTimeWindow = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.enum(TIME_WINDOWS).optional(),
);
const optionalNonnegativeId = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? 0 : value,
  z.coerce.number().int().nonnegative(),
);

const scheduleFields = {
  pickup_date: isoDate,
  pickup_time_window: z.enum(TIME_WINDOWS),
  delivery_date: optionalDate,
  delivery_time_window: optionalTimeWindow,
};

const createOrderSchema = z.object({
  cleaner_id: positiveId,
  ...scheduleFields,
  pickup_address_id: optionalNonnegativeId,
  delivery_address_id: optionalNonnegativeId,
  pickup_address: optionalTextField(250),
  delivery_address: optionalTextField(250),
  pickup_notes: optionalTextField(1000),
  delivery_notes: optionalTextField(1000),
  notes: optionalTextField(1000),
}).superRefine((input, context) => {
  if (input.delivery_date && input.delivery_date < input.pickup_date) {
    context.addIssue({ code: "custom", path: ["delivery_date"], message: "Delivery cannot be before pickup." });
  }
  if (input.delivery_time_window && !input.delivery_date) {
    context.addIssue({ code: "custom", path: ["delivery_date"], message: "Choose a delivery date with the delivery window." });
  }
});

const statusSchema = z.object({
  order_id: positiveId,
  status: z.enum(["accepted", "picked_up", "in_cleaning", "ready", "out_for_delivery", "completed", "cancelled"]),
});

const rescheduleSchema = z.object({ order_id: positiveId, ...scheduleFields }).superRefine((input, context) => {
  if (input.delivery_date && input.delivery_date < input.pickup_date) {
    context.addIssue({ code: "custom", path: ["delivery_date"], message: "Delivery cannot be before pickup." });
  }
});

const reviewSchema = z.object({
  order_id: positiveId,
  rating: z.coerce.number().int().min(1).max(5),
  comment: optionalTextField(1000),
});

async function notify(userId: number, title: string, message: string, type: string, data: object) {
  await run(
    "INSERT INTO notifications (user_id, title, message, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    userId,
    title,
    message,
    type,
    JSON.stringify(data),
    now(),
    now(),
  );
}

async function activity(orderId: number, userId: number | null, action: string, description: string, metadata?: object) {
  await run(
    "INSERT INTO order_activities (order_id, user_id, action, description, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    orderId,
    userId,
    action,
    description,
    metadata ? JSON.stringify(metadata) : null,
    now(),
    now(),
  );
}

export async function createOrderAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "order.create",
    roles: "CUSTOMER",
    rateLimit: { limit: 10, windowSeconds: 60 },
  });
  const input = parseFormOrRedirect(createOrderSchema, formData, "/orders/new", "Enter valid order details.");
  const cleaner = await one<{ id: number; user_id: number | null; business_name: string }>(
    "SELECT id, user_id, business_name FROM cleaners WHERE id = ? AND is_approved = 1 AND is_available = 1",
    input.cleaner_id,
  );
  if (!cleaner) redirect("/orders/new?error=Choose+an+approved+and+available+cleaner");

  const availableServices = await all<Service>(
    "SELECT * FROM services WHERE cleaner_id = ? AND is_active = 1",
    input.cleaner_id,
  );
  let invalidQuantity = false;
  const selected = availableServices.flatMap((service) => {
    const parsed = z.coerce.number().int().min(0).max(100).safeParse(formData.get(`service_${service.id}`) ?? 0);
    if (!parsed.success) {
      invalidQuantity = true;
      return [];
    }
    return parsed.data > 0 ? [{ service, quantity: parsed.data }] : [];
  });
  if (invalidQuantity || !selected.length) {
    redirect(`/orders/new?cleaner=${input.cleaner_id}&error=Select+valid+service+quantities`);
  }

  const today = new Date().toISOString().slice(0, 10);
  if (input.pickup_date < today) {
    redirect(`/orders/new?cleaner=${input.cleaner_id}&error=Pickup+date+cannot+be+in+the+past`);
  }

  const addressFor = async (id: number, fallback?: string) => {
    if (!id) return fallback ?? "";
    const address = await one<{ address: string; city: string }>(
      "SELECT address, city FROM addresses WHERE id = ? AND user_id = ?",
      id,
      user.id,
    );
    return address ? `${address.address}, ${address.city}` : "";
  };
  const pickupAddress = await addressFor(input.pickup_address_id, input.pickup_address);
  const deliveryAddress = await addressFor(input.delivery_address_id, input.delivery_address);
  if (!pickupAddress || !deliveryAddress) {
    redirect(`/orders/new?cleaner=${input.cleaner_id}&error=Add+valid+pickup+and+delivery+addresses`);
  }

  const subtotal = selected.reduce((sum, item) => sum + Number(item.service.price) * item.quantity, 0);
  const total = subtotal + DELIVERY_FEE + PLATFORM_FEE;
  const orderId = await transaction(async () => {
    const result = await run(
      `INSERT INTO orders
       (customer_id, cleaner_id, pickup_address, delivery_address, pickup_date, pickup_time_window, delivery_date, delivery_time_window, status, subtotal, delivery_fee, platform_fee, total, payment_status, pickup_notes, delivery_notes, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?)`,
      user.id,
      input.cleaner_id,
      pickupAddress,
      deliveryAddress,
      input.pickup_date,
      input.pickup_time_window,
      input.delivery_date ?? null,
      input.delivery_time_window ?? null,
      subtotal,
      DELIVERY_FEE,
      PLATFORM_FEE,
      total,
      input.pickup_notes ?? null,
      input.delivery_notes ?? null,
      input.notes ?? null,
      now(),
      now(),
    );
    const id = Number(result.lastInsertRowid);
    for (const item of selected) {
      await run(
        "INSERT INTO order_items (order_id, service_id, quantity, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        item.service.id,
        item.quantity,
        item.service.price,
        now(),
        now(),
      );
    }
    await activity(id, user.id, "order_created", `Order was created by ${user.name} and sent to ${cleaner.business_name}.`, { total });
    await activity(id, user.id, "schedule_created", `Pickup scheduled for ${input.pickup_date} during ${input.pickup_time_window}.`, {
      pickupDate: input.pickup_date,
      pickupWindow: input.pickup_time_window,
      deliveryDate: input.delivery_date ?? null,
      deliveryWindow: input.delivery_time_window ?? null,
    });
    if (cleaner.user_id) {
      await notify(
        cleaner.user_id,
        "New laundry order",
        `${user.name} created a new order for pickup on ${input.pickup_date} during ${input.pickup_time_window}.`,
        "order_created",
        { order_id: id },
      );
    }
    await writeAuditLog({
      actorUserId: user.id,
      action: "order.create",
      targetType: "order",
      targetId: id,
      outcome: "succeeded",
      metadata: { cleanerId: input.cleaner_id, itemCount: selected.length },
      context,
    });
    return id;
  });
  redirect(`/orders/${orderId}?success=Order+created+successfully`);
}

export async function updateOrderStatusAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "order.status_update", roles: VENDOR_ROLES });
  const input = parseFormOrRedirect(statusSchema, formData, "/cleaner/dashboard", "Choose a valid order status.");
  const cleanerId = await cleanerIdForUser(user.id);
  const order = await one<{
    id: number;
    cleaner_id: number;
    customer_id: number | null;
    status: string;
    business_name: string;
    is_approved: number;
  }>(
    `SELECT o.id, o.cleaner_id, o.customer_id, o.status, c.business_name, c.is_approved
     FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.id = ?`,
    input.order_id,
  );
  if (!order || order.cleaner_id !== cleanerId || !order.is_approved) {
    await writeAuditLog({ actorUserId: user.id, action: "order.status_update", targetType: "order", targetId: input.order_id, outcome: "denied", metadata: { reason: "ownership" }, context });
    redirect("/cleaner/dashboard?error=Order+access+denied");
  }
  if (!(STATUS_FLOW[order.status] ?? []).includes(input.status)) {
    await writeAuditLog({ actorUserId: user.id, action: "order.status_update", targetType: "order", targetId: input.order_id, outcome: "denied", metadata: { reason: "invalid_transition" }, context });
    redirect(`/orders/${input.order_id}?error=That+status+change+is+not+allowed`);
  }

  await transaction(async () => {
    await run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?", input.status, now(), input.order_id, order.status);
    const description = `${order.business_name} updated the order from ${order.status.replaceAll("_", " ")} to ${input.status.replaceAll("_", " ")}.`;
    await activity(input.order_id, user.id, "order_status_updated", description, { from: order.status, to: input.status });
    if (order.customer_id) {
      await notify(
        order.customer_id,
        input.status === "accepted" ? "Order accepted" : "Order status updated",
        description,
        "order_status_updated",
        { order_id: input.order_id, status: input.status },
      );
    }
    await writeAuditLog({ actorUserId: user.id, action: "order.status_update", targetType: "order", targetId: input.order_id, outcome: "succeeded", metadata: { from: order.status, to: input.status }, context });
  });
  revalidatePath(`/orders/${input.order_id}`);
  revalidatePath("/cleaner/dashboard");
}

export async function rescheduleOrderAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "order.reschedule", roles: "CUSTOMER" });
  const input = parseFormOrRedirect(rescheduleSchema, formData, "/customer/dashboard", "Choose a valid schedule.");
  const order = await one<{ id: number; customer_id: number; cleaner_user_id: number | null; status: string }>(
    `SELECT o.id, o.customer_id, o.status, c.user_id AS cleaner_user_id
     FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.id = ?`,
    input.order_id,
  );
  if (!order || order.customer_id !== user.id || !["pending", "accepted"].includes(order.status)) {
    await writeAuditLog({ actorUserId: user.id, action: "order.reschedule", targetType: "order", targetId: input.order_id, outcome: "denied", metadata: { reason: "ownership_or_state" }, context });
    redirect(`/orders/${input.order_id}?error=This+order+cannot+be+rescheduled`);
  }
  if (input.pickup_date < new Date().toISOString().slice(0, 10)) {
    redirect(`/orders/${input.order_id}?error=Pickup+date+cannot+be+in+the+past`);
  }

  await transaction(async () => {
    await run(
      "UPDATE orders SET pickup_date = ?, pickup_time_window = ?, delivery_date = ?, delivery_time_window = ?, updated_at = ? WHERE id = ? AND customer_id = ?",
      input.pickup_date,
      input.pickup_time_window,
      input.delivery_date ?? null,
      input.delivery_time_window ?? null,
      now(),
      input.order_id,
      user.id,
    );
    await activity(input.order_id, user.id, "schedule_updated", `Pickup rescheduled for ${input.pickup_date} during ${input.pickup_time_window}.`);
    if (order.cleaner_user_id) {
      await notify(order.cleaner_user_id, "Order rescheduled", `${user.name} updated the pickup schedule.`, "schedule_updated", { order_id: input.order_id });
    }
    await writeAuditLog({ actorUserId: user.id, action: "order.reschedule", targetType: "order", targetId: input.order_id, outcome: "succeeded", context });
  });
  redirect(`/orders/${input.order_id}?success=Schedule+updated`);
}

export async function createReviewAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "review.create", roles: "CUSTOMER", rateLimit: { limit: 10, windowSeconds: 60 } });
  const input = parseFormOrRedirect(reviewSchema, formData, "/customer/dashboard", "Enter a valid review.");
  const order = await one<{ id: number; customer_id: number; cleaner_id: number; cleaner_user_id: number | null; status: string }>(
    `SELECT o.id, o.customer_id, o.cleaner_id, o.status, c.user_id AS cleaner_user_id
     FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.id = ?`,
    input.order_id,
  );
  if (!order || order.customer_id !== user.id || order.status !== "completed" || await one("SELECT id FROM reviews WHERE order_id = ?", input.order_id)) {
    await writeAuditLog({ actorUserId: user.id, action: "review.create", targetType: "order", targetId: input.order_id, outcome: "denied", metadata: { reason: "ownership_or_state" }, context });
    redirect(`/orders/${input.order_id}?error=This+order+cannot+be+reviewed`);
  }

  await transaction(async () => {
    const result = await run(
      "INSERT INTO reviews (order_id, customer_id, cleaner_id, rating, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      input.order_id,
      user.id,
      order.cleaner_id,
      input.rating,
      input.comment ?? null,
      now(),
      now(),
    );
    const average = (await one<{ rating: number }>(
      "SELECT AVG(rating) AS rating FROM reviews WHERE cleaner_id = ?",
      order.cleaner_id,
    ))?.rating ?? 0;
    await run("UPDATE cleaners SET rating = ?, updated_at = ? WHERE id = ?", Number(average).toFixed(1), now(), order.cleaner_id);
    await activity(input.order_id, user.id, "review_created", `${user.name} left a ${input.rating}-star review.`);
    if (order.cleaner_user_id) {
      await notify(order.cleaner_user_id, "New customer review", `${user.name} left a ${input.rating}-star review.`, "review_created", { order_id: input.order_id });
    }
    await writeAuditLog({ actorUserId: user.id, action: "review.create", targetType: "review", targetId: Number(result.lastInsertRowid), outcome: "succeeded", context });
  });
  redirect(`/orders/${input.order_id}?success=Review+submitted`);
}
