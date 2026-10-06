import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, FileText, Pause, Play, ShieldCheck, Trash2 } from "lucide-react";
import {
  addOnboardingServiceAction,
  continueOnboardingServicesAction,
  deleteOnboardingServiceAction,
  saveBusinessOnboardingAction,
  saveLocationOnboardingAction,
  saveVerificationOnboardingAction,
  submitVendorOnboardingAction,
  toggleOnboardingServiceAction,
} from "@/app/actions/onboarding";
import { OnboardingStepper, ONBOARDING_STEPS, type OnboardingStep } from "@/components/onboarding-stepper";
import { SubmitButton } from "@/components/submit-button";
import { cleanerIdForUser, requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";
import { maskSensitiveValue } from "@/lib/sensitive-data";
import type { Cleaner, Service, VendorFileMetadata, VendorVerification } from "@/lib/types";

export const metadata: Metadata = { title: "Vendor onboarding" };

function humanize(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not provided";
}

function fileSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;
}

function masked(value: string | null) {
  try {
    return maskSensitiveValue(value);
  } catch {
    return "Protected value";
  }
}

function StatusNotice({ error, saved }: { error?: string; saved?: string }) {
  return <>
    {error && <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error.replaceAll("+", " ")}</p>}
    {saved && <p className="mb-5 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">Progress saved.</p>}
  </>;
}

function FileSummary({ file, optional = false }: { file?: VendorFileMetadata; optional?: boolean }) {
  return file
    ? <span className="mt-2 block text-xs text-zinc-500">Current: {file.filename} ({fileSize(file.size)})</span>
    : <span className={`mt-2 block text-xs ${optional ? "text-zinc-500" : "text-amber-700"}`}>{optional ? "No file uploaded" : "Required before submission"}</span>;
}

