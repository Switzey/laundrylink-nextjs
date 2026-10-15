import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";
export {
  boundedMoney,
  emailAddress,
  isoDate,
  optionalTextField,
  positiveId,
  strongPassword,
  textField,
} from "@/lib/validation-fields";

export function parseForm<T>(schema: z.ZodType<T>, formData: FormData): T {
  return schema.parse(Object.fromEntries(formData.entries()));
}

export function validationErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof z.ZodError)) return fallback;
  return error.issues[0]?.message || fallback;
}

export function boundedSearchTerm(value: string | undefined, maximum = 100) {
  return String(value ?? "").trim().slice(0, maximum);
}

export function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export function parseFormOrRedirect<T>(
  schema: z.ZodType<T>,
  formData: FormData,
  path: string,
  fallback: string,
) {
  try {
    return parseForm(schema, formData);
  } catch (error) {
    const separator = path.includes("?") ? "&" : "?";
    redirect(`${path}${separator}error=${encodeURIComponent(validationErrorMessage(error, fallback))}`);
  }
}
