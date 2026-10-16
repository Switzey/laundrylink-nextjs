import "server-only";

import { createHash } from "node:crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 4;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PreparedOrderAttachment = {
  filename: string;
  mediaType: string;
  size: number;
  sha256: string;
  contents: Uint8Array;
};

function safeFilename(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 180);
  return cleaned || "garment-photo";
}

function hasValidSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (type === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

export async function prepareOrderAttachments(values: FormDataEntryValue[]) {
  const files = values.filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length > MAX_FILES) throw new Error(`Upload no more than ${MAX_FILES} photos.`);
  const prepared: PreparedOrderAttachment[] = [];
  for (const file of files) {
    if (!allowedTypes.has(file.type) || file.size > MAX_FILE_SIZE) {
      throw new Error("Photos must be JPEG, PNG, or WebP files no larger than 5 MB each.");
    }
    const contents = new Uint8Array(await file.arrayBuffer());
    if (!hasValidSignature(file.type, contents)) throw new Error("One of the uploaded photos is not a valid image file.");
    prepared.push({
      filename: safeFilename(file.name),
      mediaType: file.type,
      size: file.size,
      sha256: createHash("sha256").update(contents).digest("hex"),
      contents,
    });
  }
  return prepared;
}
