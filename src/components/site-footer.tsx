import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

const groups = [
  { title: "Discover", links: [["Find cleaners", "/cleaners"], ["How it works", "/how-it-works"], ["Early access", "/waitlist"]] },
  { title: "Businesses", links: [["Join LaundryLink", "/vendor-registration"], ["Create vendor account", "/register?role=VENDOR_OWNER"], ["Vendor waitlist", "/waitlist?audience=vendor"]] },
  { title: "Support", links: [["Help and FAQs", "/help"], ["Contact", "/contact"], ["Cancellation rules", "/cancellation"]] },
  { title: "Legal", links: [["Terms", "/terms"], ["Privacy", "/privacy"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="shell grid gap-9 py-10 lg:grid-cols-[1.1fr_1.9fr]">
        <div><BrandLogo compact /><p className="mt-3 max-w-xs text-sm leading-6 text-zinc-600">Clean. Reliable. Convenient. Connected.</p><p className="mt-5 text-xs text-zinc-600">LaundryLink helps customers compare and book verified local laundry care.</p></div>
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4">{groups.map((group) => <div key={group.title}><h2 className="text-sm font-bold text-brand-navy">{group.title}</h2><div className="mt-3 grid gap-2">{group.links.map(([label, href]) => <Link href={href} className="text-sm text-zinc-600 hover:text-brand-blue" key={href}>{label}</Link>)}</div></div>)}</div>
      </div>
      <div className="border-t border-zinc-100"><div className="shell py-4 text-xs text-zinc-600">© {new Date().getFullYear()} LaundryLink. All rights reserved.</div></div>
    </footer>
  );
}
