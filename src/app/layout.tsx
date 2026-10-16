import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.laundrylink.com.ng"),
  title: { default: "LaundryLink", template: "%s | LaundryLink" },
  description: "Find, compare, and book verified local laundry care with pickup, delivery, clear pricing, and live order tracking.",
  applicationName: "LaundryLink",
  keywords: ["laundry service", "laundry pickup", "dry cleaning", "laundry delivery", "Nigeria"],
  openGraph: {
    type: "website",
    siteName: "LaundryLink",
    title: "LaundryLink",
    description: "Find and compare verified laundry pickup and delivery near you.",
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "LaundryLink", description: "Find and compare verified laundry pickup and delivery near you." },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
