export type VendorEligibility = {
  cleanerId: number;
  businessComplete: boolean;
  locationValid: boolean;
  verificationComplete: boolean;
  adminApproved: boolean;
  activeServiceCount: number;
  isPublished: boolean;
  isAcceptingOrders: boolean;
  isSuspended: boolean;
  publicationEligible: boolean;
  publicProfile: boolean;
  bookingRequirementsMet: boolean;
  bookable: boolean;
};

export function vendorEligibilityIssues(eligibility: VendorEligibility) {
  const issues: string[] = [];
  if (!eligibility.businessComplete) issues.push("Complete the required business information and branding.");
  if (!eligibility.locationValid) issues.push("Complete a valid business location and service radius.");
  if (!eligibility.verificationComplete) issues.push("Complete the required account, business, identity, and payout verification.");
  if (!eligibility.adminApproved) issues.push("Administrative verification approval is required.");
  if (eligibility.activeServiceCount < 1) issues.push("Activate at least one correctly priced service.");
  if (eligibility.isSuspended) issues.push("The business is suspended from the marketplace.");
  if (!eligibility.isPublished) issues.push("Publish the business profile to the marketplace.");
  if (!eligibility.isAcceptingOrders) issues.push("Enable new order acceptance.");
  return issues;
}

export function showPublicBookingAction(eligibility: VendorEligibility) {
  return eligibility.publicProfile && eligibility.bookable;
}

export function publicAvailabilityMessage(eligibility: VendorEligibility) {
  if (showPublicBookingAction(eligibility)) return null;
  if (eligibility.activeServiceCount < 1) {
    return "This cleaner is updating its services and is not accepting bookings right now.";
  }
  return "This cleaner is currently unavailable for new orders. You can review the profile and check back later.";
}
