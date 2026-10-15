import { z } from "zod";

const unsafeControlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function textField(minimum: number, maximum: number) {
  return z.string().trim().min(minimum).max(maximum).refine(
    (value) => !unsafeControlCharacters.test(value),
    "The value contains unsupported characters.",
  );
}

export function optionalTextField(maximum: number) {
  return z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    textField(1, maximum).optional(),
  );
}

export const positiveId = z.coerce.number().int().positive();
export const boundedMoney = z.coerce.number().finite().positive().max(10_000_000);
export const emailAddress = z.string().trim().toLowerCase().email().max(254);
export const strongPassword = z.string().min(12).max(128);
export const isoDate = z.string().date();
