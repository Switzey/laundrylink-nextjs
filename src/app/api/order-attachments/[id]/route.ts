import { NextResponse } from "next/server";
import { cleanerIdForUser, getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { VENDOR_ROLES } from "@/lib/types";

type StoredAttachment = {
  id: number;
  order_id: number;
  customer_id: number;
  cleaner_id: number;
  filename: string;
  media_type: string;
  contents: Uint8Array | ArrayBuffer;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  const attachment = await one<StoredAttachment>(
    `SELECT a.id, a.order_id, a.customer_id, a.filename, a.media_type, a.contents, o.cleaner_id
     FROM order_attachments a JOIN orders o ON o.id = a.order_id WHERE a.id = ?`,
    id,
  );
  if (!attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  const vendorCleanerId = VENDOR_ROLES.includes(user.role) ? await cleanerIdForUser(user.id) : null;
  const allowed = attachment.customer_id === user.id
    || (vendorCleanerId != null && attachment.cleaner_id === vendorCleanerId)
    || user.role === "ADMIN"
    || user.role === "SUPER_ADMIN"
    || user.role === "SUPPORT_AGENT";
  if (!allowed) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  const body = attachment.contents instanceof ArrayBuffer ? new Uint8Array(attachment.contents) : attachment.contents;
  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type": attachment.media_type,
      "Content-Disposition": `inline; filename="${attachment.filename.replaceAll('"', "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
    },
  });
}
