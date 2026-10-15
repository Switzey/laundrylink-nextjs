import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/public-info-page";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return <PublicInfoPage eyebrow="Legal" title="Privacy notice" intro="This notice describes how LaundryLink uses account, booking, vendor, and early-access information. Last updated 15 October 2026." sections={[
    { title: "Information we collect", items: ["Account identity and contact details.", "Saved addresses, booking details, care notes, and order activity.", "Vendor business, verification, service, location, document, and payout details.", "Security information such as session, request, and audit records.", "Waitlist location and contact details that you submit."] },
    { title: "How we use information", items: ["Provide discovery, booking, delivery, support, and account services.", "Verify vendors and enforce marketplace eligibility.", "Secure accounts, prevent abuse, and investigate incidents.", "Notify waitlist members about relevant city launches."] },
    { title: "Sharing and access", paragraphs: ["Information is shared only as needed for marketplace operations, service providers, legal obligations, and authorized support. Sensitive vendor documents are protected by server-side role and ownership checks."] },
    { title: "Retention and choices", paragraphs: ["We retain information for operational, security, legal, and dispute-resolution needs. Contact support to ask about account information, correction, or applicable deletion rights."] },
    { title: "Security", paragraphs: ["LaundryLink uses secure session cookies, server-side authorization, validation, rate limiting, password hashing, audit logging, and restricted file access. No online service can promise absolute security."] },
  ]} />;
}
