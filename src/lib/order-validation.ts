import { z } from "zod";
import { TIME_WINDOWS } from "@/lib/constants";
import { isoDate, optionalTextField, positiveId } from "@/lib/validation-fields";

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

function validateDeliverySchedule(
  input: { pickup_date: string; delivery_date?: string; delivery_time_window?: string },
  context: z.RefinementCtx,
) {
  if (input.delivery_date && input.delivery_date < input.pickup_date) {
    context.addIssue({ code: "custom", path: ["delivery_date"], message: "Delivery cannot be before pickup." });
  }
  if (input.delivery_time_window && !input.delivery_date) {
    context.addIssue({ code: "custom", path: ["delivery_date"], message: "Choose a delivery date with the delivery window." });
  }
}

export const createOrderSchema = z.object({
  cleaner_id: positiveId,
  ...scheduleFields,
  pickup_address_id: optionalNonnegativeId,
  delivery_address_id: optionalNonnegativeId,
  pickup_address: optionalTextField(250),
  delivery_address: optionalTextField(250),
  pickup_notes: optionalTextField(1000),
  delivery_notes: optionalTextField(1000),
  notes: optionalTextField(1000),
}).superRefine(validateDeliverySchedule);

export const orderStatusSchema = z.object({
  order_id: positiveId,
  status: z.enum(["accepted", "picked_up", "in_cleaning", "ready", "out_for_delivery", "completed", "cancelled"]),
});

export const rescheduleOrderSchema = z.object({ order_id: positiveId, ...scheduleFields })
  .superRefine(validateDeliverySchedule);

export const reviewSchema = z.object({
  order_id: positiveId,
  rating: z.coerce.number().int().min(1).max(5),
  comment: optionalTextField(1000),
});
