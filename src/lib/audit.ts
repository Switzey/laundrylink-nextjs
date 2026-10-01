import "server-only";

import { now, run } from "@/lib/db";
import { logInfo } from "@/lib/logger";
import { getRequestSecurityContext, type RequestSecurityContext } from "@/lib/request-security";

type AuditOutcome = "allowed" | "denied" | "failed" | "succeeded";

type AuditEvent = {
  actorUserId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | string | null;
  outcome: AuditOutcome;
  metadata?: Record<string, boolean | number | string | null>;
  context?: RequestSecurityContext;
};

export async function writeAuditLog(event: AuditEvent) {
  const context = event.context ?? await getRequestSecurityContext();
  const metadata = event.metadata ? JSON.stringify(event.metadata).slice(0, 4000) : null;

  await run(
    `INSERT INTO audit_logs
      (actor_user_id, action, target_type, target_id, outcome, request_id, ip_hash, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    event.actorUserId ?? null,
    event.action,
    event.targetType ?? null,
    event.targetId == null ? null : String(event.targetId),
    event.outcome,
    context.requestId,
    context.ipHash,
    metadata,
    now(),
  );

  logInfo("audit", {
    requestId: context.requestId,
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    targetType: event.targetType ?? null,
    targetId: event.targetId == null ? null : String(event.targetId),
    outcome: event.outcome,
  });
}
