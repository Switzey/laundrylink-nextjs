import { z } from "zod";
import { normalizePhoneNumber } from "@/lib/phone-numbers";
import { emailAddress, optionalTextField, strongPassword, textField } from "@/lib/validation-fields";

const normalizedPhone = z.string().trim().min(7).max(30)
  .refine((value) => Boolean(normalizePhoneNumber(value)), "Enter a valid international phone number.")
  .transform((value) => normalizePhoneNumber(value)!);

const optionalNormalizedPhone = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  normalizedPhone.optional(),
);

export const loginSchema = z.object({ email: emailAddress, password: z.string().min(1).max(128) });

export const registerSchema = z.object({
  name: textField(2, 100),
  email: emailAddress,
  password: strongPassword,
  confirm_password: z.string().min(1).max(128),
  role: z.enum(["CUSTOMER", "VENDOR_OWNER"]),
  phone: optionalNormalizedPhone,
  address: optionalTextField(250),
}).superRefine((input, context) => {
  if (input.password !== input.confirm_password) {
    context.addIssue({ code: "custom", path: ["confirm_password"], message: "The passwords do not match." });
  }
  if (input.role === "VENDOR_OWNER" && !input.phone) {
    context.addIssue({ code: "custom", path: ["phone"], message: "Enter a phone number in international format, such as +2348012345678." });
  }
});

export const emailSchema = z.object({ email: emailAddress });
export const resetPasswordSchema = z.object({
  token: z.string().min(40).max(100),
  password: strongPassword,
  confirm_password: z.string().min(1).max(128),
}).refine((input) => input.password === input.confirm_password, {
  path: ["confirm_password"],
  message: "The passwords do not match.",
});
export const phoneSchema = z.object({ phone: normalizedPhone });
export const phoneCodeSchema = z.object({ code: z.string().trim().regex(/^\d{4,10}$/, "Enter the verification code.") });
