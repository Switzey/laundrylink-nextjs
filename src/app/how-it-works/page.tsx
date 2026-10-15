import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/public-info-page";

export const metadata: Metadata = { title: "How LaundryLink works", description: "Learn how to compare cleaners, schedule laundry pickup, and track delivery with LaundryLink." };

export default function HowItWorksPage() {
  return <PublicInfoPage eyebrow="How it works" title="From laundry basket to fresh delivery" intro="LaundryLink gives you one reliable place to compare local cleaners, schedule service, and follow the work." action={{ href: "/cleaners", label: "Find a cleaner" }} sections={[
    { title: "1. Find the right cleaner", paragraphs: ["Search by city, neighbourhood, service, or your device location. Compare verified businesses by starting price, customer rating, turnaround, and pickup coverage before creating an account."] },
    { title: "2. Build your order", paragraphs: ["Choose a cleaner, select active services and quantities, then provide pickup and delivery details. LaundryLink calculates service totals on the server using the vendor's current prices."] },
    { title: "3. Schedule pickup", paragraphs: ["Choose an available pickup date and time window. Add care notes for stains, delicate garments, access instructions, or other handling details."] },
    { title: "4. Track every handoff", paragraphs: ["Follow status updates as the vendor accepts, collects, cleans, prepares, and returns your order. Your order history remains available in your customer workspace."] },
    { title: "5. Review completed care", paragraphs: ["After a completed order, share a rating and review. Reviews are tied to real LaundryLink orders to keep marketplace feedback useful."] },
  ]} />;
}
