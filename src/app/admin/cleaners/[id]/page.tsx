import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Download, ShieldAlert, X } from "lucide-react";
import { setCleanerApprovalAction, setCleanerSuspensionAction } from "@/app/actions/admin";
import { requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { money } from "@/lib/format";
import { maskSensitiveValue } from "@/lib/sensitive-data";
import { ADMIN_ROLES, type Cleaner, type Service, type VendorFileMetadata, type VendorVerification } from "@/lib/types";
import { getVendorEligibility } from "@/lib/vendor-eligibility";
import { vendorEligibilityIssues } from "@/lib/vendor-eligibility-model";

export const metadata: Metadata = { title: "Vendor verification" };

function masked(value: string | null) {
  try { return maskSensitiveValue(value); } catch { return "Protected value"; }
}

export default async function AdminCleanerReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const cleanerId = Number((await params).id);
  await requireUser(ADMIN_ROLES, { returnTo: Number.isSafeInteger(cleanerId) ? `/admin/cleaners/${cleanerId}` : "/admin/dashboard" });
  if (!Number.isSafeInteger(cleanerId) || cleanerId <= 0) notFound();
  const cleaner = await one<Cleaner & { owner_name: string | null; owner_email: string | null; owner_phone: string | null }>(
    `SELECT c.*, u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
     FROM cleaners c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?`, cleanerId,
  );
  if (!cleaner) notFound();
  const [services, verification, files, eligibility] = await Promise.all([
    all<Service>("SELECT * FROM services WHERE cleaner_id = ? ORDER BY name", cleanerId),
    one<VendorVerification>("SELECT * FROM vendor_verifications WHERE cleaner_id = ?", cleanerId),
    all<VendorFileMetadata>("SELECT id, cleaner_id, kind, filename, media_type, size FROM vendor_files WHERE cleaner_id = ?", cleanerId),
    getVendorEligibility(cleanerId),
  ]);
  const eligibilityIssues = eligibility ? vendorEligibilityIssues(eligibility) : [];
  const fileByKind = new Map(files.map((file) => [file.kind, file]));
  const logo = fileByKind.get("logo");
  const cover = fileByKind.get("cover");
  const identityDocument = fileByKind.get("identity_document");
  const businessDocument = fileByKind.get("business_document");
  return (
    <div className="page">
      <Link className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-brand-blue" href="/admin/dashboard"><ArrowLeft size={16} />Back to approvals</Link>
      <div className="page-header"><div><p className="eyebrow">Vendor verification</p><h1 className="page-title">{cleaner.business_name}</h1><p className="page-copy">Review the submitted business, coverage, services, documents, and payout identity before making an approval decision.</p></div><span className={`badge ${cleaner.verification_status === "approved" ? "border-teal-200 bg-teal-50 text-teal-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{cleaner.verification_status.replaceAll("_", " ")}</span></div>
      <section className="surface overflow-hidden"><div className="relative aspect-[5/1] min-h-36 bg-zinc-100">{cover && <Image src={`/api/vendor-files/${cover.id}`} alt="Business cover" fill unoptimized className="object-cover" />}</div><div className="flex flex-wrap items-start gap-5 p-6">{logo && <Image src={`/api/vendor-files/${logo.id}`} alt="Business logo" width={84} height={84} unoptimized className="h-21 w-21 rounded-md border border-zinc-200 object-cover" />}<div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><div><p className="text-xs font-bold uppercase text-zinc-400">Business contact</p><p className="mt-1 font-bold">{cleaner.contact_name}</p><p className="text-sm text-zinc-500">{cleaner.phone}<br />{cleaner.business_email}</p></div><div><p className="text-xs font-bold uppercase text-zinc-400">Account owner</p><p className="mt-1 font-bold">{cleaner.owner_name}</p><p className="text-sm text-zinc-500">{cleaner.owner_email}<br />{cleaner.owner_phone}</p></div><div><p className="text-xs font-bold uppercase text-zinc-400">Location</p><p className="mt-1 font-bold">{cleaner.area}, {cleaner.lga}</p><p className="text-sm text-zinc-500">{cleaner.address}, {cleaner.state}</p></div></div></div></section>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="surface panel"><h2 className="section-title">Business and coverage</h2><p className="mt-4 text-sm leading-6 text-zinc-600">{cleaner.description}</p><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-zinc-400">Pickup radius</dt><dd className="font-bold">{cleaner.pickup_radius_km} km</dd></div><div><dt className="text-zinc-400">Delivery radius</dt><dd className="font-bold">{cleaner.delivery_radius_km} km</dd></div><div><dt className="text-zinc-400">Coordinates</dt><dd className="font-bold">{cleaner.latitude !== null ? `${cleaner.latitude}, ${cleaner.longitude}` : "Not supplied"}</dd></div><div><dt className="text-zinc-400">Submitted</dt><dd className="font-bold">{cleaner.submitted_at || "Not submitted"}</dd></div></dl></section>
        <section className="surface panel"><h2 className="section-title">Identity and payout</h2><dl className="mt-4 grid gap-4 text-sm"><div><dt className="text-zinc-400">Identity</dt><dd className="font-bold">{verification?.identity_type?.replaceAll("_", " ") || "Missing"} · {masked(verification?.identity_number_encrypted ?? null)}</dd></div><div><dt className="text-zinc-400">Business registration</dt><dd className="font-bold">{verification?.business_registration_number || "Not supplied"}</dd></div><div><dt className="text-zinc-400">Payout account</dt><dd className="font-bold">{verification?.bank_name || "Missing"} · {verification?.bank_account_name || ""} · {masked(verification?.bank_account_number_encrypted ?? null)}</dd></div><div className="flex flex-wrap gap-2">{identityDocument && <Link className="btn-secondary" href={`/api/vendor-files/${identityDocument.id}`}><Download size={16} />Identity document</Link>}{businessDocument && <Link className="btn-secondary" href={`/api/vendor-files/${businessDocument.id}`}><Download size={16} />Business document</Link>}</div></dl></section></div>
      <section className="surface mt-5 overflow-x-auto"><table className="data-table"><thead><tr><th>Service</th><th>Category</th><th>Price</th><th>Turnaround</th><th>Express</th><th>State</th></tr></thead><tbody>{services.map((service) => <tr key={service.id}><td className="font-bold text-brand-navy">{service.name}</td><td>{service.category}</td><td>{money(service.price)} / {service.unit.replaceAll("_", " ")}</td><td>{service.turnaround_time}</td><td>{service.express_available ? "Yes" : "No"}</td><td>{service.is_active ? "Active" : "Inactive"}</td></tr>)}</tbody></table></section>
      <section className="surface mt-5 p-5"><h2 className="font-extrabold text-brand-navy">Marketplace eligibility</h2><div className="mt-3 flex flex-wrap gap-2"><span className={`badge ${eligibility?.adminApproved ? "border-teal-200 bg-teal-50 text-teal-700" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>Verification {eligibility?.adminApproved ? "approved" : "not approved"}</span><span className={`badge ${eligibility?.publicProfile ? "border-blue-200 bg-blue-50 text-blue-700" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>{eligibility?.publicProfile ? "Public profile" : "Not published"}</span><span className={`badge ${eligibility?.bookable ? "border-teal-200 bg-teal-50 text-teal-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{eligibility?.bookable ? "Bookable" : "Not bookable"}</span>{cleaner.is_suspended ? <span className="badge border-rose-200 bg-rose-50 text-rose-700">Suspended</span> : null}</div>{eligibilityIssues.length ? <p className="mt-3 text-sm text-zinc-600">{eligibilityIssues[0]}</p> : null}</section>
      {cleaner.verification_status === "pending" && <section className="mt-5 flex flex-wrap items-center justify-between gap-4 border-y border-zinc-200 bg-white p-5"><div><h2 className="font-extrabold text-brand-navy">Verification decision</h2><p className="mt-1 text-sm text-zinc-500">Approval confirms verification only. The vendor must publish the profile and enable orders separately.</p></div><div className="flex flex-wrap gap-2"><form action={setCleanerApprovalAction}><input type="hidden" name="cleaner_id" value={cleaner.id} /><input type="hidden" name="approved" value="0" /><button className="btn-danger"><X size={17} />Request changes</button></form><form action={setCleanerApprovalAction}><input type="hidden" name="cleaner_id" value={cleaner.id} /><input type="hidden" name="approved" value="1" /><button className="btn-primary"><Check size={17} />Approve verification</button></form></div></section>}
      {cleaner.verification_status === "approved" && <section className="mt-5 flex flex-wrap items-center justify-between gap-4 border-y border-zinc-200 bg-white p-5"><div><h2 className="font-extrabold text-brand-navy">Marketplace safety</h2><p className="mt-1 text-sm text-zinc-500">Suspension blocks new bookings without deleting or hiding existing order history.</p></div><form action={setCleanerSuspensionAction}><input type="hidden" name="cleaner_id" value={cleaner.id} /><input type="hidden" name="suspended" value={cleaner.is_suspended ? "0" : "1"} /><button className={cleaner.is_suspended ? "btn-secondary" : "btn-danger"}><ShieldAlert size={17} />{cleaner.is_suspended ? "Lift suspension" : "Suspend vendor"}</button></form></section>}
    </div>
  );
}
