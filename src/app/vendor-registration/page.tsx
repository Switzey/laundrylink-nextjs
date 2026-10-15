import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/public-info-page";

export const metadata: Metadata = { title: "Register your laundry business", description: "Apply to list a verified laundry business on LaundryLink." };

export default function VendorRegistrationPage() {
  return <PublicInfoPage eyebrow="For laundry businesses" title="Grow with LaundryLink" intro="Create one secure account, complete business verification, publish active services, and reach customers in your coverage area." action={{ href: "/register?role=VENDOR_OWNER", label: "Start vendor registration" }} sections={[
    { title: "What you will provide", items: ["Business and contact information.", "Business location, service area, and coverage radii.", "Active services with accurate prices and turnaround times.", "Identity, business, phone, and payout information where required.", "A business logo and cover image."] },
    { title: "Verification before publication", paragraphs: ["Submitting an application does not automatically publish your business. LaundryLink reviews the required information first. Approval and publication are separate, and booking only becomes available when every eligibility condition is met."] },
    { title: "Control your availability", paragraphs: ["Approved businesses can manage services, operating information, publication, and whether they are accepting new orders. Pausing new bookings preserves existing order histories."] },
    { title: "Not supported in your city?", paragraphs: ["Join the vendor early-access list and tell us where you operate. We use local customer and vendor interest to prioritize expansion."] },
  ]} />;
}
