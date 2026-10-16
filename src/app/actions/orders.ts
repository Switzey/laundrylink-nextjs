"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { authorizeAction } from "@/lib/authorization";
import { cleanerIdForUser } from "@/lib/auth";
import { pathWithParams } from "@/lib/auth-intent";
import { PLATFORM_FEE } from "@/lib/constants";
import { expireUnpaidReservations, generateOrderNumber, slotAvailability, validateVoucherForOrder } from "@/lib/booking";
import { customerCancellationDecision, earliestDeliveryDate, pickupMeetsLeadTime, reservationExpiry, selectedTurnaroundHours } from "@/lib/booking-policy";
import { all, now, one, run, transaction } from "@/lib/db";
import { canTransitionOrder, customerCanRescheduleOrder, customerCanReviewOrder, parseServiceQuantity, vendorCanManageOrder } from "@/lib/order-policy";
import { createOrderSchema, orderStatusSchema, rescheduleOrderSchema, reviewSchema } from "@/lib/order-validation";
import { parseFormOrRedirect, positiveId } from "@/lib/validation";
import { VENDOR_ROLES, type Service } from "@/lib/types";
import { getVendorEligibility } from "@/lib/vendor-eligibility";
import { calculateOrderPricing, calculatePricingLine, distanceKm, type BulkDiscount, type DeliveryPricing, type PriceableService } from "@/lib/pricing-engine";
import { prepareOrderAttachments } from "@/lib/order-attachments";
import { z } from "zod";

const reorderSchema = z.object({ order_id: positiveId });
const confirmPricingSchema = z.object({ order_id: positiveId });
const pricingResponseSchema = z.object({ adjustment_id: positiveId, decision: z.enum(["accepted", "rejected"]) });
const cancelOrderSchema = z.object({ order_id: positiveId, reason: z.string().trim().min(5).max(500) });

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

