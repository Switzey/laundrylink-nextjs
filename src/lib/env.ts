import "server-only";

import { z } from "zod";

const appEnvironmentSchema = z.enum(["development", "staging", "production"]);

function inferredEnvironment() {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "staging";
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

const appEnvironment = appEnvironmentSchema.parse(
  process.env.APP_ENV || inferredEnvironment(),
);

function integerFromEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

const trustedOrigins = [
  process.env.APP_ORIGIN,
  ...(process.env.TRUSTED_ORIGINS ?? "").split(","),
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
]
  .map((origin) => origin?.trim().replace(/\/$/, ""))
  .filter((origin): origin is string => Boolean(origin));

const auditSalt = process.env.AUDIT_LOG_SALT?.trim();
if (appEnvironment !== "development" && !auditSalt) {
  throw new Error("AUDIT_LOG_SALT is required outside development.");
}

export const appConfig = Object.freeze({
  environment: appEnvironment,
  isProduction: appEnvironment === "production",
  isDevelopment: appEnvironment === "development",
  origin: process.env.APP_ORIGIN?.trim().replace(/\/$/, "") || null,
  trustedOrigins: new Set(trustedOrigins),
  auditSalt: auditSalt || "laundrylink-development-only-salt",
  bcryptCost: integerFromEnv("BCRYPT_COST", 12, 12, 14),
  sessionDays: integerFromEnv("SESSION_DAYS", 7, 1, 30),
  sessionCookieName:
    process.env.SESSION_COOKIE_NAME?.trim() ||
    (appEnvironment === "production" ? "__Host-laundrylink_session" : "laundrylink_session"),
  logLevel: process.env.LOG_LEVEL === "debug" ? "debug" : "info",
});

export function hostedDatabaseConfig() {
  const url = process.env.TURSO_DATABASE_URL?.trim() || undefined;
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
  const hostedRuntime = Boolean(process.env.VERCEL) || appEnvironment !== "development";

  if (hostedRuntime && !url) {
    throw new Error("TURSO_DATABASE_URL is required in hosted environments.");
  }
  if (url?.startsWith("libsql:") && !authToken) {
    throw new Error("TURSO_AUTH_TOKEN is required for a hosted libSQL database.");
  }

  return { url, authToken };
}
