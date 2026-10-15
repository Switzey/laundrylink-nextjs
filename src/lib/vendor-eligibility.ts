import "server-only";

import { now, one, run } from "@/lib/db";
import type { VendorEligibility } from "@/lib/vendor-eligibility-model";

type VendorEligibilityRow = {
  cleaner_id: number;
  business_complete: number;
  location_valid: number;
  verification_complete: number;
  admin_approved: number;
  active_service_count: number;
  is_published: number;
  is_accepting_orders: number;
  is_suspended: number;
  publication_eligible: number;
  public_profile: number;
  booking_requirements_met: number;
  bookable: number;
};

function boolean(value: number) {
  return Number(value) === 1;
}

function mapEligibility(row: VendorEligibilityRow): VendorEligibility {
  return {
    cleanerId: Number(row.cleaner_id),
    businessComplete: boolean(row.business_complete),
    locationValid: boolean(row.location_valid),
    verificationComplete: boolean(row.verification_complete),
    adminApproved: boolean(row.admin_approved),
    activeServiceCount: Number(row.active_service_count),
    isPublished: boolean(row.is_published),
    isAcceptingOrders: boolean(row.is_accepting_orders),
    isSuspended: boolean(row.is_suspended),
    publicationEligible: boolean(row.publication_eligible),
    publicProfile: boolean(row.public_profile),
    bookingRequirementsMet: boolean(row.booking_requirements_met),
    bookable: boolean(row.bookable),
  };
}

export async function getVendorEligibility(cleanerId: number) {
  const row = await one<VendorEligibilityRow>(
    "SELECT * FROM vendor_eligibility WHERE cleaner_id = ?",
    cleanerId,
  );
  return row ? mapEligibility(row) : null;
}

export async function pauseVendorWhenIneligible(cleanerId: number) {
  const eligibility = await getVendorEligibility(cleanerId);
  if (eligibility?.isAcceptingOrders && !eligibility.bookingRequirementsMet) {
    await run("UPDATE cleaners SET is_available = 0, updated_at = ? WHERE id = ?", now(), cleanerId);
    return getVendorEligibility(cleanerId);
  }
  return eligibility;
}
