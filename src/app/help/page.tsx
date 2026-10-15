import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/public-info-page";

export const metadata: Metadata = { title: "Help and FAQs", description: "Answers about booking, pricing, pickup, delivery, vendor verification, and LaundryLink accounts." };

export default function HelpPage() {
  return <PublicInfoPage eyebrow="Help centre" title="Frequently asked questions" intro="Quick answers about discovering cleaners, placing orders, and managing a LaundryLink account." action={{ href: "/contact", label: "Contact support" }} sections={[
    { title: "Can I compare prices before signing up?", paragraphs: ["Yes. Guest browsing includes active service prices, ratings, turnaround times, coverage, and vendor availability. You only need to sign in when continuing to checkout."] },
    { title: "How are vendors verified?", paragraphs: ["LaundryLink reviews required identity, business, contact, service, location, and payout information. Approval does not automatically make a business bookable; it must also publish its profile, activate valid services, and accept orders."] },
    { title: "What determines my final price?", paragraphs: ["Your total is based on current service prices and quantities, plus the displayed delivery and platform fees. The server recalculates the amount when the order is submitted."] },
    { title: "What happens if a cleaner pauses bookings?", paragraphs: ["The cleaner remains visible according to marketplace rules, but new booking controls are disabled. Existing order histories are preserved and must be handled explicitly by authorized staff."] },
    { title: "Do I need separate customer and vendor accounts?", paragraphs: ["No. LaundryLink uses one identity system with role-based permissions. Vendor owners can complete business onboarding from the same secure authentication system."] },
  ]} />;
}
