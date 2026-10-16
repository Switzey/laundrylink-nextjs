export const SERVICE_CATEGORIES = [
  "Washing",
  "Dry cleaning",
  "Ironing",
  "Bedding",
  "Household fabrics",
  "Specialist services",
  "Premium care",
  "Commercial laundry",
] as const;

export const PRICING_UNITS = ["per_item", "per_kg", "per_bag", "per_pair", "per_set", "flat_rate"] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];
export type FeeType = "fixed" | "percentage";

export type BulkDiscount = {
  minimum_quantity: number;
  discount_type: FeeType;
  discount_value: number;
};

export type PriceableService = {
  id: number;
  name: string;
  category: string;
  price: number;
  unit: string;
  minimum_quantity: number;
  quantity_step: number;
  express_available: number | boolean;
  express_fee_type: string;
  express_fee_value: number;
  special_treatment_available: number | boolean;
  special_treatment_fee: number;
  requires_final_confirmation: number | boolean;
  price_version: number;
  discounts?: BulkDiscount[];
};

export type SelectedService = {
  service: PriceableService;
  quantity: number;
  express?: boolean;
  specialTreatment?: boolean;
};

export type DeliveryPricing = {
  name?: string;
  pricingType: "fixed" | "distance" | "free";
  baseFee: number;
  perKmFee?: number;
  minimumFee?: number;
  maximumFee?: number | null;
  distanceKm?: number | null;
};

export type PricingLine = {
  serviceId: number;
  serviceName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  baseSubtotal: number;
  discountAmount: number;
  expressFee: number;
  specialTreatmentFee: number;
  lineTotal: number;
  requiresFinalConfirmation: boolean;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function discountFor(quantity: number, baseSubtotal: number, discounts: BulkDiscount[] = []) {
  const eligible = discounts
    .filter((discount) => quantity >= Number(discount.minimum_quantity))
    .sort((a, b) => Number(b.minimum_quantity) - Number(a.minimum_quantity))[0];
  if (!eligible) return 0;
  const raw = eligible.discount_type === "percentage"
    ? baseSubtotal * Number(eligible.discount_value) / 100
    : Number(eligible.discount_value);
  return roundMoney(Math.min(baseSubtotal, Math.max(0, raw)));
}

export function quantityIsValid(service: Pick<PriceableService, "minimum_quantity" | "quantity_step">, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) return false;
  const minimum = Number(service.minimum_quantity || 1);
  const step = Number(service.quantity_step || 1);
  if (quantity < minimum || step <= 0) return false;
  const steps = (quantity - minimum) / step;
  return Math.abs(steps - Math.round(steps)) < 0.000001;
}

export function calculatePricingLine(input: SelectedService): PricingLine {
  const { service, quantity } = input;
  if (!quantityIsValid(service, quantity)) throw new Error(`Invalid quantity for ${service.name}.`);
  const baseSubtotal = roundMoney(Number(service.price) * quantity);
  const discountAmount = discountFor(quantity, baseSubtotal, service.discounts);
  const expressFee = input.express && service.express_available
    ? roundMoney(service.express_fee_type === "percentage"
      ? baseSubtotal * Number(service.express_fee_value) / 100
      : Number(service.express_fee_value))
    : 0;
  const specialTreatmentFee = input.specialTreatment && service.special_treatment_available
    ? roundMoney(Number(service.special_treatment_fee) * quantity)
    : 0;
  return {
    serviceId: service.id,
    serviceName: service.name,
    quantity,
    unit: service.unit,
    unitPrice: Number(service.price),
    baseSubtotal,
    discountAmount,
    expressFee,
    specialTreatmentFee,
    lineTotal: roundMoney(baseSubtotal - discountAmount + expressFee + specialTreatmentFee),
    requiresFinalConfirmation: Boolean(service.requires_final_confirmation),
  };
}

export function calculateDeliveryFee(delivery: DeliveryPricing) {
  if (delivery.pricingType === "free") return 0;
  let fee = Number(delivery.baseFee || 0);
  if (delivery.pricingType === "distance" && delivery.distanceKm != null) {
    fee += Number(delivery.perKmFee || 0) * Math.max(0, delivery.distanceKm);
  }
  fee = Math.max(fee, Number(delivery.minimumFee || 0));
  if (delivery.maximumFee != null) fee = Math.min(fee, Number(delivery.maximumFee));
  return roundMoney(fee);
}

export function calculateOrderPricing({
  items,
  delivery,
  platformFee,
  minimumOrderAmount = 0,
  freeDeliveryThreshold = null,
}: {
  items: SelectedService[];
  delivery: DeliveryPricing;
  platformFee: number;
  minimumOrderAmount?: number;
  freeDeliveryThreshold?: number | null;
}) {
  const lines = items.map(calculatePricingLine);
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.baseSubtotal, 0));
  const discountAmount = roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0));
  const expressFee = roundMoney(lines.reduce((sum, line) => sum + line.expressFee, 0));
  const specialTreatmentFee = roundMoney(lines.reduce((sum, line) => sum + line.specialTreatmentFee, 0));
  const serviceTotal = roundMoney(subtotal - discountAmount + expressFee + specialTreatmentFee);
  const meetsMinimum = serviceTotal >= Number(minimumOrderAmount || 0);
  const deliveryFee = freeDeliveryThreshold != null && serviceTotal >= Number(freeDeliveryThreshold)
    ? 0
    : calculateDeliveryFee(delivery);
  const total = roundMoney(serviceTotal + deliveryFee + Number(platformFee));
  return {
    lines,
    subtotal,
    discountAmount,
    expressFee,
    specialTreatmentFee,
    serviceTotal,
    deliveryFee,
    platformFee: Number(platformFee),
    minimumOrderAmount: Number(minimumOrderAmount || 0),
    meetsMinimum,
    total,
    pricingStatus: lines.some((line) => line.requiresFinalConfirmation) ? "estimate" as const : "final" as const,
  };
}

export function distanceKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}
