import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { appConfig } from "@/lib/env";

export type RequestSecurityContext = {
  requestId: string;
  ipHash: string;
  origin: string | null;
};

export class RequestSecurityError extends Error {
  constructor(message = "Request origin was not accepted.") {
    super(message);
    this.name = "RequestSecurityError";
  }
}

function digest(value: string) {
  return createHmac("sha256", appConfig.auditSalt).update(value).digest("hex");
}

export async function getRequestSecurityContext(): Promise<RequestSecurityContext> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = requestHeaders.get("x-real-ip")?.trim() || forwardedFor || "unknown";

  return {
    requestId: requestHeaders.get("x-vercel-id") || requestHeaders.get("x-request-id") || randomUUID(),
    ipHash: digest(address),
    origin: requestHeaders.get("origin"),
  };
}

export async function assertTrustedMutation() {
  const requestHeaders = await headers();
  const context = await getRequestSecurityContext();
  const origin = context.origin;

  if (!origin) {
    if (appConfig.isDevelopment) return context;
    throw new RequestSecurityError("A valid Origin header is required.");
  }

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    throw new RequestSecurityError();
  }

  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host")?.trim();
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (appConfig.isDevelopment ? "http" : "https");
  const requestOrigin = host ? `${protocol}://${host}` : null;

  if (normalizedOrigin !== requestOrigin && !appConfig.trustedOrigins.has(normalizedOrigin)) {
    throw new RequestSecurityError();
  }

  return context;
}

export function opaqueIdentifier(value: string) {
  return digest(value);
}
