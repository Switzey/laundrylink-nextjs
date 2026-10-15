import { ADMIN_ROLES, type Role } from "@/lib/types";

export function roleIsAllowed(role: Role, allowed?: Role | readonly Role[]) {
  if (!allowed) return true;
  return (Array.isArray(allowed) ? allowed : [allowed]).includes(role);
}

export function canAccessVendorFile(input: {
  kind: string;
  publicProfile: boolean;
  fileCleanerId: number;
  requesterCleanerId: number | null;
  requesterRole: Role | null;
}) {
  if (input.publicProfile && (input.kind === "logo" || input.kind === "cover")) return true;
  if (!input.requesterRole) return false;
  return input.requesterCleanerId === input.fileCleanerId || ADMIN_ROLES.includes(input.requesterRole);
}
