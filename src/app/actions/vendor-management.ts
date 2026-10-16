"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/authorization";
import { cleanerIdForUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { now, one, run, transaction } from "@/lib/db";
import { canAdvanceProductionStage, canManageVendor, canUpdateProductionStage, PRODUCTION_STAGES, STAFF_RESPONSIBILITIES, type ProductionStage } from "@/lib/vendor-operations";
import { VENDOR_ROLES } from "@/lib/types";

const id = z.coerce.number().int().positive();
const shortText = z.string().trim().min(2).max(160);
const redirectWith = (path: string, key: "error" | "success", message: string): never => redirect(`${path}?${key}=${encodeURIComponent(message)}`);

async function vendorContext(action: string, management = false) {
  const authorized = await authorizeAction({ action, roles: VENDOR_ROLES, rateLimit: { limit: 30, windowSeconds: 60 } });
  const cleanerId = await cleanerIdForUser(authorized.user.id);
  if (!cleanerId || (management && !canManageVendor(authorized.user.role))) redirect("/cleaner/dashboard");
  const staff = await one<{ responsibility: string; is_active: number }>(
    "SELECT responsibility, is_active FROM vendor_staff_profiles WHERE cleaner_id = ? AND user_id = ?",
    cleanerId, authorized.user.id,
  );
  return { ...authorized, cleanerId, responsibility: staff?.is_active ? staff.responsibility : null };
}

async function auditSuccess(context: Awaited<ReturnType<typeof vendorContext>>, action: string, targetType: string, targetId: number) {
  await writeAuditLog({ actorUserId: context.user.id, action, targetType, targetId, outcome: "succeeded", context: context.context });
}

export async function updateOperationsSettingsAction(formData: FormData) {
  const context = await vendorContext("vendor.operations.update", true);
  const parsed = z.object({
    opening_hours: z.string().trim().min(3).max(500),
    daily_order_capacity: z.coerce.number().int().min(1).max(500),
    daily_weight_capacity: z.coerce.number().min(1).max(100000),
    express_daily_capacity: z.coerce.number().int().min(0).max(500),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data!.express_daily_capacity > parsed.data!.daily_order_capacity) redirectWith("/cleaner/operations", "error", "Enter valid operating limits.");
  await run(`UPDATE cleaners SET opening_hours=?, daily_order_capacity=?, daily_weight_capacity=?, express_daily_capacity=?, auto_accept_orders=?, is_available=?, updated_at=? WHERE id=?`,
    parsed.data!.opening_hours, parsed.data!.daily_order_capacity, parsed.data!.daily_weight_capacity, parsed.data!.express_daily_capacity,
    formData.get("auto_accept_orders") === "on" ? 1 : 0, formData.get("is_available") === "on" ? 1 : 0, now(), context.cleanerId);
  await auditSuccess(context, "vendor.operations.update", "cleaner", context.cleanerId);
  revalidatePath("/cleaner"); redirectWith("/cleaner/operations", "success", "Operating settings updated.");
}

export async function createClosureAction(formData: FormData) {
  const context = await vendorContext("vendor.closure.create", true);
  const parsed = z.object({ starts_at: z.string().min(10).max(30), ends_at: z.string().min(10).max(30), reason: shortText, branch_id: z.coerce.number().int().nonnegative() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data!.ends_at <= parsed.data!.starts_at) redirectWith("/cleaner/operations", "error", "Enter a valid closure period.");
  const branchId = parsed.data!.branch_id || null;
  if (branchId && !await one("SELECT id FROM vendor_branches WHERE id=? AND cleaner_id=?", branchId, context.cleanerId)) redirectWith("/cleaner/operations", "error", "Branch not found.");
  const result = await run("INSERT INTO vendor_closures (cleaner_id, branch_id, starts_at, ends_at, reason, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", context.cleanerId, branchId, parsed.data!.starts_at, parsed.data!.ends_at, parsed.data!.reason, context.user.id, now());
  await auditSuccess(context, "vendor.closure.create", "vendor_closure", Number(result.lastInsertRowid));
  revalidatePath("/cleaner/operations"); redirectWith("/cleaner/operations", "success", "Closure added.");
}

export async function decideVendorOrderAction(formData: FormData) {
  const context = await vendorContext("vendor.order.decision");
  if (!canManageVendor(context.user.role) && context.responsibility !== "receptionist") redirect("/cleaner/orders");
  const parsed = z.object({ order_id: id, decision: z.enum(["accepted", "rejected"]), reason: z.string().trim().max(500).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || (parsed.data!.decision === "rejected" && (parsed.data!.reason?.length ?? 0) < 5)) redirectWith("/cleaner/orders", "error", "A rejection reason is required.");
  const changed = await transaction(async () => {
    const order = await one<{ id: number; status: string }>("SELECT id, status FROM orders WHERE id=? AND cleaner_id=?", parsed.data!.order_id, context.cleanerId);
    if (!order || order.status !== "pending") return false;
    const timestamp = now();
    const result = parsed.data!.decision === "accepted"
      ? await run("UPDATE orders SET status='accepted', accepted_at=?, updated_at=? WHERE id=? AND status='pending'", timestamp, timestamp, order.id)
      : await run("UPDATE orders SET status='rejected', rejected_at=?, rejection_reason=?, updated_at=? WHERE id=? AND status='pending'", timestamp, parsed.data!.reason ?? null, timestamp, order.id);
    if (result.changes) await run("INSERT INTO order_activities (order_id,user_id,action,description,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", order.id, context.user.id, `order_${parsed.data!.decision}`, parsed.data!.decision === "accepted" ? "Vendor accepted the order." : "Vendor rejected the order.", JSON.stringify({ reason: parsed.data!.reason ?? null }), timestamp, timestamp);
    return result.changes > 0;
  });
  if (!changed) redirectWith("/cleaner/orders", "error", "This order is no longer awaiting a decision.");
  await auditSuccess(context, "vendor.order.decision", "order", parsed.data!.order_id);
  revalidatePath("/cleaner"); redirectWith("/cleaner/orders", "success", `Order ${parsed.data!.decision}.`);
}

export async function updateProductionStageAction(formData: FormData) {
  const context = await vendorContext("vendor.order.stage");
  const parsed = z.object({ order_id: id, stage: z.enum(PRODUCTION_STAGES), notes: z.string().trim().max(500).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !canUpdateProductionStage(context.user.role, context.responsibility, parsed.data!.stage)) redirect("/cleaner/orders");
  const order = await one<{ id: number; production_stage: ProductionStage; status: string }>("SELECT id, production_stage, status FROM orders WHERE id=? AND cleaner_id=?", parsed.data!.order_id, context.cleanerId);
  if (!order || ["cancelled", "rejected", "completed"].includes(order.status) || !canAdvanceProductionStage(order.production_stage, parsed.data!.stage)) redirectWith("/cleaner/orders", "error", "That production stage cannot be applied.");
  const verifiedOrder = order!;
  await transaction(async () => {
    const timestamp = now();
    const status = ["washing", "drying", "ironing", "inspection", "packaging"].includes(parsed.data!.stage) ? "in_cleaning" : parsed.data!.stage === "ready" ? "ready" : verifiedOrder.status;
    await run("UPDATE orders SET production_stage=?, stage_updated_at=?, status=?, updated_at=? WHERE id=? AND cleaner_id=?", parsed.data!.stage, timestamp, status, timestamp, verifiedOrder.id, context.cleanerId);
    await run("INSERT INTO order_stage_events (order_id,stage,user_id,notes,created_at) VALUES (?,?,?,?,?)", verifiedOrder.id, parsed.data!.stage, context.user.id, parsed.data!.notes ?? null, timestamp);
  });
  await auditSuccess(context, "vendor.order.stage", "order", verifiedOrder.id);
  revalidatePath("/cleaner/orders"); redirectWith("/cleaner/orders", "success", "Production stage updated.");
}

export async function assignOrderAction(formData: FormData) {
  const context = await vendorContext("vendor.order.assign", true);
  const parsed = z.object({ order_id: id, user_id: id }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWith("/cleaner/orders", "error", "Choose a valid team member.");
  const member = await one("SELECT id FROM vendor_memberships WHERE cleaner_id=? AND user_id=?", context.cleanerId, parsed.data!.user_id);
  const order = await one("SELECT id FROM orders WHERE id=? AND cleaner_id=?", parsed.data!.order_id, context.cleanerId);
  if (!member || !order) redirectWith("/cleaner/orders", "error", "Order or team member not found.");
  await run("UPDATE orders SET assigned_user_id=?, updated_at=? WHERE id=?", parsed.data!.user_id, now(), parsed.data!.order_id);
  await auditSuccess(context, "vendor.order.assign", "order", parsed.data!.order_id);
  revalidatePath("/cleaner/orders"); redirectWith("/cleaner/orders", "success", "Order assigned.");
}

export async function createBranchAction(formData: FormData) {
  const context = await vendorContext("vendor.branch.create", true);
  const parsed = z.object({ name: shortText, address: z.string().trim().min(5).max(250), city: shortText, phone: z.string().trim().max(30), opening_hours: z.string().trim().max(500), daily_order_capacity: z.coerce.number().int().min(1).max(500), daily_weight_capacity: z.coerce.number().min(1).max(100000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWith("/cleaner/team", "error", "Enter valid branch details.");
  const result = await run("INSERT INTO vendor_branches (cleaner_id,name,address,city,phone,opening_hours,daily_order_capacity,daily_weight_capacity,is_primary,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,0,1,?,?)", context.cleanerId, parsed.data!.name, parsed.data!.address, parsed.data!.city, parsed.data!.phone || null, parsed.data!.opening_hours || null, parsed.data!.daily_order_capacity, parsed.data!.daily_weight_capacity, now(), now());
  await auditSuccess(context, "vendor.branch.create", "vendor_branch", Number(result.lastInsertRowid));
  revalidatePath("/cleaner/team"); redirectWith("/cleaner/team", "success", "Branch created.");
}

export async function inviteVendorStaffAction(formData: FormData) {
  const context = await vendorContext("vendor.staff.invite", true);
  const parsed = z.object({ email: z.email().transform((value) => value.toLowerCase()), account_role: z.enum(["VENDOR_MANAGER", "VENDOR_STAFF"]), responsibility: z.enum(STAFF_RESPONSIBILITIES), branch_id: z.coerce.number().int().nonnegative() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWith("/cleaner/team", "error", "Enter a valid invitation.");
  if (parsed.data!.account_role === "VENDOR_MANAGER" && parsed.data!.responsibility !== "manager") redirectWith("/cleaner/team", "error", "Vendor managers need the manager responsibility.");
  const branchId = parsed.data!.branch_id || null;
  if (branchId && !await one("SELECT id FROM vendor_branches WHERE id=? AND cleaner_id=?", branchId, context.cleanerId)) redirectWith("/cleaner/team", "error", "Branch not found.");
  const timestamp = now();
  const result = await run("INSERT INTO vendor_invites (cleaner_id,email,account_role,responsibility,branch_id,invited_by_user_id,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending',datetime('now','+7 days'),?,?)", context.cleanerId, parsed.data!.email, parsed.data!.account_role, parsed.data!.responsibility, branchId, context.user.id, timestamp, timestamp);
  await auditSuccess(context, "vendor.staff.invite", "vendor_invite", Number(result.lastInsertRowid));
  revalidatePath("/cleaner/team"); redirectWith("/cleaner/team", "success", "Invitation recorded for secure delivery.");
}

export async function createMaintenanceAction(formData: FormData) {
  const context = await vendorContext("vendor.maintenance.create", true);
  const parsed = z.object({ equipment_name: shortText, status: z.enum(["scheduled", "in_progress", "completed", "out_of_service"]), scheduled_for: z.string().max(30).optional(), notes: z.string().trim().max(500).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWith("/cleaner/operations", "error", "Enter valid maintenance details.");
  const result = await run("INSERT INTO equipment_maintenance (cleaner_id,equipment_name,status,scheduled_for,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", context.cleanerId, parsed.data!.equipment_name, parsed.data!.status, parsed.data!.scheduled_for || null, parsed.data!.notes || null, now(), now());
  await auditSuccess(context, "vendor.maintenance.create", "equipment_maintenance", Number(result.lastInsertRowid));
  revalidatePath("/cleaner/operations"); redirectWith("/cleaner/operations", "success", "Maintenance item added.");
}

export async function createPromotionAction(formData: FormData) {
  const context = await vendorContext("vendor.promotion.create", true);
  const parsed = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/), discount_type: z.enum(["fixed", "percent"]), discount_value: z.coerce.number().positive().max(1000000), minimum_subtotal: z.coerce.number().min(0).max(100000000), usage_limit: z.coerce.number().int().min(1).max(100000), expires_at: z.string().max(30).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || (parsed.data!.discount_type === "percent" && parsed.data!.discount_value > 100)) redirectWith("/cleaner/growth", "error", "Enter a valid promotion.");
  const result = await run("INSERT INTO vouchers (code,cleaner_id,discount_type,discount_value,minimum_subtotal,expires_at,usage_limit,per_user_limit,times_used,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,0,1,?,?)", parsed.data!.code, context.cleanerId, parsed.data!.discount_type, parsed.data!.discount_value, parsed.data!.minimum_subtotal, parsed.data!.expires_at || null, parsed.data!.usage_limit, now(), now());
  await auditSuccess(context, "vendor.promotion.create", "voucher", Number(result.lastInsertRowid));
  revalidatePath("/cleaner/growth"); redirectWith("/cleaner/growth", "success", "Promotion created.");
}

export async function respondToReviewAction(formData: FormData) {
  const context = await vendorContext("vendor.review.respond", true);
  const parsed = z.object({ review_id: id, response: z.string().trim().min(3).max(1000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !await one("SELECT id FROM reviews WHERE id=? AND cleaner_id=?", parsed.data!.review_id, context.cleanerId)) redirectWith("/cleaner/growth", "error", "Review not found.");
  const timestamp = now();
  await run(`INSERT INTO review_responses (review_id,cleaner_id,user_id,response,created_at,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(review_id) DO UPDATE SET response=excluded.response,user_id=excluded.user_id,updated_at=excluded.updated_at`, parsed.data!.review_id, context.cleanerId, context.user.id, parsed.data!.response, timestamp, timestamp);
  await auditSuccess(context, "vendor.review.respond", "review", parsed.data!.review_id);
  revalidatePath("/cleaner/growth"); redirectWith("/cleaner/growth", "success", "Review response saved.");
}

export async function createStaffShiftAction(formData: FormData) {
  const context = await vendorContext("vendor.shift.create", true);
  const parsed = z.object({ user_id: id, branch_id: z.coerce.number().int().nonnegative(), starts_at: z.string().min(10).max(30), ends_at: z.string().min(10).max(30), notes: z.string().trim().max(500).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data!.ends_at <= parsed.data!.starts_at) redirectWith("/cleaner/team", "error", "Enter a valid shift.");
  if (!await one("SELECT id FROM vendor_memberships WHERE cleaner_id=? AND user_id=?", context.cleanerId, parsed.data!.user_id)) redirectWith("/cleaner/team", "error", "Team member not found.");
  const branchId = parsed.data!.branch_id || null;
  if (branchId && !await one("SELECT id FROM vendor_branches WHERE cleaner_id=? AND id=?", context.cleanerId, branchId)) redirectWith("/cleaner/team", "error", "Branch not found.");
  const result = await run("INSERT INTO staff_shifts (cleaner_id,user_id,branch_id,starts_at,ends_at,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", context.cleanerId, parsed.data!.user_id, branchId, parsed.data!.starts_at, parsed.data!.ends_at, parsed.data!.notes || null, now(), now());
  await auditSuccess(context, "vendor.shift.create", "staff_shift", Number(result.lastInsertRowid));
  revalidatePath("/cleaner/team"); redirectWith("/cleaner/team", "success", "Shift scheduled.");
}

export async function createGarmentRecordAction(formData: FormData) {
  const context = await vendorContext("vendor.garment.create");
  const parsed = z.object({ order_id: id, description: z.string().trim().min(2).max(250), quantity: z.coerce.number().int().min(1).max(1000), declared_value: z.coerce.number().min(0).max(100000000), condition_notes: z.string().trim().max(500).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !await one("SELECT id FROM orders WHERE id=? AND cleaner_id=?", parsed.data!.order_id, context.cleanerId)) redirectWith("/cleaner/orders", "error", "Enter a valid garment record.");
  const tag = `LL-${context.cleanerId}-${parsed.data!.order_id}-${Date.now().toString(36).toUpperCase()}`;
  const result = await run("INSERT INTO garment_records (order_id,tag_code,description,quantity,declared_value,condition_notes,stage,created_at,updated_at) VALUES (?,?,?,?,?,?,'received',?,?)", parsed.data!.order_id, tag, parsed.data!.description, parsed.data!.quantity, parsed.data!.declared_value || null, parsed.data!.condition_notes || null, now(), now());
  await auditSuccess(context, "vendor.garment.create", "garment_record", Number(result.lastInsertRowid));
  revalidatePath("/cleaner/orders"); redirectWith("/cleaner/orders", "success", `Garment tag ${tag} created.`);
}

export async function requestOrderResolutionAction(formData: FormData) {
  const context = await vendorContext("vendor.resolution.request", true);
  const parsed = z.object({ order_id: id, type: z.enum(["refund", "compensation", "amendment", "dispute"]), amount: z.coerce.number().min(0).max(100000000), reason: z.string().trim().min(10).max(1000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !await one("SELECT id FROM orders WHERE id=? AND cleaner_id=?", parsed.data!.order_id, context.cleanerId)) redirectWith("/cleaner/orders", "error", "Enter a valid resolution request.");
  const result = await run("INSERT INTO order_resolution_requests (order_id,requested_by_user_id,type,amount,reason,status,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?)", parsed.data!.order_id, context.user.id, parsed.data!.type, parsed.data!.amount || null, parsed.data!.reason, now(), now());
  await auditSuccess(context, "vendor.resolution.request", "order_resolution_request", Number(result.lastInsertRowid));
  revalidatePath("/cleaner/finance"); redirectWith("/cleaner/orders", "success", "Resolution request sent for authorized review.");
}

export async function configureBranchServiceAction(formData: FormData) {
  const context = await vendorContext("vendor.branch_service.update", true);
  const parsed = z.object({ branch_id: id, service_id: id, price_override: z.coerce.number().min(0).max(10000000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWith("/cleaner/team", "error", "Choose a valid branch service and price.");
  const branch = await one("SELECT id FROM vendor_branches WHERE id=? AND cleaner_id=?", parsed.data!.branch_id, context.cleanerId);
  const service = await one("SELECT id FROM services WHERE id=? AND cleaner_id=?", parsed.data!.service_id, context.cleanerId);
  if (!branch || !service) redirectWith("/cleaner/team", "error", "Branch or service not found.");
  const timestamp = now();
  await run(`INSERT INTO branch_services (branch_id,service_id,price_override,is_active,created_at,updated_at) VALUES (?,?,?,1,?,?)
    ON CONFLICT(branch_id,service_id) DO UPDATE SET price_override=excluded.price_override,is_active=1,updated_at=excluded.updated_at`, parsed.data!.branch_id, parsed.data!.service_id, parsed.data!.price_override || null, timestamp, timestamp);
  await auditSuccess(context, "vendor.branch_service.update", "vendor_branch", parsed.data!.branch_id);
  revalidatePath("/cleaner/team"); redirectWith("/cleaner/team", "success", "Branch service configured.");
}
