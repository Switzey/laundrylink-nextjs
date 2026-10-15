import Link from "next/link";
import { Bell, ChartNoAxesCombined, Heart, MapPin, PackageSearch, ReceiptText, Settings2, LifeBuoy } from "lucide-react";

const links = [
  ["Orders", "/customer/orders", PackageSearch],
  ["Addresses", "/customer/addresses", MapPin],
  ["Favourites", "/customer/favourites", Heart],
  ["Preferences", "/customer/preferences", Settings2],
  ["Receipts", "/customer/receipts", ReceiptText],
  ["Spending", "/customer/spending", ChartNoAxesCombined],
  ["Support", "/customer/support", LifeBuoy],
  ["Notifications", "/notifications", Bell],
] as const;

export function CustomerAccountNav() {
  return (
    <nav className="mb-7 flex gap-2 overflow-x-auto border-b border-zinc-200 pb-3" aria-label="Customer account">
      {links.map(([label, href, Icon]) => (
        <Link className="btn-secondary shrink-0" href={href} key={href}><Icon size={16} />{label}</Link>
      ))}
    </nav>
  );
}
