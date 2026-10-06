import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";
import { now, run } from "@/lib/db";

export type VendorFileKind = "logo" | "cover" | "identity_document" | "business_document";

type FileRule = { mediaTypes: string[]; maximum: number };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const RULES: Record<VendorFileKind, FileRule> = {
  logo: { mediaTypes: IMAGE_TYPES, maximum: 2 * 1024 * 1024 },
  cover: { mediaTypes: IMAGE_TYPES, maximum: 4 * 1024 * 1024 },
  identity_document: { mediaTypes: [...IMAGE_TYPES, "application/pdf"], maximum: 5 * 1024 * 1024 },
  business_document: { mediaTypes: [...IMAGE_TYPES, "application/pdf"], maximum: 5 * 1024 * 1024 },
};

export type PreparedVendorFile = {
  kind: VendorFileKind;
  filename: string;
  mediaType: string;
  size: number;
  sha256: string;
  contents: Uint8Array;
};

function detectedMediaType(bytes: Uint8Array) {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

function safeFilename(filename: string) {
  const cleaned = path.basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120);
  return cleaned || "upload";
}

export async function prepareVendorFile(value: FormDataEntryValue | null, kind: VendorFileKind) {
  if (!(value instanceof File) || value.size === 0) return null;
  const rule = RULES[kind];
  if (value.size > rule.maximum) throw new Error(`${kind.replaceAll("_", " ")} is too large.`);
  const contents = new Uint8Array(await value.arrayBuffer());
  const mediaType = detectedMediaType(contents);
  if (!mediaType || !rule.mediaTypes.includes(mediaType) || value.type !== mediaType) {
    throw new Error(`${kind.replaceAll("_", " ")} must be a supported image${kind.includes("document") ? " or PDF" : ""}.`);
  }
  return {
    kind,
    filename: safeFilename(value.name),
    mediaType,
    size: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
    contents,
  } satisfies PreparedVendorFile;
}

export async function saveVendorFile(cleanerId: number, file: PreparedVendorFile) {
  const timestamp = now();
  await run(
    `INSERT INTO vendor_files
      (cleaner_id, kind, filename, media_type, size, sha256, contents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cleaner_id, kind) DO UPDATE SET
       filename = excluded.filename, media_type = excluded.media_type, size = excluded.size,
       sha256 = excluded.sha256, contents = excluded.contents, updated_at = excluded.updated_at`,
    cleanerId,
    file.kind,
    file.filename,
    file.mediaType,
    file.size,
    file.sha256,
    file.contents,
    timestamp,
    timestamp,
  );
}
