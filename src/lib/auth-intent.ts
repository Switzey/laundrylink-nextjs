const RETURN_TO_LIMIT = 2048;
const APP_BASE = "https://laundrylink.invalid";
const AUTH_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-phone",
];
const unsafeControlCharacters = /[\u0000-\u001F\u007F]/;

export function sanitizeReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > RETURN_TO_LIMIT || unsafeControlCharacters.test(candidate)) return null;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return null;

  try {
    const parsed = new URL(candidate, APP_BASE);
    if (parsed.origin !== APP_BASE || parsed.username || parsed.password) return null;
    if (parsed.pathname.startsWith("/api/") || parsed.pathname.startsWith("/_next/")) return null;
    if (AUTH_PATHS.some((path) => parsed.pathname === path)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function returnToOr(value: unknown, fallback: string) {
  return sanitizeReturnTo(value) ?? fallback;
}

export function pathWithParams(
  path: string,
  params: Record<string, string | null | undefined>,
) {
  const [pathname, existingQuery = ""] = path.split("?", 2);
  const search = new URLSearchParams(existingQuery);
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
    else search.delete(key);
  }
  const query = search.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export function authPath(
  path: string,
  returnTo: unknown,
  params: Record<string, string | null | undefined> = {},
) {
  return pathWithParams(path, { ...params, returnTo: sanitizeReturnTo(returnTo) });
}
