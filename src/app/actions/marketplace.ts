"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { authorizePublicAction } from "@/lib/authorization";
import { now, run, transaction } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone-numbers";
import { emailAddress, optionalTextField, parseFormOrRedirect, textField } from "@/lib/validation";

const waitlistSchema = z.object({
  name: textField(2, 100),
  email: emailAddress,
  phone: optionalTextField(30).refine((value) => !value || Boolean(normalizePhoneNumber(value)), "Enter a valid international phone number."),
  audience: z.enum(["customer", "vendor"]),
  state: textField(2, 80),
  city: textField(2, 100),
  source: optionalTextField(80),
});

export async function joinWaitlistAction(formData: FormData) {
  const input = parseFormOrRedirect(waitlistSchema, formData, "/waitlist", "Enter valid waitlist details.");
  const context = await authorizePublicAction("waitlist.join", input.email, { limit: 3, windowSeconds: 3600 });
  const timestamp = now();
  await transaction(async () => {
    await run(
      `INSERT OR IGNORE INTO waitlist_leads
        (name, email, phone, audience, state, city, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.name,
      input.email,
      input.phone ? normalizePhoneNumber(input.phone) : null,
      input.audience,
      input.state,
      input.city,
      input.source ?? "public_waitlist",
      timestamp,
      timestamp,
    );
    await run(
      `UPDATE waitlist_leads SET name = ?, phone = ?, state = ?, source = ?, updated_at = ?
       WHERE lower(email) = lower(?) AND lower(city) = lower(?) AND audience = ?`,
      input.name,
      input.phone ? normalizePhoneNumber(input.phone) : null,
      input.state,
      input.source ?? "public_waitlist",
      timestamp,
      input.email,
      input.city,
      input.audience,
    );
    await writeAuditLog({
      action: "waitlist.join",
      targetType: "waitlist_lead",
      outcome: "succeeded",
      metadata: { audience: input.audience, state: input.state, city: input.city },
      context,
    });
  });
  revalidatePath("/waitlist");
  redirect("/waitlist?success=You%27re+on+the+list.+We%27ll+contact+you+when+LaundryLink+reaches+your+city.");
}
