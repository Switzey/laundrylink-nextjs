import "server-only";

import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getRequestSecurityContext } from "@/lib/request-security";
import type { Role } from "@/lib/types";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function securityError(message: string, status: 401 | 403) {
  return NextResponse.json({ error: message }, { status, headers: PRIVATE_NO_STORE });
}

export function apiInternalError(error: unknown, event: string) {
  logError(event, error);
  return NextResponse.json(
    { error: "The request could not be completed." },
    { status: 500, headers: PRIVATE_NO_STORE },
  );
}

export async function authorizeApiRequest(action: string, roles?: Role | Role[]) {
  const context = await getRequestSecurityContext();
  const user = await getCurrentUser();
  if (!user) {
    return { response: securityError("Unauthorized", 401) } as const;
  }

  const allowedRoles = roles ? (Array.isArray(roles) ? roles : [roles]) : null;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    await writeAuditLog({
      actorUserId: user.id,
      action,
      outcome: "denied",
      metadata: { reason: "role_mismatch", role: user.role },
      context,
    });
    return { response: securityError("Forbidden", 403) } as const;
  }

  try {
    await enforceRateLimit(action, `user:${user.id}`, { limit: 60, windowSeconds: 60 }, context);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        response: NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              ...PRIVATE_NO_STORE,
              "Retry-After": String(error.retryAfterSeconds),
            },
          },
        ),
      } as const;
    }
    throw error;
  }

  return { user, context } as const;
}
