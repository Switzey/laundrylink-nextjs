import type { Metadata } from "next";
import { MarketplaceDirectory } from "@/components/marketplace-directory";
import { marketplaceLabel } from "@/lib/marketplace-slugs";
import type { MarketplaceSearchParams } from "@/lib/marketplace";

export async function generateMetadata({ params }: { params: Promise<{ state: string; city: string }> }): Promise<Metadata> {
  const { state, city } = await params;
  const stateName = marketplaceLabel(state);
  const cityName = marketplaceLabel(city);
  return {
    title: `Laundry services in ${cityName}, ${stateName}`,
    description: `Find and compare verified laundry pickup and delivery services in ${cityName}, ${stateName}. See prices, ratings, services, and turnaround times.`,
  };
}

export default async function LocationPage({ params, searchParams }: { params: Promise<{ state: string; city: string }>; searchParams: Promise<MarketplaceSearchParams> }) {
  const { state, city } = await params;
  const stateName = marketplaceLabel(state);
  const cityName = marketplaceLabel(city);
  return <MarketplaceDirectory searchParams={await searchParams} preset={{ state: stateName, city: cityName }} eyebrow="Laundry near you" title={`Laundry services in ${cityName}`} description={`Compare verified pickup and delivery businesses serving ${cityName}, ${stateName}.`} />;
}