export async function validateBookingVoucherAction(input: { cleanerId: number; subtotal: number; code: string }) {
  const { user } = await authorizeAction({
    action: "booking.voucher_validate",
    roles: "CUSTOMER",
    rateLimit: { limit: 10, windowSeconds: 60 },
    returnTo: `/orders/new?cleaner=${Number(input.cleanerId) || ""}`,
  });
  const parsed = z.object({ cleanerId: positiveId, subtotal: z.coerce.number().positive().max(100000000), code: z.string().trim().min(3).max(32) }).safeParse(input);
  if (!parsed.success) return { valid: false as const, message: "Enter a valid voucher code." };
  return validateVoucherForOrder({
    cleanerId: parsed.data.cleanerId,
    subtotal: parsed.data.subtotal,
    code: parsed.data.code,
    userId: user.id,
  });
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
    ? await one<{ id: number; user_id: number | null; business_name: string; minimum_order_amount: number; delivery_pricing_type: "fixed" | "distance" | "free"; base_delivery_fee: number; delivery_fee_per_km: number; free_delivery_threshold: number | null; latitude: number | null; longitude: number | null; daily_order_capacity: number; daily_weight_capacity: number; express_daily_capacity: number; minimum_lead_hours: number; express_turnaround_hours: number; booking_hold_minutes: number; auto_accept_orders: number }>(
      `SELECT id, user_id, business_name, minimum_order_amount, delivery_pricing_type, base_delivery_fee,
        delivery_fee_per_km, free_delivery_threshold, latitude, longitude, daily_order_capacity,
        daily_weight_capacity, express_daily_capacity, minimum_lead_hours, express_turnaround_hours, booking_hold_minutes, auto_accept_orders
       FROM cleaners WHERE id = ?`,
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
    return quantity > 0 ? [{ service, quantity, express: formData.get(`express_${service.id}`) === "on", specialTreatment: formData.get(`treatment_${service.id}`) === "on" }] : [];
  });
  if (invalidQuantity || !selected.length) {
    redirect(pathWithParams(returnTo, { error: "Select valid service quantities" }));
  }

  const today = new Date().toISOString().slice(0, 10);
  if (input.pickup_date < today) {
    redirect(pathWithParams(returnTo, { error: "Pickup date cannot be in the past" }));
  }
  if (!pickupMeetsLeadTime(input.pickup_date, Number(cleaner.minimum_lead_hours))) {
    redirect(pathWithParams(returnTo, { error: `Pickup requires at least ${cleaner.minimum_lead_hours} hours notice` }));
  }

  const addressFor = async (id: number, fallback?: string) => {
    if (!id) return { label: fallback ?? "", latitude: null, longitude: null };
    const address = await one<{ address: string; city: string; latitude: number | null; longitude: number | null }>(
      "SELECT address, city, latitude, longitude FROM addresses WHERE id = ? AND user_id = ?",
      id,
      user.id,
    );
    return address ? { label: `${address.address}, ${address.city}`, latitude: address.latitude, longitude: address.longitude } : { label: "", latitude: null, longitude: null };
  };
  const pickupAddress = await addressFor(input.pickup_address_id, input.pickup_address);
  const deliveryAddress = await addressFor(input.delivery_address_id, input.delivery_address);
  if (!pickupAddress.label || !deliveryAddress.label) {
    redirect(pathWithParams(returnTo, { error: "Add valid pickup and delivery addresses" }));
  }

  const selectedQuantities = selected.map((item) => ({ serviceId: item.service.id, quantity: item.quantity, express: item.express, specialTreatment: item.specialTreatment }));
  const zoneInput = z.coerce.number().int().nonnegative().safeParse(formData.get("delivery_zone_id") ?? 0);
  if (!zoneInput.success) redirect(pathWithParams(returnTo, { error: "Choose a valid delivery zone" }));
  let attachments;
  try {
    attachments = await prepareOrderAttachments(formData.getAll("attachments"));
  } catch (error) {
    redirect(pathWithParams(returnTo, { error: error instanceof Error ? error.message : "Choose valid garment photos" }));
  }
  const created = await transaction(async () => {
    await expireUnpaidReservations(input.cleaner_id);
    const currentEligibility = await getVendorEligibility(input.cleaner_id);
    if (!currentEligibility?.bookable) return { error: "This cleaner stopped accepting new orders. Please choose another cleaner." } as const;
    const currentServices = await all<Service>(
      `SELECT * FROM services WHERE cleaner_id = ? AND is_active = 1
       AND price > 0 AND price <= 10000000 ORDER BY name`,
      input.cleaner_id,
    );
    const servicesById = new Map(currentServices.map((service) => [service.id, service]));
    const discountRows = await all<BulkDiscount & { service_id: number }>(
      `SELECT d.service_id, d.minimum_quantity, d.discount_type, d.discount_value
       FROM service_bulk_discounts d JOIN services s ON s.id = d.service_id
       WHERE s.cleaner_id = ? AND d.is_active = 1 ORDER BY d.minimum_quantity`,
      input.cleaner_id,
    );
    const currentSelected = selectedQuantities.flatMap(({ serviceId, quantity, express, specialTreatment }) => {
      const service = servicesById.get(serviceId);
      return service ? [{ service: { ...service, discounts: discountRows.filter((discount) => discount.service_id === serviceId) }, quantity, express, specialTreatment }] : [];
    });
    if (currentSelected.length !== selectedQuantities.length) {
      return { error: "One or more selected services are no longer available." } as const;
    }
    if (currentSelected.some((item) => item.express && !item.service.express_available)) {
      return { error: "Express service is no longer available for one or more selected items." } as const;
    }
    if (currentSelected.some((item) => item.specialTreatment && !item.service.special_treatment_available)) {
      return { error: "Special treatment is no longer available for one or more selected items." } as const;
    }
    const isExpress = currentSelected.some((item) => item.express);
    const closure = await one<{ id: number }>(
      "SELECT id FROM vendor_closures WHERE cleaner_id=? AND branch_id IS NULL AND starts_at < ? AND ends_at > ? LIMIT 1",
      input.cleaner_id, `${input.pickup_date} 23:59:59`, `${input.pickup_date} 00:00:00`,
    );
    if (closure) return { error: "This cleaner is closed on the selected pickup date." } as const;
    const requestedWeight = currentSelected.filter((item) => item.service.unit === "per_kg").reduce((sum, item) => sum + item.quantity, 0);
    if (requestedWeight > 0) {
      const bookedWeight = await one<{ total: number }>(`SELECT COALESCE(SUM(oi.quantity),0) total FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.cleaner_id=? AND o.pickup_date=? AND oi.unit='per_kg' AND o.status NOT IN ('cancelled','rejected')`, input.cleaner_id, input.pickup_date);
      if (Number(bookedWeight?.total ?? 0) + requestedWeight > Number(cleaner.daily_weight_capacity)) return { error: "That date has reached its laundry weight capacity." } as const;
    }
    const availableWindows = await slotAvailability(cleaner, input.pickup_date, isExpress);
    if (!availableWindows.some((slot) => slot.window === input.pickup_time_window && slot.available)) {
      return { error: "That pickup window has just filled up. Choose another available slot." } as const;
    }
    const requiredTurnaround = Math.max(...currentSelected.map((item) => selectedTurnaroundHours(
      [item.service],
      item.express,
      Number(cleaner.express_turnaround_hours),
    )));
    const earliestDelivery = earliestDeliveryDate(input.pickup_date, requiredTurnaround);
    if (!input.delivery_date || input.delivery_date < earliestDelivery) {
      return { error: `The earliest available delivery date is ${earliestDelivery}.` } as const;
    }
    const zone = zoneInput.data ? await one<{ id: number; name: string; pricing_type: "fixed" | "distance" | "free"; base_fee: number; per_km_fee: number; minimum_fee: number; maximum_fee: number | null; radius_km: number | null }>(
      "SELECT * FROM delivery_zones WHERE id = ? AND cleaner_id = ? AND is_active = 1",
      zoneInput.data,
      input.cleaner_id,
    ) : null;
    if (zoneInput.data && !zone) return { error: "The selected delivery zone is no longer available." } as const;
    const distance = cleaner.latitude != null && cleaner.longitude != null && deliveryAddress.latitude != null && deliveryAddress.longitude != null
      ? distanceKm({ latitude: Number(cleaner.latitude), longitude: Number(cleaner.longitude) }, { latitude: Number(deliveryAddress.latitude), longitude: Number(deliveryAddress.longitude) })
      : null;
    if (zone?.radius_km != null && distance != null && distance > Number(zone.radius_km)) return { error: `The delivery address is outside ${zone.name}.` } as const;
    const deliveryPricing: DeliveryPricing = zone ? {
      name: zone.name, pricingType: zone.pricing_type, baseFee: Number(zone.base_fee), perKmFee: Number(zone.per_km_fee),
      minimumFee: Number(zone.minimum_fee), maximumFee: zone.maximum_fee == null ? null : Number(zone.maximum_fee), distanceKm: distance,
    } : {
      name: "Standard delivery", pricingType: cleaner.delivery_pricing_type, baseFee: Number(cleaner.base_delivery_fee),
      perKmFee: Number(cleaner.delivery_fee_per_km), distanceKm: distance,
    };
    let pricing;
    try {
      pricing = calculateOrderPricing({
        items: currentSelected,
        delivery: deliveryPricing,
        platformFee: PLATFORM_FEE,
        minimumOrderAmount: Number(cleaner.minimum_order_amount),
        freeDeliveryThreshold: cleaner.free_delivery_threshold == null ? null : Number(cleaner.free_delivery_threshold),
      });
    } catch {
      return { error: "One or more quantities do not match the service pricing rules." } as const;
    }
    if (!pricing.meetsMinimum) return { error: `This cleaner has a minimum service order of NGN ${Number(cleaner.minimum_order_amount).toLocaleString("en-NG")}.` } as const;
    const voucher = input.voucher_code ? await validateVoucherForOrder({
      cleanerId: input.cleaner_id,
      userId: user.id,
      subtotal: pricing.serviceTotal,
      code: input.voucher_code,
    }) : null;
    if (voucher && !voucher.valid) return { error: voucher.message } as const;
    const voucherDiscountAmount = voucher?.valid ? voucher.discount : 0;
    const finalTotal = Math.max(0, Math.round((pricing.total - voucherDiscountAmount) * 100) / 100);
    const orderNumber = generateOrderNumber();
    const confirmedAt = input.payment_method === "pay_on_pickup" ? now() : null;
    const bookingExpiresAt = confirmedAt ? null : reservationExpiry(Number(cleaner.booking_hold_minutes)).replace("T", " ").replace("Z", "");
    const result = await run(
      `INSERT INTO orders
       (customer_id, cleaner_id, pickup_address, delivery_address, pickup_date, pickup_time_window, delivery_date, delivery_time_window,
        status, subtotal, discount_amount, express_fee, special_treatment_fee, delivery_fee, platform_fee, total, payment_status,
        pricing_status, pricing_confirmed_at, estimated_total, delivery_pricing_snapshot, pickup_notes, delivery_notes, notes,
        order_number, booking_expires_at, confirmed_at, payment_method, is_express, voucher_discount_amount, voucher_code,
        quoted_total, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      input.cleaner_id,
      pickupAddress.label,
      deliveryAddress.label,
      input.pickup_date,
      input.pickup_time_window,
      input.delivery_date ?? null,
      input.delivery_time_window ?? null,
      pricing.subtotal,
      pricing.discountAmount,
      pricing.expressFee,
      pricing.specialTreatmentFee,
      pricing.deliveryFee,
      PLATFORM_FEE,
      finalTotal,
      pricing.pricingStatus,
      pricing.pricingStatus === "final" ? now() : null,
      finalTotal,
      JSON.stringify({ ...deliveryPricing, calculatedFee: pricing.deliveryFee }),
      input.pickup_notes ?? null,
      input.delivery_notes ?? null,
      input.notes ?? null,
      orderNumber,
      bookingExpiresAt,
      confirmedAt,
      input.payment_method,
      isExpress ? 1 : 0,
      voucherDiscountAmount,
      voucher?.valid ? voucher.code : null,
      finalTotal,
      now(),
      now(),
    );
    const id = Number(result.lastInsertRowid);
    for (const [index, item] of currentSelected.entries()) {
      const line = pricing.lines[index];
      await run(
        `INSERT INTO order_items
          (order_id, service_id, quantity, price, service_name, category_snapshot, unit, estimated_quantity, confirmed_quantity,
           base_subtotal, discount_amount, express_fee, special_treatment_fee, line_total, bulk_discount_rules, pricing_snapshot,
           requires_final_confirmation, pricing_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        item.service.id,
        item.quantity,
        item.service.price,
        item.service.name,
        item.service.category,
        item.service.unit,
        item.quantity,
        line.requiresFinalConfirmation ? null : item.quantity,
        line.baseSubtotal,
        line.discountAmount,
        line.expressFee,
        line.specialTreatmentFee,
        line.lineTotal,
        JSON.stringify(item.service.discounts ?? []),
        JSON.stringify({
          minimum_quantity: item.service.minimum_quantity,
          quantity_step: item.service.quantity_step,
          express_selected: item.express,
          express_fee_type: item.service.express_fee_type,
          express_fee_value: item.service.express_fee_value,
          special_treatment_selected: item.specialTreatment,
          special_treatment_fee: item.service.special_treatment_fee,
          price_version: item.service.price_version,
        }),
        line.requiresFinalConfirmation ? 1 : 0,
        line.requiresFinalConfirmation ? "estimate" : "final",
        now(),
        now(),
      );
    }
    for (const attachment of attachments) {
      await run(
        `INSERT INTO order_attachments (order_id, customer_id, filename, media_type, size, sha256, contents, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        user.id,
        attachment.filename,
        attachment.mediaType,
        attachment.size,
        attachment.sha256,
        attachment.contents,
        now(),
      );
    }
    if (cleaner.auto_accept_orders) {
      const timestamp = now();
      await run("UPDATE orders SET status='accepted', accepted_at=?, updated_at=? WHERE id=? AND status='pending'", timestamp, timestamp, id);
      await activity(id, cleaner.user_id, "order_auto_accepted", "Order automatically accepted under the vendor's capacity rules.");
    }
    await run(
      `INSERT INTO payments (order_id, customer_id, amount, provider, reference, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      id,
      user.id,
      finalTotal,
      input.payment_method,
      `${orderNumber}-PAY`,
      JSON.stringify({ paymentMethod: input.payment_method }),
      now(),
      now(),
    );
    if (voucher?.valid) {
      await run(
        "INSERT INTO voucher_redemptions (voucher_id, user_id, order_id, discount_amount, created_at) VALUES (?, ?, ?, ?, ?)",
        voucher.voucherId,
        user.id,
        id,
        voucher.discount,
        now(),
      );
      await run("UPDATE vouchers SET times_used = times_used + 1, updated_at = ? WHERE id = ?", now(), voucher.voucherId);
    }
    await activity(id, user.id, "order_created", `Order ${orderNumber} was created by ${user.name} and sent to ${cleaner.business_name}.`, { total: finalTotal, pricingStatus: pricing.pricingStatus });
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
    return { id, orderNumber } as const;
  });
  if ("error" in created) redirect(pathWithParams(returnTo, { error: created.error }));
  redirect(`/orders/${created.id}?success=Booking+${encodeURIComponent(created.orderNumber)}+confirmed`);
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

export async function confirmOrderPricingAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "order.pricing_confirm", roles: VENDOR_ROLES });
  const { order_id: orderId } = parseFormOrRedirect(confirmPricingSchema, formData, "/cleaner/dashboard", "Choose a valid order.");
  const cleanerId = await cleanerIdForUser(user.id);
  const order = await one<{ id: number; cleaner_id: number; customer_id: number | null; status: string; payment_status: string; delivery_fee: number; platform_fee: number; pricing_status: string; total: number; voucher_discount_amount: number }>(
    "SELECT id, cleaner_id, customer_id, status, payment_status, delivery_fee, platform_fee, pricing_status, total, voucher_discount_amount FROM orders WHERE id = ?",
    orderId,
  );
  if (!order || order.cleaner_id !== cleanerId) {
    await writeAuditLog({ actorUserId: user.id, action: "order.pricing_confirm", targetType: "order", targetId: orderId, outcome: "denied", metadata: { reason: "ownership" }, context });
    redirect(`/orders/${orderId}?error=Order+access+denied`);
  }
  if (!["accepted", "picked_up", "in_cleaning"].includes(order.status) || order.payment_status === "paid") {
    redirect(`/orders/${orderId}?error=Pricing+can+only+be+confirmed+after+acceptance+and+before+payment`);
  }
  const items = await all<{
    id: number; service_id: number; service_name: string; category_snapshot: string; unit: string; quantity: number; price: number;
    estimated_quantity: number; requires_final_confirmation: number; bulk_discount_rules: string; pricing_snapshot: string;
  }>("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", orderId);
  if (!items.some((item) => item.requires_final_confirmation)) redirect(`/orders/${orderId}?error=This+order+does+not+need+quantity+confirmation`);

  const updates: Array<{ id: number; quantity: number; line: ReturnType<typeof calculatePricingLine> }> = [];
  try {
    for (const item of items) {
      const snapshot = JSON.parse(item.pricing_snapshot || "{}") as {
        minimum_quantity?: number; quantity_step?: number; express_selected?: boolean; express_fee_type?: string;
        express_fee_value?: number; special_treatment_selected?: boolean; special_treatment_fee?: number; price_version?: number;
      };
      const discounts = JSON.parse(item.bulk_discount_rules || "[]") as BulkDiscount[];
      const submittedQuantity = item.requires_final_confirmation ? parseServiceQuantity(formData.get(`confirmed_${item.id}`)) : Number(item.quantity);
      if (submittedQuantity == null || submittedQuantity <= 0) throw new Error("invalid quantity");
      const service: PriceableService = {
        id: item.service_id, name: item.service_name, category: item.category_snapshot, price: Number(item.price), unit: item.unit,
        minimum_quantity: Number(snapshot.minimum_quantity ?? 1), quantity_step: Number(snapshot.quantity_step ?? 1),
        express_available: Boolean(snapshot.express_selected), express_fee_type: snapshot.express_fee_type ?? "fixed",
        express_fee_value: Number(snapshot.express_fee_value ?? 0), special_treatment_available: Boolean(snapshot.special_treatment_selected),
        special_treatment_fee: Number(snapshot.special_treatment_fee ?? 0), requires_final_confirmation: false,
        price_version: Number(snapshot.price_version ?? 1), discounts,
      };
      updates.push({ id: item.id, quantity: submittedQuantity, line: calculatePricingLine({ service, quantity: submittedQuantity, express: Boolean(snapshot.express_selected), specialTreatment: Boolean(snapshot.special_treatment_selected) }) });
    }
  } catch {
    redirect(`/orders/${orderId}?error=Enter+valid+confirmed+quantities+using+the+saved+service+increments`);
  }

  const subtotal = updates.reduce((sum, item) => sum + item.line.baseSubtotal, 0);
  const discountAmount = updates.reduce((sum, item) => sum + item.line.discountAmount, 0);
  const expressFee = updates.reduce((sum, item) => sum + item.line.expressFee, 0);
  const specialTreatmentFee = updates.reduce((sum, item) => sum + item.line.specialTreatmentFee, 0);
  const voucherDiscountAmount = Math.min(Number(order.voucher_discount_amount || 0), subtotal);
  const total = Math.max(0, subtotal - discountAmount + expressFee + specialTreatmentFee + Number(order.delivery_fee) + Number(order.platform_fee) - voucherDiscountAmount);

  const proposalPayload = JSON.stringify({ updates, subtotal, discountAmount, expressFee, specialTreatmentFee, voucherDiscountAmount, total });
  const outcome = await transaction(async () => {
    const current = await one<{ pricing_status: string; payment_status: string }>("SELECT pricing_status, payment_status FROM orders WHERE id = ? AND cleaner_id = ?", orderId, cleanerId!);
    if (!current || current.pricing_status !== "estimate" || current.payment_status === "paid") return "stale" as const;
    if (total > Number(order.total)) {
      const pending = await one<{ id: number }>("SELECT id FROM order_price_adjustments WHERE order_id = ? AND status = 'pending'", orderId);
      if (pending) return "pending" as const;
      const adjustment = await run(`INSERT INTO order_price_adjustments (order_id, proposed_by_user_id, previous_total, proposed_total, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        orderId, user.id, order.total, total, "Final collected weight or garment count changed the estimated order total.", now());
      await run("UPDATE orders SET pending_pricing_snapshot = ?, updated_at = ? WHERE id = ?", proposalPayload, now(), orderId);
      await activity(orderId, user.id, "pricing_confirmation_requested", `${user.name} measured the collected laundry and requested approval for the revised total.`, { previousTotal: order.total, proposedTotal: total });
      if (order.customer_id) await notify(order.customer_id, "Approve revised laundry total", `The final measured total is NGN ${total.toLocaleString("en-NG")}. Review it before processing continues.`, "pricing_confirmation_requested", { order_id: orderId, adjustment_id: Number(adjustment.lastInsertRowid) });
      await writeAuditLog({ actorUserId: user.id, action: "order.pricing_confirm", targetType: "order", targetId: orderId, outcome: "succeeded", metadata: { proposedTotal: total, approvalRequired: true }, context });
      return "approval" as const;
    }
    for (const update of updates) {
      await run(`UPDATE order_items SET quantity = ?, confirmed_quantity = ?, base_subtotal = ?, discount_amount = ?, express_fee = ?, special_treatment_fee = ?, line_total = ?, pricing_status = 'final', updated_at = ? WHERE id = ? AND order_id = ?`,
        update.quantity, update.quantity, update.line.baseSubtotal, update.line.discountAmount, update.line.expressFee,
        update.line.specialTreatmentFee, update.line.lineTotal, now(), update.id, orderId);
    }
    await run(`UPDATE orders SET subtotal = ?, discount_amount = ?, express_fee = ?, special_treatment_fee = ?, voucher_discount_amount = ?, total = ?, pricing_status = 'final', pricing_confirmed_at = ?, updated_at = ? WHERE id = ? AND pricing_status = 'estimate'`,
      subtotal, discountAmount, expressFee, specialTreatmentFee, voucherDiscountAmount, total, now(), now(), orderId);
    await run("UPDATE payments SET amount = ?, updated_at = ? WHERE order_id = ? AND status = 'pending'", total, now(), orderId);
    await activity(orderId, user.id, "pricing_confirmed", `${user.name} confirmed the final collected quantities and order total.`, { total, previousStatus: "estimate" });
    if (order.customer_id) await notify(order.customer_id, "Order total confirmed", `Your collected laundry was measured and the final total is NGN ${total.toLocaleString("en-NG")}.`, "pricing_confirmed", { order_id: orderId, total });
    await writeAuditLog({ actorUserId: user.id, action: "order.pricing_confirm", targetType: "order", targetId: orderId, outcome: "succeeded", metadata: { total, itemCount: updates.length }, context });
    return "final" as const;
  });
  revalidatePath(`/orders/${orderId}`);
  if (outcome === "approval" || outcome === "pending") redirect(`/orders/${orderId}?success=Revised+total+sent+to+the+customer+for+approval`);
  if (outcome === "stale") redirect(`/orders/${orderId}?error=Pricing+was+already+confirmed+or+changed`);
  redirect(`/orders/${orderId}?success=Final+quantities+and+total+confirmed`);
}

export async function respondToPricingAdjustmentAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "order.pricing_respond", roles: "CUSTOMER" });
  const input = parseFormOrRedirect(pricingResponseSchema, formData, "/customer/orders", "Choose a valid pricing response.");
  const adjustment = await one<{ id: number; order_id: number; proposed_total: number; status: string; customer_id: number; pending_pricing_snapshot: string | null }>(
    `SELECT a.id, a.order_id, a.proposed_total, a.status, o.customer_id, o.pending_pricing_snapshot
     FROM order_price_adjustments a JOIN orders o ON o.id = a.order_id WHERE a.id = ?`,
    input.adjustment_id,
  );
  if (!adjustment || adjustment.customer_id !== user.id || adjustment.status !== "pending") {
    await writeAuditLog({ actorUserId: user.id, action: "order.pricing_respond", targetType: "order_price_adjustment", targetId: input.adjustment_id, outcome: "denied", metadata: { reason: "ownership_or_state" }, context });
    redirect("/customer/orders?error=Pricing+request+is+not+available");
  }
  await transaction(async () => {
    const changed = await run("UPDATE order_price_adjustments SET status = ?, responded_by_user_id = ?, responded_at = ? WHERE id = ? AND status = 'pending'", input.decision, user.id, now(), adjustment.id);
    if (!changed.changes) return;
    if (input.decision === "accepted") {
      const payload = JSON.parse(adjustment.pending_pricing_snapshot || "{}") as {
        updates?: Array<{ id: number; quantity: number; line: ReturnType<typeof calculatePricingLine> }>;
        subtotal?: number; discountAmount?: number; expressFee?: number; specialTreatmentFee?: number; voucherDiscountAmount?: number; total?: number;
      };
      if (!payload.updates?.length || Number(payload.total) !== Number(adjustment.proposed_total)) throw new Error("Invalid pending pricing snapshot.");
      const finalSubtotal = Number(payload.subtotal);
      const finalDiscount = Number(payload.discountAmount);
      const finalExpressFee = Number(payload.expressFee);
      const finalTreatmentFee = Number(payload.specialTreatmentFee);
      const finalTotal = Number(payload.total);
      for (const update of payload.updates) {
        await run(`UPDATE order_items SET quantity = ?, confirmed_quantity = ?, base_subtotal = ?, discount_amount = ?, express_fee = ?, special_treatment_fee = ?, line_total = ?, pricing_status = 'final', updated_at = ? WHERE id = ? AND order_id = ?`,
          Number(update.quantity), Number(update.quantity), Number(update.line.baseSubtotal), Number(update.line.discountAmount), Number(update.line.expressFee),
          Number(update.line.specialTreatmentFee), Number(update.line.lineTotal), now(), Number(update.id), adjustment.order_id);
      }
      await run(`UPDATE orders SET subtotal = ?, discount_amount = ?, express_fee = ?, special_treatment_fee = ?, voucher_discount_amount = ?, total = ?, pricing_status = 'final', pricing_confirmed_at = ?, pending_pricing_snapshot = NULL, updated_at = ? WHERE id = ? AND customer_id = ?`,
        finalSubtotal, finalDiscount, finalExpressFee, finalTreatmentFee, payload.voucherDiscountAmount ?? 0, finalTotal, now(), now(), adjustment.order_id, user.id);
      await run("UPDATE payments SET amount = ?, updated_at = ? WHERE order_id = ? AND status = 'pending'", finalTotal, now(), adjustment.order_id);
    } else {
      await run("UPDATE orders SET pending_pricing_snapshot = NULL, updated_at = ? WHERE id = ? AND customer_id = ?", now(), adjustment.order_id, user.id);
    }
    await activity(adjustment.order_id, user.id, `pricing_${input.decision}`, `${user.name} ${input.decision === "accepted" ? "approved" : "declined"} the revised order total.`, { proposedTotal: adjustment.proposed_total });
    await writeAuditLog({ actorUserId: user.id, action: "order.pricing_respond", targetType: "order_price_adjustment", targetId: adjustment.id, outcome: "succeeded", metadata: { decision: input.decision }, context });
  });
  revalidatePath(`/orders/${adjustment.order_id}`);
  redirect(`/orders/${adjustment.order_id}?success=${input.decision === "accepted" ? "Revised+total+approved" : "Revised+total+declined"}`);
}

export async function cancelOrderAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "order.cancel",
    roles: "CUSTOMER",
    rateLimit: { limit: 10, windowSeconds: 60 },
  });
  const input = parseFormOrRedirect(cancelOrderSchema, formData, "/customer/orders", "Enter a valid cancellation reason.");
  const order = await one<{ id: number; customer_id: number; cleaner_id: number; cleaner_user_id: number | null; status: string; pickup_date: string | null; payment_status: string }>(
    `SELECT o.id, o.customer_id, o.cleaner_id, o.status, o.pickup_date, o.payment_status, c.user_id AS cleaner_user_id
     FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.id = ?`,
    input.order_id,
  );
  const decision = order ? customerCancellationDecision({ status: order.status, pickupDate: order.pickup_date, paymentStatus: order.payment_status }) : null;
  if (!order || order.customer_id !== user.id || !decision?.allowed) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "order.cancel",
      targetType: "order",
      targetId: input.order_id,
      outcome: "denied",
      metadata: { reason: !order || order.customer_id !== user.id ? "ownership" : decision?.reason ?? "not_allowed" },
      context,
    });
    redirect(`/orders/${input.order_id}?error=${encodeURIComponent(decision?.reason ?? "This order cannot be cancelled")}`);
  }

  const cancelled = await transaction(async () => {
    const changed = await run(
      "UPDATE orders SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ? AND customer_id = ? AND status = ?",
      now(),
      input.reason,
      now(),
      order.id,
      user.id,
      order.status,
    );
    if (!changed.changes) return false;
    const redemption = await one<{ voucher_id: number }>("SELECT voucher_id FROM voucher_redemptions WHERE order_id = ?", order.id);
    if (redemption) {
      await run("DELETE FROM voucher_redemptions WHERE order_id = ?", order.id);
      await run("UPDATE vouchers SET times_used = MAX(0, times_used - 1), updated_at = ? WHERE id = ?", now(), redemption.voucher_id);
    }
    await run("UPDATE payments SET status = CASE WHEN status = 'pending' THEN 'failed' ELSE status END, updated_at = ? WHERE order_id = ?", now(), order.id);
    await activity(order.id, user.id, "order_cancelled", `${user.name} cancelled the order.`, { reason: input.reason, previousStatus: order.status });
    if (order.cleaner_user_id) await notify(order.cleaner_user_id, "Order cancelled", `${user.name} cancelled order #${order.id}.`, "order_cancelled", { order_id: order.id });
    await writeAuditLog({ actorUserId: user.id, action: "order.cancel", targetType: "order", targetId: order.id, outcome: "succeeded", metadata: { previousStatus: order.status }, context });
    return true;
  });
  if (!cancelled) redirect(`/orders/${order.id}?error=The+order+changed+before+it+could+be+cancelled`);
  revalidatePath("/customer/orders");
  redirect(`/orders/${order.id}?success=Order+cancelled`);
}

export async function rescheduleOrderAction(formData: FormData) {
  const { user, context } = await authorizeAction({ action: "order.reschedule", roles: "CUSTOMER" });
  const input = parseFormOrRedirect(rescheduleOrderSchema, formData, "/customer/dashboard", "Choose a valid schedule.");
  const order = await one<{ id: number; customer_id: number; cleaner_id: number; cleaner_user_id: number | null; status: string; is_express: number; daily_order_capacity: number; express_daily_capacity: number; minimum_lead_hours: number; express_turnaround_hours: number; booking_hold_minutes: number }>(
    `SELECT o.id, o.customer_id, o.cleaner_id, o.status, o.is_express, c.user_id AS cleaner_user_id,
       c.daily_order_capacity, c.express_daily_capacity, c.minimum_lead_hours, c.express_turnaround_hours, c.booking_hold_minutes
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
  if (!pickupMeetsLeadTime(input.pickup_date, Number(order.minimum_lead_hours))) {
    redirect(`/orders/${input.order_id}?error=This+pickup+does+not+meet+the+vendor+lead+time`);
  }
  const serviceTimes = await all<{ turnaround_time: string | null; express_selected: number }>(
    `SELECT s.turnaround_time, CASE WHEN json_extract(oi.pricing_snapshot, '$.express_selected') = 1 THEN 1 ELSE 0 END AS express_selected
     FROM order_items oi JOIN services s ON s.id = oi.service_id WHERE oi.order_id = ?`,
    order.id,
  );
  const requiredTurnaround = Math.max(...serviceTimes.map((item) => selectedTurnaroundHours(
    [{ turnaround_time: item.turnaround_time }],
    Boolean(item.express_selected),
    Number(order.express_turnaround_hours),
  )));
  const earliestDelivery = earliestDeliveryDate(input.pickup_date, requiredTurnaround);
  if (!input.delivery_date || input.delivery_date < earliestDelivery) {
    redirect(`/orders/${input.order_id}?error=${encodeURIComponent(`The earliest delivery date is ${earliestDelivery}`)}`);
  }

  const rescheduled = await transaction(async () => {
    const available = await slotAvailability(order, input.pickup_date, Boolean(order.is_express), order.id);
    if (!available.some((slot) => slot.window === input.pickup_time_window && slot.available)) return false;
    const changed = await run(
      "UPDATE orders SET pickup_date = ?, pickup_time_window = ?, delivery_date = ?, delivery_time_window = ?, updated_at = ? WHERE id = ? AND customer_id = ? AND status IN ('pending', 'accepted')",
      input.pickup_date,
      input.pickup_time_window,
      input.delivery_date ?? null,
      input.delivery_time_window ?? null,
      now(),
      input.order_id,
      user.id,
    );
    if (!changed.changes) return false;
    await activity(input.order_id, user.id, "schedule_updated", `Pickup rescheduled for ${input.pickup_date} during ${input.pickup_time_window}.`);
    if (order.cleaner_user_id) {
      await notify(order.cleaner_user_id, "Order rescheduled", `${user.name} updated the pickup schedule.`, "schedule_updated", { order_id: input.order_id });
    }
    await writeAuditLog({ actorUserId: user.id, action: "order.reschedule", targetType: "order", targetId: input.order_id, outcome: "succeeded", context });
    return true;
  });
  if (!rescheduled) redirect(`/orders/${input.order_id}?error=That+pickup+slot+is+no+longer+available`);
  redirect(`/orders/${input.order_id}?success=Schedule+updated`);
}

export async function reorderOrderAction(formData: FormData) {
  const { user, context } = await authorizeAction({
    action: "order.reorder",
    roles: "CUSTOMER",
    rateLimit: { limit: 20, windowSeconds: 60 },
    returnTo: "/customer/orders",
  });
  const { order_id: orderId } = parseFormOrRedirect(reorderSchema, formData, "/customer/orders", "Choose a valid order.");
  const order = await one<{ id: number; cleaner_id: number; status: string }>(
    "SELECT id, cleaner_id, status FROM orders WHERE id = ? AND customer_id = ?",
    orderId,
    user.id,
  );
  if (!order) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "order.reorder",
      targetType: "order",
      targetId: orderId,
      outcome: "denied",
      metadata: { reason: "ownership" },
      context,
    });
    redirect("/customer/orders?error=Order+access+denied");
  }
  if (!["completed", "cancelled"].includes(order.status)) {
    redirect(`/orders/${order.id}?error=Only+completed+or+cancelled+orders+can+be+reordered`);
  }

  const eligibility = await getVendorEligibility(order.cleaner_id);
  const availableItems = await one<{ count: number }>(
    `SELECT COUNT(1) AS count
     FROM order_items oi
     JOIN services s ON s.id = oi.service_id
     WHERE oi.order_id = ? AND s.cleaner_id = ? AND s.is_active = 1 AND s.price > 0 AND s.price <= 10000000`,
    order.id,
    order.cleaner_id,
  );
  if (!eligibility?.bookable || !Number(availableItems?.count ?? 0)) {
    redirect(`/orders/${order.id}?error=This+order+cannot+be+rebooked+because+the+cleaner+or+services+are+unavailable`);
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "order.reorder",
    targetType: "order",
    targetId: order.id,
    outcome: "succeeded",
    metadata: { cleanerId: order.cleaner_id },
    context,
  });
  redirect(`/orders/new?cleaner=${order.cleaner_id}&reorder=${order.id}`);
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
