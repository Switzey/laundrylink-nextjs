import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { appConfig, developmentPhoneCode, twilioPhoneVerificationConfigured } from "@/lib/env";
import { logError, logWarning } from "@/lib/logger";

function developmentSid(phone: string) {
  return `development-${createHmac("sha256", appConfig.auditSalt).update(phone).digest("hex")}`;
}

function developmentCodeMatches(code: string, expected: string) {
  const received = Buffer.from(code);
  const target = Buffer.from(expected);
  return received.length === target.length && timingSafeEqual(received, target);
}

async function twilioRequest(path: string, body: URLSearchParams) {
  if (!twilioPhoneVerificationConfigured()) return null;
  const credentials = Buffer.from(
    `${appConfig.phone.twilioAccountSid}:${appConfig.phone.twilioAuthToken}`,
  ).toString("base64");
  try {
    return await fetch(
      `https://verify.twilio.com/v2/Services/${appConfig.phone.twilioVerifyServiceSid}/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        cache: "no-store",
      },
    );
  } catch (error) {
    logError("auth.phone_provider_error", error);
    return null;
  }
}

export async function sendPhoneVerification(phone: string) {
  if (developmentPhoneCode()) return { sid: developmentSid(phone) };
  const response = await twilioRequest("Verifications", new URLSearchParams({ To: phone, Channel: "sms" }));
  if (!response?.ok) {
    logWarning("auth.phone_send_failed", { status: response?.status ?? 0 });
    return null;
  }
  const payload = await response.json() as { sid?: string; status?: string };
  return payload.status === "pending" && payload.sid ? { sid: payload.sid } : null;
}

export async function checkPhoneVerification(phone: string, code: string) {
  const testCode = developmentPhoneCode();
  if (testCode) {
    return { approved: developmentCodeMatches(code, testCode), sid: developmentSid(phone) };
  }
  const response = await twilioRequest(
    "VerificationCheck",
    new URLSearchParams({ To: phone, Code: code }),
  );
  if (!response?.ok) {
    logWarning("auth.phone_check_failed", { status: response?.status ?? 0 });
    return { approved: false, sid: null };
  }
  const payload = await response.json() as { sid?: string; status?: string };
  return { approved: payload.status === "approved", sid: payload.sid ?? null };
}
