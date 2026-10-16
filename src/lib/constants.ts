export const TIME_WINDOWS = ["8am - 10am", "10am - 12pm", "12pm - 2pm", "2pm - 4pm", "4pm - 6pm"] as const;
export const DELIVERY_FEE = 1500;
export const PLATFORM_FEE = 500;

export const STATUS_FLOW: Record<string, string[]> = {
  pending: ["accepted", "rejected", "cancelled"],
  accepted: ["picked_up"],
  picked_up: ["in_cleaning"],
  in_cleaning: ["ready"],
  ready: ["out_for_delivery"],
  out_for_delivery: ["completed"],
};

