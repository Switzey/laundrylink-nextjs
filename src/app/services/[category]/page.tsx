import type { Metadata } from "next";
import { MarketplaceDirectory } from "@/components/marketplace-directory";
import { marketplaceLabel } from "@/lib/marketplace-slugs";
import type { MarketplaceSearchParams } from "@/lib/marketplace";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const category = marketplaceLabel((await params).category);
  return {
    title: `${category} services near you`,
    description: `Compare verified ${category.toLocaleLowerCase()} services, prices, ratings, pickup coverage, and turnaround times on LaundryLink.`,
  };
}

export default async function ServiceCategoryPage({ params, searchParams }: { params: Promise<{ category: string }>; searchParams: Promise<MarketplaceSearchParams> }) {
  const category = marketplaceLabel((await params).category);
  return <MarketplaceDirectory searchParams={await searchParams} preset={{ category }} eyebrow="Browse by service" title={`${category} near you`} description={`Compare verified businesses offering ${category.toLocaleLowerCase()}, including prices, ratings, express options, and delivery coverage.`} />;
}
