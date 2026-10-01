import Link from "next/link";
import { Bell, LayoutDashboard, LogIn, Menu, ShoppingBag, UserRound } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser, dashboardForRole } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";
import { ADMIN_ROLES, LOGISTICS_ROLES, VENDOR_MANAGEMENT_ROLES } from "@/lib/types";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
      <div className="shell flex h-18 items-center justify-between gap-5">
        <BrandLogo compact />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          <Link className="nav-link" href="/cleaners">Find a cleaner</Link>
          {user && <Link className="nav-link" href={dashboardForRole(user.role)}>Dashboard</Link>}
          {user?.role === "CUSTOMER" && <Link className="nav-link" href="/orders/new">Book laundry</Link>}
          {user && VENDOR_MANAGEMENT_ROLES.includes(user.role) && <Link className="nav-link" href="/cleaner/services">Services</Link>}
          {user && LOGISTICS_ROLES.includes(user.role) && <Link className="nav-link" href="/admin/logistics">Logistics</Link>}
          {user && ADMIN_ROLES.includes(user.role) && <Link className="nav-link" href="/admin/reports">Reports</Link>}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? <>
            <Link className="icon-button" href="/notifications" aria-label="Notifications"><Bell size={18} /></Link>
            <Link className="btn-secondary" href="/profile"><UserRound size={17} />{user.name.split(" ")[0]}</Link>
            <form action={logoutAction}><button className="btn-ghost" type="submit">Sign out</button></form>
          </> : <>
            <Link className="btn-ghost" href="/login"><LogIn size={17} />Sign in</Link>
            <Link className="btn-primary" href="/register">Create account</Link>
          </>}
        </div>
        <details className="relative md:hidden">
          <summary className="icon-button list-none"><Menu size={21} /><span className="sr-only">Open menu</span></summary>
          <div className="absolute right-0 mt-3 w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow-xl">
            <Link className="mobile-link" href="/cleaners"><ShoppingBag size={17} />Find a cleaner</Link>
            {user ? <>
              <Link className="mobile-link" href={dashboardForRole(user.role)}><LayoutDashboard size={17} />Dashboard</Link>
              <Link className="mobile-link" href="/notifications"><Bell size={17} />Notifications</Link>
              <Link className="mobile-link" href="/profile"><UserRound size={17} />Profile</Link>
              <form action={logoutAction}><button className="mobile-link w-full" type="submit">Sign out</button></form>
            </> : <>
              <Link className="mobile-link" href="/login">Sign in</Link>
              <Link className="mobile-link" href="/register">Create account</Link>
            </>}
          </div>
        </details>
      </div>
    </header>
  );
}

