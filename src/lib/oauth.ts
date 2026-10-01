import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash } from "bcryptjs";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { createSessionOnResponse, destinationForUser, normalizeRole } from "@/lib/auth";
import { authPath, sanitizeReturnTo } from "@/lib/auth-intent";
import { now, one, run, transaction } from "@/lib/db";
import { appConfig, oauthProviderConfigured } from "@/lib/env";
import { logError, logWarning } from "@/lib/logger";
import type { User } from "@/lib/types";

export type OAuthProvider = "google" | "apple";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function randomValue() {
  return randomBytes(32).toString("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieName(provider: OAuthProvider, value: "state" | "verifier" | "nonce" | "return") {
  const prefix = appConfig.isProduction ? "__Host-" : "";
  return `${prefix}laundrylink_oauth_${provider}_${value}`;
}

function temporaryCookieOptions(provider: OAuthProvider) {
  return {
    httpOnly: true,
    secure: !appConfig.isDevelopment,
    sameSite: provider === "apple" && !appConfig.isDevelopment ? "none" as const : "lax" as const,
    path: "/",
    maxAge: 600,
    priority: "high" as const,
  };
}

function redirectUri(provider: OAuthProvider) {
  return `${appConfig.origin}/api/auth/oauth/${provider}/callback`;
}

function providerCredentials(provider: OAuthProvider) {
  return provider === "google"
    ? { clientId: appConfig.oauth.googleClientId!, clientSecret: appConfig.oauth.googleClientSecret! }
    : { clientId: appConfig.oauth.appleClientId!, clientSecret: appConfig.oauth.appleClientSecret! };
}

export function startOAuth(provider: OAuthProvider, request: NextRequest) {
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  if (!oauthProviderConfigured(provider)) {
    return NextResponse.redirect(new URL(authPath("/login", returnTo, {
      error: `${provider === "google" ? "Google" : "Apple"} sign-in is temporarily unavailable.`,
    }), request.url));
  }

  const state = randomValue();
  const verifier = randomValue();
  const nonce = randomValue();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { clientId } = providerCredentials(provider);
  const authorizationUrl = new URL(
    provider === "google"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://appleid.apple.com/auth/authorize",
  );
  const params: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri(provider),
    response_type: provider === "apple" ? "code id_token" : "code",
    scope: provider === "apple" ? "name email" : "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  };
  if (provider === "apple") params.response_mode = "form_post";
  else params.prompt = "select_account";
  for (const [key, value] of Object.entries(params)) authorizationUrl.searchParams.set(key, value);

  const response = NextResponse.redirect(authorizationUrl);
  const options = temporaryCookieOptions(provider);
  response.cookies.set(cookieName(provider, "state"), state, options);
  response.cookies.set(cookieName(provider, "verifier"), verifier, options);
  response.cookies.set(cookieName(provider, "nonce"), nonce, options);
  response.cookies.set(cookieName(provider, "return"), returnTo ?? "", options);
  return response;
}

async function callbackValues(request: NextRequest) {
  if (request.method === "POST") {
    const form = await request.formData();
    return {
      code: String(form.get("code") ?? ""),
      state: String(form.get("state") ?? ""),
      error: String(form.get("error") ?? ""),
      idToken: String(form.get("id_token") ?? ""),
      appleUser: String(form.get("user") ?? ""),
    };
  }
  return {
    code: request.nextUrl.searchParams.get("code") ?? "",
    state: request.nextUrl.searchParams.get("state") ?? "",
    error: request.nextUrl.searchParams.get("error") ?? "",
    idToken: request.nextUrl.searchParams.get("id_token") ?? "",
    appleUser: request.nextUrl.searchParams.get("user") ?? "",
  };
}

function clearTemporaryCookies(provider: OAuthProvider, response: NextResponse) {
  for (const value of ["state", "verifier", "nonce", "return"] as const) {
    response.cookies.delete(cookieName(provider, value));
  }
}

function callbackFailure(provider: OAuthProvider, request: NextRequest, message: string) {
  const returnTo = sanitizeReturnTo(request.cookies.get(cookieName(provider, "return"))?.value);
  const response = NextResponse.redirect(
    new URL(authPath("/login", returnTo, { error: message }), request.url),
    { status: 303 },
  );
  clearTemporaryCookies(provider, response);
  return response;
}

async function exchangeCode(provider: OAuthProvider, code: string, verifier: string) {
  const { clientId, clientSecret } = providerCredentials(provider);
  const response = await fetch(
    provider === "google" ? "https://oauth2.googleapis.com/token" : "https://appleid.apple.com/auth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(provider),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    let providerError = "unknown_error";
    try {
      const payload = await response.json() as { error?: unknown };
      if (typeof payload.error === "string" && /^[a-z0-9_.-]{1,64}$/i.test(payload.error)) {
        providerError = payload.error;
      }
    } catch {
      // The status and a bounded provider error code are sufficient for diagnostics.
    }
    throw new Error(`OAuth token exchange failed with status ${response.status} (${providerError}).`);
  }
  return response.json() as Promise<{ id_token?: string }>;
}

async function verifyIdentityToken(provider: OAuthProvider, token: string, nonce: string) {
  const { clientId } = providerCredentials(provider);
  const result = await jwtVerify(token, provider === "google" ? GOOGLE_JWKS : APPLE_JWKS, {
    issuer: provider === "google" ? ["https://accounts.google.com", "accounts.google.com"] : "https://appleid.apple.com",
    audience: clientId,
    maxTokenAge: "10 minutes",
  });
  if (result.payload.nonce !== nonce) throw new Error("OAuth nonce validation failed.");
  return result.payload;
}

function appleName(value: string) {
  if (!value || value.length > 2000) return null;
  try {
    const parsed = JSON.parse(value) as { name?: { firstName?: string; lastName?: string } };
    const name = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ").trim();
    return name.slice(0, 100) || null;
  } catch {
    return null;
  }
}

function identityFromPayload(provider: OAuthProvider, payload: JWTPayload, appleUser: string) {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!payload.sub || !email || !verified) throw new Error("OAuth provider did not return a verified email identity.");
  const fallbackName = email.split("@")[0]?.slice(0, 100) || "LaundryLink member";
  const name = provider === "google" && typeof payload.name === "string"
    ? payload.name.trim().slice(0, 100)
    : appleName(appleUser);
  return { providerUserId: payload.sub, email, name: name || fallbackName };
}

