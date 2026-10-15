import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";
type Receipt = { id: number; order_id: number; amount: number; provider: string; reference: string | null; status: string; paid_at: string | null; created_at: string; business_name: string; customer_name: string; customer_email: string };

function csvCell(value: string | number | null) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER") return new NextResponse("Not found", { status: 404 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new NextResponse("Not found", { status: 404 });
  const receipt = await one<Receipt>(
    `SELECT p.id, p.order_id, p.amount, p.provider, p.reference, p.status, p.paid_at, p.created_at,
       c.business_name, u.name AS customer_name, u.email AS customer_email
     FROM payments p JOIN orders o ON o.id = p.order_id JOIN cleaners c ON c.id = o.cleaner_id
     JOIN users u ON u.id = p.customer_id
     WHERE p.id = ? AND p.customer_id = ? AND o.customer_id = ?`,
    id,
    user.id,
    user.id,
  );
  if (!receipt) return new NextResponse("Not found", { status: 404 });
  const rows = [
    ["Receipt number", receipt.id], ["Order number", receipt.order_id], ["Customer", receipt.customer_name],
    ["Customer email", receipt.customer_email], ["Cleaner", receipt.business_name], ["Amount (NGN)", receipt.amount],
    ["Status", receipt.status], ["Provider", receipt.provider], ["Reference", receipt.reference],
    ["Paid at", receipt.paid_at || receipt.created_at],
  ];
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(body, { headers: {
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": `attachment; filename="laundrylink-receipt-${receipt.id}.csv"`,
    "Content-Type": "text/csv; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  } });
}
