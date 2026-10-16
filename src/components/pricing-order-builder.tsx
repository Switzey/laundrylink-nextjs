"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { CalendarClock, Check, ChevronLeft, ChevronRight, ImagePlus, MapPin, Minus, Plus, ShoppingBasket, Tag } from "lucide-react";
import { validateBookingVoucherAction } from "@/app/actions/orders";
import { earliestDeliveryDate, selectedTurnaroundHours } from "@/lib/booking-policy";
import { calculateOrderPricing, type BulkDiscount, type PriceableService } from "@/lib/pricing-engine";

type Zone = { id: number; name: string; pricing_type: "fixed" | "distance" | "free"; base_fee: number; per_km_fee: number; minimum_fee: number; maximum_fee: number | null };
type Address = { id: number; label: string | null; address: string; city: string; is_default: number };
type ServiceWithDiscounts = PriceableService & { description: string | null; turnaround_time: string | null; package_details: string | null; discounts: BulkDiscount[] };
type Slot = { window: string; available: boolean };

const currency = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 });
const money = (value: number) => currency.format(value);
const unitLabel = (unit: string) => unit.replace("per_", "per ").replaceAll("_", " ");
const steps = ["Services", "Address", "Schedule", "Review & payment"];

export function PricingOrderBuilder({ cleanerId, cleanerName, services, zones, addresses, initialQuantities, initialNotes, minimumOrderAmount, defaultDelivery, freeDeliveryThreshold, platformFee, expressTurnaroundHours, today, timeWindows, authenticated }: {
  cleanerId: number;
  cleanerName: string;
  services: ServiceWithDiscounts[];
  zones: Zone[];
  addresses: Address[];
  initialQuantities: Record<number, number>;
  initialNotes: string;
  minimumOrderAmount: number;
  defaultDelivery: { pricingType: "fixed" | "distance" | "free"; baseFee: number; perKmFee: number };
  freeDeliveryThreshold: number | null;
  platformFee: number;
  expressTurnaroundHours: number;
  today: string;
  timeWindows: readonly string[];
  authenticated: boolean;
}) {
  const [step, setStep] = useState(0);
  const [selection, setSelection] = useState(() => services.map((service) => ({ service, quantity: Number(initialQuantities[service.id] ?? 0), express: false, specialTreatment: false })));
  const [zoneId, setZoneId] = useState(0);
  const [pickupDate, setPickupDate] = useState("");
  const [pickupWindow, setPickupWindow] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryWindow, setDeliveryWindow] = useState("");
  const [slots, setSlots] = useState<Slot[]>(timeWindows.map((window) => ({ window, available: true })));
  const [slotLoading, setSlotLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucher, setVoucher] = useState<{ code: string; discount: number } | null>(null);
  const [voucherMessage, setVoucherMessage] = useState("");
  const [voucherPending, startVoucherTransition] = useTransition();

  const pricing = useMemo(() => {
    const zone = zones.find((item) => item.id === zoneId);
    try {
      return calculateOrderPricing({
        items: selection.filter((item) => item.quantity > 0),
        delivery: zone ? { name: zone.name, pricingType: zone.pricing_type, baseFee: zone.base_fee, perKmFee: zone.per_km_fee, minimumFee: zone.minimum_fee, maximumFee: zone.maximum_fee } : defaultDelivery,
        platformFee,
        minimumOrderAmount,
        freeDeliveryThreshold,
      });
    } catch {
      return null;
    }
  }, [defaultDelivery, freeDeliveryThreshold, minimumOrderAmount, platformFee, selection, zoneId, zones]);

  const selected = selection.filter((item) => item.quantity > 0);
  const expressSelected = selected.some((item) => item.express);
  const turnaround = selected.length ? Math.max(...selected.map((item) => selectedTurnaroundHours([item.service], item.express, expressTurnaroundHours))) : 48;
  const earliestDelivery = pickupDate ? earliestDeliveryDate(pickupDate, turnaround) : "";
  const payableTotal = Math.max(0, (pricing?.total ?? 0) - (voucher?.discount ?? 0));
  const defaultAddress = addresses.find((address) => address.is_default)?.id ?? "";

  useEffect(() => {
    if (!pickupDate) return;
    const controller = new AbortController();
    fetch(`/api/booking/availability?cleaner=${cleanerId}&pickupDate=${encodeURIComponent(pickupDate)}&express=${expressSelected ? 1 : 0}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ slots: Slot[] }> : Promise.reject(new Error("availability")))
      .then((data) => setSlots(data.slots))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSlots(timeWindows.map((window) => ({ window, available: false })));
      })
      .finally(() => setSlotLoading(false));
    return () => controller.abort();
  }, [cleanerId, expressSelected, pickupDate, timeWindows]);

  function refreshPricing(event: FormEvent<HTMLElement>) {
    const form = event.currentTarget.closest("form");
    if (!form) return;
    const data = new FormData(form);
    setSelection(services.map((service) => ({ service, quantity: Number(data.get(`service_${service.id}`) ?? 0), express: data.get(`express_${service.id}`) === "on", specialTreatment: data.get(`treatment_${service.id}`) === "on" })));
    setZoneId(Number(data.get("delivery_zone_id") ?? 0));
    const nextPickupDate = String(data.get("pickup_date") ?? "");
    if (nextPickupDate !== pickupDate) setSlotLoading(Boolean(nextPickupDate));
    setPickupDate(nextPickupDate);
    setPickupWindow(String(data.get("pickup_time_window") ?? ""));
    const nextDeliveryDate = String(data.get("delivery_date") ?? "");
    const nextEarliestDelivery = nextPickupDate ? earliestDeliveryDate(nextPickupDate, turnaround) : "";
    setDeliveryDate(nextEarliestDelivery && nextDeliveryDate < nextEarliestDelivery ? nextEarliestDelivery : nextDeliveryDate);
    setDeliveryWindow(String(data.get("delivery_time_window") ?? ""));
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (/^(service_|express_|treatment_|delivery_zone_id)/.test(target.name)) {
      setVoucher(null);
      setVoucherMessage("");
    }
  }

  function adjustQuantity(serviceId: number, direction: -1 | 1, button: HTMLButtonElement) {
    const service = services.find((item) => item.id === serviceId);
    const input = button.closest("article")?.querySelector<HTMLInputElement>(`input[name="service_${serviceId}"]`);
    if (!service || !input) return;
    const current = Number(input.value || 0);
    const stepSize = Number(service.quantity_step || 1);
    const minimum = Number(service.minimum_quantity || stepSize);
    const next = direction < 0 ? (current <= minimum ? 0 : Math.max(minimum, current - stepSize)) : (current <= 0 ? minimum : current + stepSize);
    input.value = String(Math.round(next * 1000) / 1000);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function currentFormData() {
    const field = document.querySelector<HTMLInputElement>(`input[name="cleaner_id"][value="${cleanerId}"]`);
    return field?.form ? new FormData(field.form) : null;
  }

  function advance() {
    const data = currentFormData();
    if (!data) return;
    if (step === 0 && (!pricing?.lines.length || !pricing.meetsMinimum)) {
      setFormError(pricing?.lines.length ? "Add more items to meet the vendor minimum." : "Select at least one service and quantity.");
      return;
    }
    if (step === 1) {
      const pickupAddress = Number(data.get("pickup_address_id")) > 0 || String(data.get("pickup_address") ?? "").trim().length >= 3;
      const deliveryAddress = Number(data.get("delivery_address_id")) > 0 || String(data.get("delivery_address") ?? "").trim().length >= 3;
      if (!pickupAddress || !deliveryAddress) {
        setFormError("Choose saved pickup and delivery addresses or enter both addresses manually.");
        return;
      }
    }
    if (step === 2) {
      const selectedSlot = slots.find((slot) => slot.window === pickupWindow);
      if (!pickupDate || !pickupWindow || !selectedSlot?.available || !deliveryDate || deliveryDate < earliestDelivery || !deliveryWindow) {
        setFormError("Choose an available pickup slot and a valid delivery date and window.");
        return;
      }
    }
    setFormError("");
    setStep((current) => Math.min(steps.length - 1, current + 1));
  }

  function validateVoucher() {
    if (!authenticated) {
      setVoucherMessage("Sign in before applying a voucher.");
      return;
    }
    if (!pricing || !voucherCode.trim()) {
      setVoucherMessage("Enter a voucher code.");
      return;
    }
    startVoucherTransition(async () => {
      const result = await validateBookingVoucherAction({ cleanerId, subtotal: pricing.serviceTotal, code: voucherCode });
      if (result.valid) {
        setVoucher({ code: result.code, discount: result.discount });
        setVoucherMessage(`${result.code} applied.`);
      } else {
        setVoucher(null);
        setVoucherMessage(result.message);
      }
    });
  }

  return <div className="grid gap-6" onInput={refreshPricing} onChange={refreshPricing}>
    <nav aria-label="Booking progress" className="surface overflow-hidden p-2"><ol className="grid grid-cols-4 gap-1">{steps.map((label, index) => <li key={label}><button className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-md px-2 text-xs font-bold sm:text-sm ${index === step ? "bg-brand-blue text-white" : index < step ? "bg-teal-50 text-teal-800" : "text-zinc-500"}`} type="button" onClick={() => index < step && setStep(index)} aria-current={index === step ? "step" : undefined}>{index < step ? <Check size={16} /> : <span>{index + 1}</span>}<span className="hidden sm:inline">{label}</span></button></li>)}</ol></nav>

    <div className={step === 0 ? "block" : "hidden"}><section className="surface panel"><div className="flex items-center gap-2"><ShoppingBasket className="text-brand-blue" size={21} /><h2 className="section-title">Services from {cleanerName}</h2></div><div className="mt-5 divide-y divide-zinc-200">{services.map((service) => <article className="py-5 first:pt-0 last:pb-0" key={service.id}><div className="grid gap-4 sm:grid-cols-[1fr_9rem] sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-brand-navy">{service.name}</strong><span className="badge border-zinc-200 bg-white text-zinc-600">{service.category}</span>{service.requires_final_confirmation ? <span className="badge border-amber-200 bg-amber-50 text-amber-800">Estimate</span> : null}</div><p className="mt-1 text-sm text-zinc-600">{service.description}</p>{service.package_details && <p className="mt-1 text-xs text-zinc-500">Includes: {service.package_details}</p>}<p className="mt-2 text-sm font-bold text-brand-blue">{money(Number(service.price))} / {unitLabel(service.unit)}</p><p className="mt-1 text-xs text-zinc-500">Minimum {service.minimum_quantity}; increments of {service.quantity_step}. {service.turnaround_time}</p></div><div><span className="field-label">Quantity</span><div className="grid grid-cols-[2.5rem_1fr_2.5rem] gap-1"><button className="icon-button" type="button" title="Decrease quantity" aria-label={`Decrease ${service.name} quantity`} onClick={(event) => adjustQuantity(service.id, -1, event.currentTarget)}><Minus size={16} /></button><input className="field text-center" type="number" min="0" max="10000" step={service.quantity_step} defaultValue={initialQuantities[service.id] ?? 0} name={`service_${service.id}`} aria-label={`${service.name} quantity`} /><button className="icon-button" type="button" title="Increase quantity" aria-label={`Increase ${service.name} quantity`} onClick={(event) => adjustQuantity(service.id, 1, event.currentTarget)}><Plus size={16} /></button></div></div></div>{(service.express_available || service.special_treatment_available) && <div className="mt-3 flex flex-wrap gap-4 border-t border-zinc-100 pt-3 text-sm">{service.express_available ? <label className="flex items-center gap-2"><input type="checkbox" name={`express_${service.id}`} />Express +{service.express_fee_type === "percentage" ? `${service.express_fee_value}%` : money(service.express_fee_value)}</label> : null}{service.special_treatment_available ? <label className="flex items-center gap-2"><input type="checkbox" name={`treatment_${service.id}`} />Special treatment +{money(service.special_treatment_fee)} / unit</label> : null}</div>}{service.discounts.length > 0 && <p className="mt-3 text-xs font-semibold text-brand-teal">Bulk saving: {service.discounts.map((discount) => `${discount.minimum_quantity}+ gets ${discount.discount_type === "percentage" ? `${discount.discount_value}%` : money(discount.discount_value)} off`).join(" · ")}</p>}</article>)}</div>{zones.length > 0 && <label className="mt-6 block border-t border-zinc-200 pt-5"><span className="field-label">Delivery zone</span><select className="field" name="delivery_zone_id" defaultValue="0"><option value="0">Standard delivery</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} · {zone.pricing_type === "free" ? "Free" : `from ${money(zone.base_fee)}`}</option>)}</select></label>}</section></div>

    <div className={step === 1 ? "block" : "hidden"}><section className="surface panel"><div className="flex items-center gap-2"><MapPin className="text-brand-blue" size={21} /><h2 className="section-title">Pickup and delivery address</h2></div><div className="form-grid two mt-5"><label><span className="field-label">Saved pickup address</span><select className="field" name="pickup_address_id" defaultValue={defaultAddress}><option value="">Enter manually</option>{addresses.map((address) => <option value={address.id} key={address.id}>{address.label || address.address} - {address.city}</option>)}</select></label><label><span className="field-label">Saved delivery address</span><select className="field" name="delivery_address_id" defaultValue={defaultAddress}><option value="">Enter manually</option>{addresses.map((address) => <option value={address.id} key={address.id}>{address.label || address.address} - {address.city}</option>)}</select></label><label><span className="field-label">Manual pickup address</span><input className="field" name="pickup_address" maxLength={250} /></label><label><span className="field-label">Manual delivery address</span><input className="field" name="delivery_address" maxLength={250} /></label><label><span className="field-label">Pickup instructions</span><textarea className="field min-h-24" name="pickup_notes" maxLength={1000} /></label><label><span className="field-label">Delivery instructions</span><textarea className="field min-h-24" name="delivery_notes" maxLength={1000} /></label><label className="sm:col-span-2"><span className="field-label">Garment care and stain instructions</span><textarea className="field min-h-28" name="notes" maxLength={1000} defaultValue={initialNotes} placeholder="Stains, delicate fabrics, ironing, fragrance, or handling requirements" /></label><label className="sm:col-span-2"><span className="field-label flex items-center gap-2"><ImagePlus size={16} />Garment or existing-damage photos</span><input className="field" type="file" name="attachments" accept="image/jpeg,image/png,image/webp" multiple /><span className="mt-1 block text-xs text-zinc-500">Up to 4 JPEG, PNG, or WebP images, 5 MB each.</span></label></div></section></div>

    <div className={step === 2 ? "block" : "hidden"}><section className="surface panel"><div className="flex items-center gap-2"><CalendarClock className="text-brand-teal" size={21} /><h2 className="section-title">Pickup and return schedule</h2></div><div className="form-grid two mt-5"><label><span className="field-label">Pickup date</span><input className="field" type="date" min={today} name="pickup_date" required /></label><label><span className="field-label">Pickup window</span><select className="field" name="pickup_time_window" required disabled={!pickupDate || slotLoading}><option value="">{slotLoading ? "Checking availability..." : "Choose available window"}</option>{slots.map((slot) => <option key={slot.window} value={slot.window} disabled={!slot.available}>{slot.window}{slot.available ? "" : " · Full"}</option>)}</select></label><label><span className="field-label">Earliest delivery date</span><input className="field" type="date" min={earliestDelivery || today} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} name="delivery_date" required /></label><label><span className="field-label">Delivery window</span><select className="field" name="delivery_time_window" required><option value="">Choose window</option>{timeWindows.map((window) => <option key={window}>{window}</option>)}</select></label></div><p className="mt-4 text-sm text-zinc-600">The return date is based on the slowest selected service{expressSelected ? " and the chosen express options" : ""}. The server checks capacity again when you confirm.</p></section></div>

    <div className={step === 3 ? "block" : "hidden"}><div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><section className="surface panel"><h2 className="section-title">Review booking</h2><div className="mt-5 divide-y divide-zinc-100">{pricing?.lines.map((line) => <div className="flex justify-between gap-4 py-3" key={line.serviceId}><span><strong className="block text-brand-navy">{line.serviceName}</strong><span className="text-xs text-zinc-500">{line.quantity} {unitLabel(line.unit)}</span></span><strong>{money(line.lineTotal)}</strong></div>)}</div><dl className="mt-5 grid gap-3 border-t border-zinc-200 pt-5 text-sm"><div className="flex justify-between"><dt>Pickup</dt><dd className="font-bold">{pickupDate} · {pickupWindow}</dd></div><div className="flex justify-between"><dt>Delivery</dt><dd className="font-bold">{deliveryDate} · {deliveryWindow}</dd></div></dl><div className="mt-6 border-t border-zinc-200 pt-5"><label><span className="field-label flex items-center gap-2"><Tag size={16} />Voucher</span><div className="grid grid-cols-[1fr_auto] gap-2"><input className="field uppercase" name="voucher_code" value={voucherCode} maxLength={32} onChange={(event) => setVoucherCode(event.target.value.toUpperCase())} /><button className="btn-secondary" type="button" onClick={validateVoucher} disabled={voucherPending}>{voucherPending ? "Checking..." : "Apply"}</button></div></label>{voucherMessage && <p className={`mt-2 text-sm ${voucher ? "text-teal-700" : "text-rose-700"}`}>{voucherMessage}</p>}</div></section><aside className="surface panel h-fit"><h2 className="section-title">Payment</h2><div className="mt-5 grid gap-3 text-sm"><div className="flex justify-between"><span>Services</span><strong>{money(pricing?.subtotal ?? 0)}</strong></div>{(pricing?.discountAmount ?? 0) > 0 && <div className="flex justify-between text-teal-700"><span>Bulk discounts</span><strong>-{money(pricing?.discountAmount ?? 0)}</strong></div>}{(pricing?.expressFee ?? 0) > 0 && <div className="flex justify-between"><span>Express</span><strong>{money(pricing?.expressFee ?? 0)}</strong></div>}{(pricing?.specialTreatmentFee ?? 0) > 0 && <div className="flex justify-between"><span>Special treatment</span><strong>{money(pricing?.specialTreatmentFee ?? 0)}</strong></div>}<div className="flex justify-between"><span>Pickup and delivery</span><strong>{money(pricing?.deliveryFee ?? 0)}</strong></div><div className="flex justify-between"><span>Platform fee</span><strong>{money(platformFee)}</strong></div>{voucher && <div className="flex justify-between text-teal-700"><span>Voucher {voucher.code}</span><strong>-{money(voucher.discount)}</strong></div>}<div className="flex justify-between border-t border-zinc-200 pt-4 text-lg"><strong>{pricing?.pricingStatus === "estimate" ? "Estimated total" : "Total"}</strong><strong className="text-brand-blue">{money(payableTotal)}</strong></div></div><label className="mt-6 flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-4"><input type="radio" name="payment_method" value="pay_on_pickup" defaultChecked required /><span><strong className="block text-brand-navy">Pay on pickup</strong><span className="mt-1 block text-xs leading-5 text-zinc-600">Your booking is confirmed now. Payment remains due on collection.</span></span></label><label className="mt-4 flex items-start gap-3 text-sm leading-6 text-zinc-700"><input className="mt-1" type="checkbox" name="price_policy_ack" required /><span>I understand that estimated quantities may be revised after physical inspection. Any increase requires my explicit approval before LaundryLink changes the payable total.</span></label><button className="btn-primary mt-5 w-full" type="submit" disabled={!pricing?.lines.length || !pricing.meetsMinimum}>{authenticated ? "Confirm booking" : "Continue to sign in"}</button></aside></div></div>

    {formError && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">{formError}</p>}
    <div className="flex justify-between"><button className="btn-secondary" type="button" onClick={() => { setFormError(""); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0}><ChevronLeft size={17} />Back</button>{step < steps.length - 1 && <button className="btn-primary" type="button" onClick={advance}>Continue<ChevronRight size={17} /></button>}</div>
  </div>;
}
