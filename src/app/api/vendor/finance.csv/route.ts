import { getCurrentUser, cleanerIdForUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { VENDOR_MANAGEMENT_ROLES } from "@/lib/types";

function csvCell(value: unknown){return `"${String(value??"").replaceAll('"','""')}"`;}
export async function GET(){
 const user=await getCurrentUser();
 if(!user||!VENDOR_MANAGEMENT_ROLES.includes(user.role)) return new Response("Not found",{status:404});
 const cleanerId=await cleanerIdForUser(user.id); if(!cleanerId)return new Response("Not found",{status:404});
 const rows=await all<{order_number:string|null;created_at:string;status:string;payment_status:string;subtotal:number;delivery_fee:number;platform_fee:number;total:number}>("SELECT order_number,created_at,status,payment_status,subtotal,delivery_fee,platform_fee,total FROM orders WHERE cleaner_id=? ORDER BY created_at DESC",cleanerId);
 const header=["Order","Created","Status","Payment","Service revenue","Delivery","Platform fee","Customer total"];
 const body=rows.map(row=>[row.order_number,row.created_at,row.status,row.payment_status,row.subtotal,row.delivery_fee,row.platform_fee,row.total].map(csvCell).join(","));
 return new Response([header.map(csvCell).join(","),...body].join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="laundrylink-statement-${new Date().toISOString().slice(0,10)}.csv"`,"Cache-Control":"private, no-store"}});
}
