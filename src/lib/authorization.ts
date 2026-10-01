import "server-only";

import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit, type RateLimitRule } from "@/lib/rate-limit";
import { assertTrustedMutation, opaqueIdentifier } from "@/lib/request-security";
import type { Role, User } from "@/lib/types";

const DEFAULT_ACTION_LIMIT = { limit: 60, windowSeconds: 60 } satisfies RateLimitRule;

type ProtectedActionOptions = {
  action: string;
  roles?: Role | Role[];
  rateLimit?: RateLimitRule;
};

export async function authorizeAction(options: ProtectedActionOptions) {
  const context = await assertTrustedMutation();
  const user = await getCurrentUser();

  if (!user) {
    await writeAuditLog({ action: options.action, outcome: "denied", context });
    redirect("/login?error=Please+sign+in+to+continue");
  }

  const roles = options.roles
    ? (Array.isArray(options.roles) ? options.roles : [options.roles])
    : null;
  if (roles && !roles.includes(user.role)) {
    await writeAuditLog({
      actorUserId: user.id,
      action: options.action,
      outcome: "denied",
      metadata: { reason: "role_mismatch", role: user.role },
      context,
    });
    redirect("/dashboard");
  }

  await enforceRateLimit(options.action, `user:${user.id}`, options.rateLimit ?? DEFAULT_ACTION_LIMIT, context);
  return { user: user as User, context };
}

export async function authorizePublicAction(
  action: string,
  subject: string,
  rateLimit: RateLimitRule,
) {
  const context = await assertTrustedMutation();
  await enforceRateLimit(`${action}.subject`, opaqueIdentifier(subject.toLowerCase()), rateLimit, context);
  await enforceRateLimit(
    `${action}.ip`,
    "request-origin",
    { limit: rateLimit.limit * 4, windowSeconds: rateLimit.windowSeconds },
    context,
  );
  return context;
}
