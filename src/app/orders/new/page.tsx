import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createOrderAction } from "@/app/actions/orders";
import { OrderIntentForm } from "@/components/order-intent-form";
import { PricingOrderBuilder } from "@/components/pricing-order-builder";
import { dashboardForRole, getCurrentUser } from "@/lib/auth";
import { PLATFORM_FEE, TIME_WINDOWS } from "@/lib/constants";
import { all, one } from "@/lib/db";
import type { Cleaner, Service } from "@/lib/types";

export const metadata: Metadata = { title: "Book laundry" };
type Address = { id: number; label: string | null; address: string; city: string; is_default: number };
type ReorderItem = { service_id: number; quantity: number };
type Discount = { service_id: number; minimum_quantity: number; discount_type: "fixed" | "percentage"; discount_value: number };
type DeliveryZone = { id: number; name: string; pricing_type: "fixed" | "distance" | "free"; base_fee: number; per_km_fee: number; minimum_fee: number; maximum_fee: number | null };
type CustomerPreferences = { fragrance_preference: string | null; detergent_sensitivity: string | null; ironing_instructions: string | null; folding_style: string | null; special_garment_care: string | null };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ cleaner?: string; error?: string; resume?: string; reorder?: string }> }) {
  const { cleaner: cleanerParam, error, resume, reorder: reorderParam } = await searchParams;
  const user = await getCurrentUser();
  if (user && user.role !== "CUSTOMER") redirect(dashboardForRole(user.role));
  const cleaners = await all<Cleaner>(`SELECT c.* FROM cleaners c
    JOIN vendor_eligibility ve ON ve.cleaner_id = c.id
    WHERE ve.bookable = 1 ORDER BY c.business_name`);
  const parsedCleanerId = Number(cleanerParam ?? 0);
  const cleanerId = Number.isSafeInteger(parsedCleanerId) && parsedCleanerId > 0 ? parsedCleanerId : 0;
  const selectedCleaner = cleanerId ? await one<Cleaner>(`SELECT c.* FROM cleaners c
    JOIN vendor_eligibility ve ON ve.cleaner_id = c.id
    WHERE c.id = ? AND ve.bookable = 1`, cleanerId) : null;
  const services = selectedCleaner ? await all<Service>(`SELECT * FROM services
    WHERE cleaner_id = ? AND is_active = 1 AND price > 0 AND price <= 10000000 ORDER BY name`, selectedCleaner.id) : [];
  const discounts = selectedCleaner ? await all<Discount>(`SELECT d.service_id, d.minimum_quantity, d.discount_type, d.discount_value
    FROM service_bulk_discounts d JOIN services s ON s.id = d.service_id
    WHERE s.cleaner_id = ? AND d.is_active = 1 ORDER BY d.minimum_quantity`, selectedCleaner.id) : [];
  const zones = selectedCleaner ? await all<DeliveryZone>("SELECT id, name, pricing_type, base_fee, per_km_fee, minimum_fee, maximum_fee FROM delivery_zones WHERE cleaner_id = ? AND is_active = 1 ORDER BY name", selectedCleaner.id) : [];
  const servicesWithDiscounts = services.map((service) => ({ ...service, discounts: discounts.filter((discount) => discount.service_id === service.id) }));
  const addresses = user ? await all<Address>("SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, label", user.id) : [];
  const preferences = user ? await one<CustomerPreferences>("SELECT * FROM customer_preferences WHERE user_id = ?", user.id) : null;
  const parsedReorderId = Number(reorderParam ?? 0);
  const reorderId = Number.isSafeInteger(parsedReorderId) && parsedReorderId > 0 ? parsedReorderId : 0;
  const reorderOrder = user && selectedCleaner && reorderId ? await one<{ id: number; notes: string | null }>(
    "SELECT id, notes FROM orders WHERE id = ? AND customer_id = ? AND cleaner_id = ?",
    reorderId,
    user.id,
    selectedCleaner.id,
  ) : null;
  const reorderItems = reorderOrder ? await all<ReorderItem>(
    `SELECT oi.service_id, oi.quantity FROM order_items oi
     JOIN services s ON s.id = oi.service_id
     WHERE oi.order_id = ? AND s.cleaner_id = ? AND s.is_active = 1 AND s.price > 0 AND s.price <= 10000000`,
    reorderOrder.id,
    selectedCleaner?.id ?? 0,
  ) : [];
  const reorderQuantities = Object.fromEntries(reorderItems.map((item) => [Number(item.service_id), Number(item.quantity)]));
  const savedCareNotes = preferences ? [
    preferences.fragrance_preference && `Fragrance: ${preferences.fragrance_preference}`,
    preferences.detergent_sensitivity && `Detergent sensitivity: ${preferences.detergent_sensitivity}`,
    preferences.ironing_instructions && `Ironing: ${preferences.ironing_instructions}`,
    preferences.folding_style && `Folding: ${preferences.folding_style}`,
    preferences.special_garment_care && `Special care: ${preferences.special_garment_care}`,
  ].filter(Boolean).join("\n") : "";
  const returnTo = selectedCleaner
    ? `/orders/new?cleaner=${selectedCleaner.id}${reorderOrder ? `&reorder=${reorderOrder.id}` : ""}&resume=1`
    : "/orders/new";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">New order</p><h1 className="page-title">Schedule your laundry</h1><p className="page-copy">Choose a cleaner, select services, then set the pickup and delivery details.</p></div></div>
      {error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error.replaceAll("+", " ")}</p>}
      {reorderOrder && <p className="mb-5 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Order #{reorderOrder.id} has been loaded with currently available services and today&apos;s prices. Confirm the quantities and schedule before creating the new order.</p>}
      <form action="/orders/new" className="surface mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto]"><select className="field" name="cleaner" defaultValue={selectedCleaner?.id ?? ""} required><option value="" disabled>Choose an approved cleaner</option>{cleaners.map((cleaner) => <option key={cleaner.id} value={cleaner.id}>{cleaner.business_name} - {cleaner.city}</option>)}</select><button className="btn-secondary" type="submit">Load services</button></form>
      {selectedCleaner ? <OrderIntentForm
        action={createOrderAction}
        authenticated={Boolean(user)}
        cleanerId={selectedCleaner.id}
        returnTo={returnTo}
        resumeDraft={resume === "1"}
      >
        <input type="hidden" name="cleaner_id" value={selectedCleaner.id} />
        <PricingOrderBuilder
          cleanerId={selectedCleaner.id}
          cleanerName={selectedCleaner.business_name}
          services={servicesWithDiscounts}
          zones={zones}
          addresses={addresses}
          initialQuantities={reorderQuantities}
          initialNotes={reorderOrder?.notes ?? savedCareNotes}
          minimumOrderAmount={Number(selectedCleaner.minimum_order_amount ?? 0)}
          defaultDelivery={{ pricingType: selectedCleaner.delivery_pricing_type ?? "fixed", baseFee: Number(selectedCleaner.base_delivery_fee ?? 1500), perKmFee: Number(selectedCleaner.delivery_fee_per_km ?? 0) }}
          freeDeliveryThreshold={selectedCleaner.free_delivery_threshold == null ? null : Number(selectedCleaner.free_delivery_threshold)}
          platformFee={PLATFORM_FEE}
          expressTurnaroundHours={Number(selectedCleaner.express_turnaround_hours)}
          today={today}
          timeWindows={TIME_WINDOWS}
          authenticated={Boolean(user)}
        />
      </OrderIntentForm> : <div className="surface empty">Choose a cleaner above to view services and continue.</div>}
    </div>
  );
}
