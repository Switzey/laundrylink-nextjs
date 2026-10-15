import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/public-info-page";

export const metadata: Metadata = { title: "Cancellation rules" };

export default function CancellationPage() {
  return <PublicInfoPage eyebrow="Bookings" title="Cancellation and rescheduling" intro="These rules set clear expectations when plans change. Specific vendor terms shown during booking may add stricter requirements." sections={[
    { title: "Before pickup", paragraphs: ["Request cancellation or rescheduling as early as possible through the order page or support. Changes remain subject to the cleaner's schedule and confirmation."] },
    { title: "After acceptance or pickup", paragraphs: ["Once a cleaner has accepted, travelled, collected items, or started work, delivery, handling, or completed-service charges may apply. Support will review the order activity when resolving a dispute."] },
    { title: "Vendor cancellations", paragraphs: ["If a vendor cannot fulfil an accepted order, it must update the order promptly and cooperate on return or reassignment. Pausing a vendor does not delete existing orders."] },
    { title: "Refund timing", paragraphs: ["Approved refunds depend on the original payment method and provider processing time. A cancellation request is not a completed refund until the payment status confirms it."] },
  ]} />;
}
