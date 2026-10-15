import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/cleaner/", "/customer/", "/orders/", "/profile", "/notifications", "/api/"] },
    sitemap: "https://www.laundrylink.com.ng/sitemap.xml",
  };
}
