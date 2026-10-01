import "server-only";

import { appConfig, phoneVerificationConfigured } from "@/lib/env";
import { logError, logWarning } from "@/lib/logger";

export function isE164Phone(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

async function twilioRequest(path: string, body: URLSearchParams) {
  if (!phoneVerificationConfigured()) return null;
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
  const response = await twilioRequest("Verifications", new URLSearchParams({ To: phone, Channel: "sms" }));
  if (!response?.ok) {
    logWarning("auth.phone_send_failed", { status: response?.status ?? 0 });
    return false;
  }
  const payload = await response.json() as { status?: string };
  return payload.status === "pending";
}

export async function checkPhoneVerification(phone: string, code: string) {
  const response = await twilioRequest(
    "VerificationCheck",
    new URLSearchParams({ To: phone, Code: code }),
  );
  if (!response?.ok) {
    logWarning("auth.phone_check_failed", { status: response?.status ?? 0 });
    return false;
  }
  const payload = await response.json() as { status?: string };
  return payload.status === "approved";
}