export default async function VendorOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string; saved?: string; submitted?: string }>;
}) {
  const query = await searchParams;
  const user = await requireUser("VENDOR_OWNER", { returnTo: "/cleaner/onboarding" });
  const cleanerId = await cleanerIdForUser(user.id);
  const cleaner = cleanerId ? await one<Cleaner>("SELECT * FROM cleaners WHERE id = ?", cleanerId) : null;
  if (!cleaner) return <div className="page"><div className="surface empty">Your business profile is not ready yet.</div></div>;

  const [services, verification, files] = await Promise.all([
    all<Service>("SELECT * FROM services WHERE cleaner_id = ? ORDER BY is_active DESC, name", cleaner.id),
    one<VendorVerification>("SELECT * FROM vendor_verifications WHERE cleaner_id = ?", cleaner.id),
    all<VendorFileMetadata>("SELECT id, cleaner_id, kind, filename, media_type, size FROM vendor_files WHERE cleaner_id = ?", cleaner.id),
  ]);
  const fileByKind = new Map(files.map((file) => [file.kind, file]));
  const requestedStep = ONBOARDING_STEPS.some((step) => step.key === query.step) ? query.step as OnboardingStep : null;
  const savedStep = cleaner.onboarding_step === "submitted" ? "review" : cleaner.onboarding_step as OnboardingStep;
  const step = requestedStep ?? savedStep;

  if (cleaner.verification_status === "pending") {
    return (
      <div className="page max-w-4xl">
        <section className="surface overflow-hidden">
          <div className="border-b border-zinc-200 bg-blue-50 px-6 py-5 sm:px-8"><p className="eyebrow">Application submitted</p><h1 className="mt-2 text-2xl font-extrabold text-brand-navy">Pending verification</h1></div>
          <div className="p-6 sm:p-8"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-teal-50 text-brand-teal"><ShieldCheck size={25} /></span><div><h2 className="section-title">We are reviewing {cleaner.business_name}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Your business remains unpublished while LaundryLink verifies the submitted identity, business, service, and payout information. You will receive a notification when the review is complete.</p></div></div><div className="mt-7 grid gap-3 border-t border-zinc-200 pt-6 sm:grid-cols-3"><div><p className="text-xs font-bold uppercase text-zinc-400">Status</p><p className="mt-1 font-bold text-amber-700">Pending verification</p></div><div><p className="text-xs font-bold uppercase text-zinc-400">Submitted</p><p className="mt-1 font-bold text-brand-navy">{cleaner.submitted_at ? new Date(cleaner.submitted_at.replace(" ", "T") + "Z").toLocaleDateString("en-NG") : "Recently"}</p></div><div><p className="text-xs font-bold uppercase text-zinc-400">Marketplace</p><p className="mt-1 font-bold text-zinc-700">Not published</p></div></div><Link className="btn-secondary mt-7" href="/cleaner/dashboard">Return to workspace</Link></div>
        </section>
      </div>
    );
  }

  if (cleaner.verification_status === "approved") {
    return <div className="page max-w-3xl"><div className="surface p-8 text-center"><CheckCircle2 className="mx-auto text-brand-teal" size={42} /><h1 className="mt-4 text-2xl font-extrabold text-brand-navy">Your business is approved</h1><p className="mt-2 text-zinc-600">Manage your live profile and services from the vendor workspace.</p><Link className="btn-primary mt-6" href="/cleaner/dashboard">Open workspace</Link></div></div>;
  }

  const logo = fileByKind.get("logo");
  const cover = fileByKind.get("cover");
  const identityDocument = fileByKind.get("identity_document");
  const businessDocument = fileByKind.get("business_document");

  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Vendor onboarding</p><h1 className="page-title">Set up your laundry business</h1><p className="page-copy">Complete each section, review the details, then submit the business for verification.</p></div><span className="badge border-zinc-200 bg-white text-zinc-600">Draft</span></div>
      {cleaner.verification_status === "needs_changes" && <p className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Your submission needs changes. Update the information below and submit it again for verification.</p>}
      <OnboardingStepper current={step} completedThrough={savedStep} />
      <StatusNotice error={query.error} saved={query.saved} />

      {step === "business" && <form action={saveBusinessOnboardingAction} className="surface mx-auto max-w-4xl p-5 sm:p-8">
        <div className="mb-6"><h2 className="section-title">Business</h2><p className="mt-1 text-sm text-zinc-500">The identity customers will see after your business is approved.</p></div>
        <div className="form-grid two">
          <label><span className="field-label">Business name</span><input className="field" name="business_name" defaultValue={cleaner.business_name} maxLength={120} required /></label>
          <label><span className="field-label">Owner or contact person</span><input className="field" name="contact_name" defaultValue={cleaner.contact_name ?? user.name} maxLength={100} required /></label>
          <label><span className="field-label">Business phone</span><input className="field" name="business_phone" type="tel" defaultValue={cleaner.phone || user.phone || ""} maxLength={30} required /></label>
          <label><span className="field-label">Business email</span><input className="field" name="business_email" type="email" defaultValue={cleaner.business_email ?? user.email} maxLength={254} required /></label>
          <label className="sm:col-span-2"><span className="field-label">Description</span><textarea className="field min-h-32" name="description" defaultValue={cleaner.description ?? ""} minLength={20} maxLength={1000} required /></label>
          <label><span className="field-label">Logo</span><input className="field" name="logo" type="file" accept="image/jpeg,image/png,image/webp" required={!logo} /><FileSummary file={logo} /></label>
          <label><span className="field-label">Cover image</span><input className="field" name="cover" type="file" accept="image/jpeg,image/png,image/webp" required={!cover} /><FileSummary file={cover} /></label>
          <SubmitButton pendingLabel="Saving business..." className="btn-primary sm:col-span-2">Save and continue</SubmitButton>
        </div>
      </form>}

      {step === "location" && <form action={saveLocationOnboardingAction} className="surface mx-auto max-w-4xl p-5 sm:p-8">
        <div className="mb-6"><h2 className="section-title">Location and coverage</h2><p className="mt-1 text-sm text-zinc-500">Define the service base and how far pickup and delivery can travel.</p></div>
        <div className="form-grid two">
          <label><span className="field-label">State</span><input className="field" name="state" defaultValue={cleaner.state ?? "Lagos"} maxLength={80} required /></label>
          <label><span className="field-label">LGA</span><input className="field" name="lga" defaultValue={cleaner.lga ?? ""} maxLength={100} required /></label>
          <label><span className="field-label">Area</span><input className="field" name="area" defaultValue={cleaner.area ?? ""} maxLength={100} placeholder="Lekki Phase 1" required /></label>
          <label><span className="field-label">Full address</span><input className="field" name="address" defaultValue={cleaner.address} maxLength={250} autoComplete="street-address" required /></label>
          <label><span className="field-label">Latitude <span className="font-normal text-zinc-400">(optional)</span></span><input className="field" name="latitude" type="number" step="any" min="-90" max="90" defaultValue={cleaner.latitude ?? ""} /></label>
          <label><span className="field-label">Longitude <span className="font-normal text-zinc-400">(optional)</span></span><input className="field" name="longitude" type="number" step="any" min="-180" max="180" defaultValue={cleaner.longitude ?? ""} /></label>
          <label><span className="field-label">Pickup radius (km)</span><input className="field" name="pickup_radius_km" type="number" min="0.5" max="100" step="0.5" defaultValue={cleaner.pickup_radius_km || 5} required /></label>
          <label><span className="field-label">Delivery radius (km)</span><input className="field" name="delivery_radius_km" type="number" min="0.5" max="100" step="0.5" defaultValue={cleaner.delivery_radius_km || 10} required /></label>
          <div className="flex flex-wrap justify-between gap-3 sm:col-span-2"><Link className="btn-secondary" href="/cleaner/onboarding?step=business">Back</Link><SubmitButton pendingLabel="Saving location...">Save and continue</SubmitButton></div>
        </div>
      </form>}

      {step === "services" && <div className="grid gap-7 lg:grid-cols-[.82fr_1.18fr]">
        <form action={addOnboardingServiceAction} className="surface panel form-grid h-fit">
          <div><h2 className="section-title">Add a service</h2><p className="mt-1 text-sm text-zinc-500">Create clear, individually priced customer options.</p></div>
          <label><span className="field-label">Service name</span><input className="field" name="name" maxLength={120} placeholder="Wash and fold" required /></label>
          <label><span className="field-label">Category</span><input className="field" name="category" maxLength={80} placeholder="Laundry" required /></label>
          <label><span className="field-label">Description</span><textarea className="field min-h-24" name="description" maxLength={500} /></label>
          <div className="form-grid two"><label><span className="field-label">Price (NGN)</span><input className="field" name="price" type="number" min="1" max="10000000" step="0.01" required /></label><label><span className="field-label">Pricing unit</span><select className="field" name="unit"><option value="per_item">Per item</option><option value="per_kg">Per kg</option><option value="per_pair">Per pair</option><option value="per_set">Per set</option><option value="flat_rate">Flat rate</option></select></label></div>
          <label><span className="field-label">Turnaround time</span><input className="field" name="turnaround_time" maxLength={100} placeholder="24 - 48 hours" required /></label>
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700"><input type="checkbox" name="express_available" /> Express service available</label>
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700"><input type="checkbox" name="is_active" defaultChecked /> Active immediately after approval</label>
          <SubmitButton pendingLabel="Adding service...">Add service</SubmitButton>
        </form>
        <section><div className="flex items-end justify-between gap-3"><div><h2 className="section-title">Your services</h2><p className="mt-1 text-sm text-zinc-500">At least one service is required.</p></div><span className="badge border-zinc-200 bg-white text-zinc-600">{services.length}</span></div>
          <div className="mt-4 grid gap-3">{services.length ? services.map((service) => <article className="surface flex flex-wrap items-start justify-between gap-4 p-5" key={service.id}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-brand-navy">{service.name}</h3><span className="badge border-blue-200 bg-blue-50 text-blue-700">{service.category}</span><span className={`badge ${service.is_active ? "border-teal-200 bg-teal-50 text-teal-700" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>{service.is_active ? "Active" : "Inactive"}</span></div><p className="mt-2 text-sm leading-6 text-zinc-600">{service.description || "No description"}</p><p className="mt-2 text-sm"><strong className="text-brand-blue">{money(service.price)} / {humanize(service.unit).toLowerCase()}</strong><span className="ml-3 text-zinc-500">{service.turnaround_time || "Turnaround not set"}{service.express_available ? " · Express available" : ""}</span></p></div><div className="flex gap-2"><form action={toggleOnboardingServiceAction}><input type="hidden" name="service_id" value={service.id} /><button className="icon-button" title={service.is_active ? "Mark inactive" : "Mark active"}>{service.is_active ? <Pause size={17} /> : <Play size={17} />}</button></form><form action={deleteOnboardingServiceAction}><input type="hidden" name="service_id" value={service.id} /><button className="icon-button text-rose-600" title="Delete service"><Trash2 size={17} /></button></form></div></article>) : <div className="surface empty">Add your first service to continue.</div>}</div>
          <div className="mt-5 flex flex-wrap justify-between gap-3"><Link className="btn-secondary" href="/cleaner/onboarding?step=location">Back</Link><form action={continueOnboardingServicesAction}><SubmitButton pendingLabel="Continuing..." disabled={!services.length}>Continue to verification</SubmitButton></form></div>
        </section>
      </div>}

      {step === "verification" && <form action={saveVerificationOnboardingAction} className="surface mx-auto max-w-4xl p-5 sm:p-8">
        <div className="mb-6"><h2 className="section-title">Verification and payout</h2><p className="mt-1 text-sm text-zinc-500">Sensitive numbers are encrypted. Documents remain private to your business and authorized reviewers.</p></div>
        <div className="mb-6 flex items-center gap-3 rounded-md border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800"><CheckCircle2 size={20} /><span><strong>Phone verified</strong><span className="block text-xs">{user.phone}</span></span></div>
        <div className="form-grid two">
          <label><span className="field-label">Identity type</span><select className="field" name="identity_type" defaultValue={verification?.identity_type ?? "nin"}><option value="nin">National Identity Number (NIN)</option><option value="drivers_license">Driver&apos;s licence</option><option value="passport">International passport</option><option value="voters_card">Voter&apos;s card</option></select></label>
          <label><span className="field-label">Identity number</span><input className="field" name="identity_number" maxLength={40} placeholder={verification?.identity_number_encrypted ? "Leave blank to keep saved value" : "Enter identity number"} required={!verification?.identity_number_encrypted} /></label>
          <label><span className="field-label">Identity document</span><input className="field" name="identity_document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required={!identityDocument} /><FileSummary file={identityDocument} /></label>
          <label><span className="field-label">Business document <span className="font-normal text-zinc-400">(where applicable)</span></span><input className="field" name="business_document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" /><FileSummary file={businessDocument} optional /></label>
          <label className="sm:col-span-2"><span className="field-label">Business registration number <span className="font-normal text-zinc-400">(optional)</span></span><input className="field" name="business_registration_number" defaultValue={verification?.business_registration_number ?? ""} maxLength={80} /></label>
          <div className="my-2 border-t border-zinc-200 sm:col-span-2" />
          <label><span className="field-label">Bank name</span><input className="field" name="bank_name" defaultValue={verification?.bank_name ?? ""} maxLength={120} required /></label>
          <label><span className="field-label">Account name</span><input className="field" name="bank_account_name" defaultValue={verification?.bank_account_name ?? ""} maxLength={120} required /></label>
          <label className="sm:col-span-2"><span className="field-label">Account number</span><input className="field" name="bank_account_number" inputMode="numeric" maxLength={20} placeholder={verification?.bank_account_number_encrypted ? "Leave blank to keep saved value" : "Enter payout account number"} required={!verification?.bank_account_number_encrypted} /></label>
          <label className="flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 sm:col-span-2"><input className="mt-1" type="checkbox" name="information_confirmed" required /><span>I confirm that the identity, business, and payout information is accurate and belongs to this business.</span></label>
          <div className="flex flex-wrap justify-between gap-3 sm:col-span-2"><Link className="btn-secondary" href="/cleaner/onboarding?step=services">Back</Link><SubmitButton pendingLabel="Securing details...">Save and review</SubmitButton></div>
        </div>
      </form>}

      {step === "review" && <div className="mx-auto max-w-5xl">
        <section className="surface overflow-hidden"><div className="relative aspect-[4/1] min-h-40 bg-zinc-100">{cover ? <Image src={`/api/vendor-files/${cover.id}`} alt={`${cleaner.business_name} cover`} fill unoptimized className="object-cover" /> : <div className="grid h-full place-items-center text-sm text-zinc-400">Cover image missing</div>}<div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" /><div className="absolute bottom-5 left-5 flex items-end gap-4 sm:left-7">{logo ? <Image className="h-20 w-20 rounded-md border-4 border-white bg-white object-cover shadow-lg" src={`/api/vendor-files/${logo.id}`} alt={`${cleaner.business_name} logo`} width={80} height={80} unoptimized /> : <div className="h-20 w-20 rounded-md border-4 border-white bg-zinc-100" />}<div className="pb-1 text-white"><p className="text-sm font-semibold">Vendor application</p><h2 className="text-2xl font-extrabold">{cleaner.business_name}</h2></div></div></div>
          <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-2">
            <div><h3 className="font-extrabold text-brand-navy">Business</h3><dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-zinc-400">Contact</dt><dd className="font-semibold">{cleaner.contact_name}</dd></div><div><dt className="text-zinc-400">Phone and email</dt><dd className="font-semibold">{cleaner.phone} · {cleaner.business_email}</dd></div><div><dt className="text-zinc-400">Description</dt><dd className="leading-6 text-zinc-600">{cleaner.description}</dd></div></dl></div>
            <div><h3 className="font-extrabold text-brand-navy">Location</h3><dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-zinc-400">Address</dt><dd className="font-semibold">{cleaner.address}, {cleaner.area}, {cleaner.lga}, {cleaner.state}</dd></div><div><dt className="text-zinc-400">Coverage</dt><dd className="font-semibold">Pickup {cleaner.pickup_radius_km} km · Delivery {cleaner.delivery_radius_km} km</dd></div><div><dt className="text-zinc-400">Coordinates</dt><dd className="font-semibold">{cleaner.latitude !== null ? `${cleaner.latitude}, ${cleaner.longitude}` : "Not provided"}</dd></div></dl></div>
          </div>
        </section>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><section className="surface panel"><h3 className="font-extrabold text-brand-navy">Services</h3><div className="mt-4 grid gap-3">{services.map((service) => <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-3 last:border-0 last:pb-0" key={service.id}><div><p className="font-bold">{service.name}</p><p className="text-xs text-zinc-500">{service.category} · {service.turnaround_time}{service.express_available ? " · Express" : ""}</p></div><strong className="whitespace-nowrap text-brand-blue">{money(service.price)} / {humanize(service.unit).toLowerCase()}</strong></div>)}</div></section>
          <section className="surface panel"><h3 className="font-extrabold text-brand-navy">Verification</h3><dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-zinc-400">Identity</dt><dd className="font-semibold">{humanize(verification?.identity_type)} · {masked(verification?.identity_number_encrypted ?? null)}</dd></div><div><dt className="text-zinc-400">Identity document</dt><dd>{identityDocument ? <Link className="inline-flex items-center gap-1 font-bold text-brand-blue" href={`/api/vendor-files/${identityDocument.id}`}><FileText size={15} />{identityDocument.filename}</Link> : "Missing"}</dd></div><div><dt className="text-zinc-400">Business document</dt><dd>{businessDocument ? <Link className="inline-flex items-center gap-1 font-bold text-brand-blue" href={`/api/vendor-files/${businessDocument.id}`}><FileText size={15} />{businessDocument.filename}</Link> : "Not provided"}</dd></div><div><dt className="text-zinc-400">Payout</dt><dd className="font-semibold">{verification?.bank_name || "Not provided"} · {masked(verification?.bank_account_number_encrypted ?? null)}</dd></div></dl></section></div>
        <section className="mt-5 border-y border-zinc-200 bg-white px-5 py-6 sm:px-8"><form action={submitVendorOnboardingAction} className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><label className="flex max-w-2xl items-start gap-3 text-sm leading-6 text-zinc-700"><input className="mt-1" type="checkbox" name="confirmation" required /><span>I confirm this application is complete. Submitting sends it to LaundryLink for verification and does not publish the business automatically.</span></label><SubmitButton pendingLabel="Submitting..." className="btn-primary shrink-0">Submit for verification</SubmitButton></form></section>
        <div className="mt-5 flex justify-start"><Link className="btn-secondary" href="/cleaner/onboarding?step=verification">Back to verification</Link></div>
      </div>}
    </div>
  );
}
