import "server-only";

import { appConfig, emailDeliveryConfigured } from "@/lib/env";
import { logError, logWarning } from "@/lib/logger";

type AuthEmailKind = "verify" | "reset";

export async function sendAuthEmail(
  kind: AuthEmailKind,
  recipient: { email: string; name: string },
  token: string,
) {
  if (!emailDeliveryConfigured()) {
    logWarning("auth.email_unavailable", { kind });
    return false;
  }

  const path = kind === "verify" ? "/api/auth/verify-email" : "/reset-password";
  const link = `${appConfig.origin}${path}?token=${encodeURIComponent(token)}`;
  const subject = kind === "verify" ? "Verify your LaundryLink email" : "Reset your LaundryLink password";
  const intro = kind === "verify"
    ? "Confirm your email address to finish setting up your LaundryLink account."
    : "Use this secure link to choose a new LaundryLink password.";
  const expiry = kind === "verify" ? "24 hours" : "30 minutes";
  const text = `Hello ${recipient.name},\n\n${intro}\n\n${link}\n\nThis link expires in ${expiry}. If you did not request this, you can ignore this email.`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appConfig.email.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `laundrylink-${kind}-${token.slice(0, 24)}`,
      },
      body: JSON.stringify({
        from: appConfig.email.from,
        to: [recipient.email],
        subject,
        text,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      logWarning("auth.email_rejected", { kind, status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    logError("auth.email_error", error, { kind });
    return false;
  }
}
