import Link from "next/link";
import { BarChart3, BriefcaseBusiness, Building2, LayoutDashboard, Megaphone, Settings2, Shirt, UsersRound } from "lucide-react";

const links = [
  ["Overview", "/cleaner/dashboard", LayoutDashboard],
  ["Orders", "/cleaner/orders", Shirt],
  ["Operations", "/cleaner/operations", Settings2],
  ["Team & branches", "/cleaner/team", UsersRound],
  ["Services", "/cleaner/services", BriefcaseBusiness],
  ["Finance", "/cleaner/finance", BarChart3],
  ["Growth", "/cleaner/growth", Megaphone],
  ["Profile", "/cleaner/profile", Building2],
] as const;

export function VendorWorkspaceNav() {
  return <nav className="mb-7 flex gap-2 overflow-x-auto border-b border-zinc-200 pb-3" aria-label="Vendor workspace">
    {links.map(([label, href, Icon]) => <Link className="btn-ghost shrink-0" href={href} key={href}><Icon size={16} />{label}</Link>)}
  </nav>;
}