export async function finishOAuth(provider: OAuthProvider, request: NextRequest) {
  if (!oauthProviderConfigured(provider)) return callbackFailure(provider, request, "This sign-in method is unavailable.");
  const values = await callbackValues(request);
  const expectedState = request.cookies.get(cookieName(provider, "state"))?.value ?? "";
  const verifier = request.cookies.get(cookieName(provider, "verifier"))?.value ?? "";
  const nonce = request.cookies.get(cookieName(provider, "nonce"))?.value ?? "";
  const returnTo = sanitizeReturnTo(request.cookies.get(cookieName(provider, "return"))?.value);

  if (values.error) return callbackFailure(provider, request, "Sign-in was cancelled.");
  if (!values.code || !expectedState || !safeEqual(values.state, expectedState) || !verifier || !nonce) {
    logWarning("auth.oauth_state_rejected", { provider });
    return callbackFailure(provider, request, "The sign-in request expired. Please try again.");
  }

  try {
    const tokenSet = await exchangeCode(provider, values.code, verifier);
    const idToken = tokenSet.id_token || values.idToken;
    if (!idToken) throw new Error("OAuth identity token was missing.");
    const payload = await verifyIdentityToken(provider, idToken, nonce);
    const identity = identityFromPayload(provider, payload, values.appleUser);
    const passwordHash = await hash(randomBytes(32).toString("base64url"), appConfig.bcryptCost);
    const userId = await transaction(async () => {
      const linked = await one<{ user_id: number }>(
        "SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?",
        provider,
        identity.providerUserId,
      );
      let id = linked?.user_id ?? (await one<{ id: number }>(
        "SELECT id FROM users WHERE lower(email) = ?",
        identity.email,
      ))?.id;

      if (!id) {
        const timestamp = now();
        const result = await run(
          `INSERT INTO users (name, email, email_verified_at, password, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'CUSTOMER', ?, ?)`,
          identity.name,
          identity.email,
          timestamp,
          passwordHash,
          timestamp,
          timestamp,
        );
        id = Number(result.lastInsertRowid);
      } else {
        await run(
          "UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?",
          now(),
          now(),
          id,
        );
      }

      await run(
        `INSERT OR IGNORE INTO oauth_accounts
          (user_id, provider, provider_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        id,
        provider,
        identity.providerUserId,
        now(),
        now(),
      );
      await writeAuditLog({
        actorUserId: id,
        action: "auth.oauth_login",
        outcome: "succeeded",
        metadata: { provider },
      });
      return id;
    });

    const account = await one<Omit<User, "role"> & { role: string }>(
      `SELECT id, name, email, role, phone, address, email_verified_at, phone_verified_at
       FROM users WHERE id = ?`,
      userId,
    );
    if (!account) throw new Error("OAuth account was not found after sign-in.");
    const user: User = { ...account, role: normalizeRole(account.role) };
    const response = NextResponse.redirect(new URL(destinationForUser(user, returnTo), request.url), { status: 303 });
    clearTemporaryCookies(provider, response);
    await createSessionOnResponse(userId, response);
    return response;
  } catch (error) {
    logError("auth.oauth_callback_error", error, { provider });
    return callbackFailure(provider, request, "We could not complete that sign-in. Please try again.");
  }
}
