import type { Role } from "@/lib/types";

export const STAFF_RESPONSIBILITIES = ["manager", "receptionist", "cleaner", "quality_inspector", "dispatcher"] as const;
export const PRODUCTION_STAGES = ["received", "washing", "drying", "ironing", "inspection", "packaging", "ready"] as const;
export type StaffResponsibility = (typeof STAFF_RESPONSIBILITIES)[number];
export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

const stagePermissions: Record<StaffResponsibility, ProductionStage[]> = {
  manager: PRODUCTION_STAGES.slice(),
  receptionist: ["received"],
  cleaner: ["received", "washing", "drying", "ironing", "packaging"],
  quality_inspector: ["inspection", "packaging", "ready"],
  dispatcher: ["received", "ready"],
};

export function canManageVendor(role: Role) {
  return role === "VENDOR_OWNER" || role === "VENDOR_MANAGER";
}

export function canUpdateProductionStage(role: Role, responsibility: string | null, stage: ProductionStage) {
  if (canManageVendor(role)) return true;
  return STAFF_RESPONSIBILITIES.includes(responsibility as StaffResponsibility)
    && stagePermissions[responsibility as StaffResponsibility].includes(stage);
}

export function canAdvanceProductionStage(current: ProductionStage, next: ProductionStage) {
  const currentIndex = PRODUCTION_STAGES.indexOf(current);
  const nextIndex = PRODUCTION_STAGES.indexOf(next);
  return nextIndex === currentIndex || nextIndex === currentIndex + 1;
}

export function vendorNetRevenue(serviceRevenue: number, commissionRate: number, deductions = 0) {
  const commission = Math.round(serviceRevenue * commissionRate) / 100;
  return { commission, net: Math.max(0, serviceRevenue - commission - deductions) };
}
