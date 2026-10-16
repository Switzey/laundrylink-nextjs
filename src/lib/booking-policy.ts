export type VoucherTerms = {
  discountType: "fixed" | "percent";
  discountValue: number;
  maximumDiscount?: number | null;
  minimumSubtotal?: number;
};

export type CancellationDecision = {
  allowed: boolean;
  reason: string;
};

const MS_PER_DAY = 86_400_000;

function dateAtNoonUtc(date: string) {
  return new Date(`${date}T12:00:00.000Z`);
}

export function turnaroundHours(value: string | null | undefined, fallback = 48) {
  if (!value) return fallback;
  const matches = [...value.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (!matches.length) return fallback;
  const maximum = Math.max(...matches);
  if (/day/i.test(value)) return Math.ceil(maximum * 24);
  if (/week/i.test(value)) return Math.ceil(maximum * 24 * 7);
  return Math.ceil(maximum);
}

export function earliestDeliveryDate(pickupDate: string, hours: number) {
  const pickup = dateAtNoonUtc(pickupDate);
  if (Number.isNaN(pickup.getTime())) throw new Error("Invalid pickup date.");
  pickup.setUTCDate(pickup.getUTCDate() + Math.max(1, Math.ceil(hours / 24)));
  return pickup.toISOString().slice(0, 10);
}

export function selectedTurnaroundHours(
  services: Array<{ turnaround_time?: string | null }>,
  express: boolean,
  expressTurnaroundHours: number,
) {
  if (!services.length) return 48;
  if (express) return Math.max(1, expressTurnaroundHours);
  return Math.max(...services.map((service) => turnaroundHours(service.turnaround_time)));
}

export function pickupMeetsLeadTime(pickupDate: string, minimumLeadHours: number, reference = new Date()) {
  const pickup = dateAtNoonUtc(pickupDate);
  return pickup.getTime() - reference.getTime() >= Math.max(0, minimumLeadHours) * 60 * 60 * 1000;
}

export function slotHasCapacity(input: {
  dailyCount: number;
  windowCount: number;
  expressDailyCount: number;
  dailyCapacity: number;
  expressDailyCapacity: number;
  timeWindowCount: number;
  express: boolean;
}) {
  const perWindowCapacity = Math.max(1, Math.ceil(input.dailyCapacity / Math.max(1, input.timeWindowCount)));
  if (input.dailyCount >= input.dailyCapacity || input.windowCount >= perWindowCapacity) return false;
  return !input.express || input.expressDailyCount < input.expressDailyCapacity;
}

export function voucherDiscount(subtotal: number, terms: VoucherTerms) {
  if (!Number.isFinite(subtotal) || subtotal < Math.max(0, terms.minimumSubtotal ?? 0)) return 0;
  const raw = terms.discountType === "percent"
    ? subtotal * terms.discountValue / 100
    : terms.discountValue;
  const capped = terms.maximumDiscount == null ? raw : Math.min(raw, terms.maximumDiscount);
  return Math.round(Math.min(subtotal, Math.max(0, capped)) * 100) / 100;
}

export function customerCancellationDecision(input: {
  status: string;
  pickupDate: string | null;
  paymentStatus: string;
  reference?: Date;
}) : CancellationDecision {
  if (input.status === "pending") return { allowed: true, reason: "Pending orders can be cancelled before acceptance." };
  if (input.status !== "accepted") {
    return { allowed: false, reason: "This order is already being processed. Contact support for help." };
  }
  if (!input.pickupDate) return { allowed: false, reason: "The pickup schedule must be reviewed by support." };
  const pickup = dateAtNoonUtc(input.pickupDate);
  const reference = input.reference ?? new Date();
  if (pickup.getTime() - reference.getTime() < 4 * 60 * 60 * 1000) {
    return { allowed: false, reason: "Accepted orders cannot be cancelled within four hours of pickup." };
  }
  return {
    allowed: true,
    reason: input.paymentStatus === "paid"
      ? "Cancellation is allowed. Any refund remains subject to payment-provider processing."
      : "Cancellation is allowed before the pickup cutoff.",
  };
}

export function reservationExpiry(holdMinutes: number, reference = new Date()) {
  return new Date(reference.getTime() + Math.max(5, holdMinutes) * 60 * 1000).toISOString();
}

export function daysBetween(first: string, second: string) {
  return Math.round((dateAtNoonUtc(second).getTime() - dateAtNoonUtc(first).getTime()) / MS_PER_DAY);
}
