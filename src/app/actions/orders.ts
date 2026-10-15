"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { authorizeAction } from "@/lib/authorization";
import { cleanerIdForUser } from "@/lib/auth";
import { pathWithParams } from "@/lib/auth-intent";
import { DELIVERY_FEE, PLATFORM_FEE } from "@/lib/constants";
import { all, now, one, run, transaction } from "@/lib/db";
import { calculateOrderTotals, canTransitionOrder, customerCanRescheduleOrder, customerCanReviewOrder, parseServiceQuantity, vendorCanManageOrder } from "@/lib/order-policy";
import { createOrderSchema, orderStatusSchema, rescheduleOrderSchema, reviewSchema } from "@/lib/order-validation";
import { parseFormOrRedirect, positiveId } from "@/lib/validation";
import { VENDOR_ROLES, type Service } from "@/lib/types";
import { getVendorEligibility } from "@/lib/vendor-eligibility";

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
  const cleanerId = positiveId.safeParse(formData.get("cleaner_id"));
  const returnTo = cleanerId.success ? `/orders/new?cleaner=${cleanerId.data}&resume=1` : "/orders/new";
  const { user, context } = await authorizeAction({
    action: "order.create",
    roles: "CUSTOMER",
    rateLimit: { limit: 10, windowSeconds: 60 },
    returnTo,
  });
  const input = parseFormOrRedirect(createOrderSchema, formData, returnTo, "Enter valid order details.");
  const eligibility = await getVendorEligibility(input.cleaner_id);
  const cleaner = eligibility?.bookable
    ? await one<{ id: number; user_id: number | null; business_name: string }>(
      "SELECT id, user_id, business_name FROM cleaners WHERE id = ?",
      input.cleaner_id,
    )
    : null;
  if (!cleaner) redirect(pathWithParams(returnTo, { error: "This cleaner is not accepting new orders" }));

  const availableServices = await all<Service>(
    "SELECT * FROM services WHERE cleaner_id = ? AND is_active = 1",
    input.cleaner_id,
  );
  let invalidQuantity = false;
  const selected = availableServices.flatMap((service) => {
    const quantity = parseServiceQuantity(formData.get(`service_${service.id}`));
    if (quantity === null) {
      invalidQuantity = true;
      return [];
    }
    return quantity > 0 ? [{ service, quantity }] : [];
  });
  if (invalidQuantity || !selected.length) {
    redirect(pathWithParams(returnTo, { error: "Select valid service quantities" }));
  }

  const today = new Date().toISOString().slice(0, 10);
  if (input.pickup_date < today) {
    redirect(pathWithParams(returnTo, { error: "Pickup date cannot be in the past" }));
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
    redirect(pathWithParams(returnTo, { error: "Add valid pickup and delivery addresses" }));
  }

  const selectedQuantities = selected.map((item) => ({ serviceId: item.service.id, quantity: item.quantity }));
  const created = await transaction(async () => {
    const currentEligibility = await getVendorEligibility(input.cleaner_id);
    if (!currentEligibility?.bookable) return { error: "This cleaner stopped accepting new orders. Please choose another cleaner." } as const;
    const currentServices = await all<Service>(
      `SELECT * FROM services WHERE cleaner_id = ? AND is_active = 1
       AND price > 0 AND price <= 10000000 ORDER BY name`,
      input.cleaner_id,
    );
    const servicesById = new Map(currentServices.map((service) => [service.id, service]));
    const currentSelected = selectedQuantities.flatMap(({ serviceId, quantity }) => {
      const service = servicesById.get(serviceId);
      return service ? [{ service, quantity }] : [];
    });
    if (currentSelected.length !== selectedQuantities.length) {
      return { error: "One or more selected services are no longer available." } as const;
    }
    const { subtotal, total } = calculateOrderTotals(currentSelected.map((item) => ({ price: item.service.price, quantity: item.quantity })));
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
    for (const item of currentSelected) {
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
      metadata: { cleanerId: input.cleaner_id, itemCount: currentSelected.length },
      context,
    });
    return { id } as const;
  });
  if ("error" in created) redirect(pathWithParams(returnTo, { error: created.error }));
  redirect(`/orders/${created.id}?success=Order+created+successfully`);
}

export async function updateOrderStatusAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "order.status_update", roles: VENDOR_ROLES });
  const input = parseFormOrRedirect(orderStatusSchema, formData, "/cleaner/dashboard", "Choose a valid order status.");
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
  if (!order || !vendorCanManageOrder(order.cleaner_id, cleanerId, order.is_approved === 1)) {
    await writeAuditLog({ actorUserId: user.id, action: "order.status_update", targetType: "order", targetId: input.order_id, outcome: "denied", metadata: { reason: "ownership" }, context });
    redirect("/cleaner/dashboard?error=Order+access+denied");
  }
  if (!canTransitionOrder(order.status, input.status)) {
    await writeAuditLog({ actorUserId: user.id, action: "order.status_update", targetType: "order", targetId: input.order_id, outcome: "denied", metadata: { reason: "invalid_transition" }, context });
    redirect(`/orders/${input.order_id}?error=That+status+change+is+not+allowed`);
  }

  await transaction(async () => {
    const update = await run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?", input.status, now(), input.order_id, order.status);
    if (!update.changes) return;
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
  const input = parseFormOrRedirect(rescheduleOrderSchema, formData, "/customer/dashboard", "Choose a valid schedule.");
  const order = await one<{ id: number; customer_id: number; cleaner_user_id: number | null; status: string }>(
    `SELECT o.id, o.customer_id, o.status, c.user_id AS cleaner_user_id
     FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.id = ?`,
    input.order_id,
  );
  if (!order || !customerCanRescheduleOrder(order.customer_id, user.id, order.status)) {
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
  const existingReview = order ? await one("SELECT id FROM reviews WHERE order_id = ?", input.order_id) : null;
  if (!order || !customerCanReviewOrder(order.customer_id, user.id, order.status, Boolean(existingReview))) {
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
