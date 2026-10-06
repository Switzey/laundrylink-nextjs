import { NextResponse } from "next/server";
import { cleanerIdForUser, getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/types";

export const dynamic = "force-dynamic";

type StoredFile = {
  id: number;
  cleaner_id: number;
  kind: string;
  filename: string;
  media_type: string;
  is_approved: number;
};

function fileBytes(contents: ArrayBuffer | Uint8Array) {
  return contents instanceof Uint8Array ? contents : new Uint8Array(contents);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new NextResponse("Not found", { status: 404 });
  const file = await one<StoredFile>(
    `SELECT vf.id, vf.cleaner_id, vf.kind, vf.filename, vf.media_type, c.is_approved
     FROM vendor_files vf JOIN cleaners c ON c.id = vf.cleaner_id WHERE vf.id = ?`,
    id,
  );
  if (!file) return new NextResponse("Not found", { status: 404 });

  const publicBranding = file.is_approved === 1 && (file.kind === "logo" || file.kind === "cover");
  if (!publicBranding) {
    const user = await getCurrentUser();
    if (!user) return new NextResponse("Not found", { status: 404 });
    const ownsCleaner = await cleanerIdForUser(user.id) === file.cleaner_id;
    if (!ownsCleaner && !ADMIN_ROLES.includes(user.role)) return new NextResponse("Not found", { status: 404 });
  }

  const stored = await one<{ contents: ArrayBuffer | Uint8Array }>("SELECT contents FROM vendor_files WHERE id = ?", file.id);
  if (!stored) return new NextResponse("Not found", { status: 404 });
  const inline = file.kind === "logo" || file.kind === "cover";
  const bytes = fileBytes(stored.contents);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new NextResponse(body, {
    headers: {
      "Cache-Control": publicBranding ? "public, max-age=3600" : "private, no-store, max-age=0",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Type": file.media_type,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
