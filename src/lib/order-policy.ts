import { DELIVERY_FEE, PLATFORM_FEE, STATUS_FLOW } from "@/lib/constants";

export function parseServiceQuantity(value: FormDataEntryValue | number | null | undefined) {
  if (value instanceof File) return null;
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) && quantity >= 0 && quantity <= 10000 && Math.round(quantity * 1000) === quantity * 1000 ? quantity : null;
}

export function calculateOrderTotals(
  items: ReadonlyArray<{ price: number; quantity: number }>,
  deliveryFee = DELIVERY_FEE,
  platformFee = PLATFORM_FEE,
) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  return { subtotal, deliveryFee, platformFee, total: subtotal + deliveryFee + platformFee };
}

export function canTransitionOrder(currentStatus: string, nextStatus: string) {
  return (STATUS_FLOW[currentStatus] ?? []).includes(nextStatus);
}

export function vendorCanManageOrder(orderCleanerId: number, actorCleanerId: number | null, vendorApproved: boolean) {
  return vendorApproved && actorCleanerId !== null && orderCleanerId === actorCleanerId;
}

export function customerOwnsOrder(orderCustomerId: number | null, actorUserId: number) {
  return orderCustomerId !== null && orderCustomerId === actorUserId;
}

export function customerCanRescheduleOrder(orderCustomerId: number | null, actorUserId: number, status: string) {
  return customerOwnsOrder(orderCustomerId, actorUserId) && ["pending", "accepted"].includes(status);
}

export function customerCanReviewOrder(orderCustomerId: number | null, actorUserId: number, status: string, hasReview: boolean) {
  return customerOwnsOrder(orderCustomerId, actorUserId) && status === "completed" && !hasReview;
}
