import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { appConfig } from "@/lib/env";

function encryptionKey() {
  if (appConfig.payoutEncryptionKey) return Buffer.from(appConfig.payoutEncryptionKey, "base64");
  if (appConfig.isDevelopment) {
    return createHash("sha256").update(`${appConfig.auditSalt}:development-sensitive-data`).digest();
  }
  throw new Error("Sensitive data encryption is not configured.");
}

export function encryptSensitiveValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSensitiveValue(value: string) {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unsupported encrypted value.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function maskSensitiveValue(value: string | null, visible = 4) {
  if (!value) return "Not provided";
  const plaintext = decryptSensitiveValue(value);
  return `${"•".repeat(Math.max(4, plaintext.length - visible))}${plaintext.slice(-visible)}`;
}
