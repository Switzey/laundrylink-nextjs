import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/public-info-page";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return <PublicInfoPage eyebrow="Legal" title="Terms of service" intro="These terms explain the basic rules for using the LaundryLink marketplace. Last updated 15 October 2026." sections={[
    { title: "Marketplace role", paragraphs: ["LaundryLink connects customers with independently operated laundry businesses. Vendors are responsible for the services, prices, operating information, and care they provide, subject to LaundryLink marketplace policies."] },
    { title: "Accounts and access", items: ["Provide accurate registration and contact information.", "Keep credentials and verification codes private.", "Use only the permissions assigned to your role.", "Notify support promptly if you suspect unauthorized access."] },
    { title: "Bookings and prices", paragraphs: ["Displayed prices are based on current vendor services. Final totals depend on selected quantities, applicable fees, and any authorized order adjustments shown before payment."] },
    { title: "Acceptable use", items: ["Do not misuse accounts, APIs, vendor files, reviews, or personal information.", "Do not attempt to bypass authorization, rate limits, verification, or marketplace eligibility rules.", "Do not submit unlawful, fraudulent, or misleading content."] },
    { title: "Changes and availability", paragraphs: ["Features, coverage, and vendor availability may change as LaundryLink develops. Material changes to these terms will be reflected on this page."] },
  ]} />;
}
