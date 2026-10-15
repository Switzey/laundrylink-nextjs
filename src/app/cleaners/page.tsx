import type { Metadata } from "next";
import { MarketplaceDirectory } from "@/components/marketplace-directory";
import type { MarketplaceSearchParams } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Find laundry near you",
  description: "Compare verified laundry services by location, price, rating, turnaround time, pickup, delivery, and express availability.",
  alternates: { canonical: "/cleaners" },
};

export default async function CleanersPage({ searchParams }: { searchParams: Promise<MarketplaceSearchParams> }) {
  return <MarketplaceDirectory searchParams={await searchParams} />;
}
