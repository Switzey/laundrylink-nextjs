import "server-only";

type LogFields = Record<string, boolean | number | string | null | undefined>;

function redact(value: string | undefined) {
  return value
    ?.replace(/libsql:\/\/[^\s]+/gi, "libsql://[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g, "[redacted-token]")
    .replace(/(password|secret|token|authorization)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[redacted]");
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) return { errorType: typeof error };
  return {
    errorName: error.name,
    errorMessage: redact(error.message.slice(0, 500)),
    stack: process.env.NODE_ENV === "development" ? redact(error.stack?.slice(0, 4000)) : undefined,
  };
}

function write(level: "info" | "warn" | "error", event: string, fields: LogFields = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    environment: process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
    ...fields,
  });

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export function logInfo(event: string, fields?: LogFields) {
  write("info", event, fields);
}

export function logWarning(event: string, fields?: LogFields) {
  write("warn", event, fields);
}

export function logError(event: string, error: unknown, fields?: LogFields) {
  write("error", event, { ...fields, ...errorDetails(error) });
}
