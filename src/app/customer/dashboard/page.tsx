import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, Bell, CalendarDays, CheckCircle2, ChevronRight, Clock3, CreditCard,
  Heart, MapPin, PackageCheck, Search, Shirt, Sparkles, Truck, UserRound,
  WandSparkles,
} from "lucide-react";
import { CustomerAccountNav } from "@/components/customer-account-nav";
import { requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { dateLabel, money } from "@/lib/format";
import type { OrderSummary } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Customer dashboard" };

const services = [
  { title: "Wash & fold", detail: "Everyday essentials", icon: Shirt, href: "/services/washing", tone: "blue" },
  { title: "Dry cleaning", detail: "Delicate garment care", icon: Sparkles, href: "/services/dry-cleaning", tone: "mint" },
  { title: "Ironing", detail: "Ready to wear", icon: WandSparkles, href: "/services/ironing", tone: "sky" },
] as const;

export default async function CustomerDashboard() {
  const user = await requireUser("CUSTOMER", { returnTo: "/customer/dashboard" });
  const [orders, metrics, unread] = await Promise.all([
    all<OrderSummary>(`SELECT o.*, c.business_name FROM orders o JOIN cleaners c ON c.id = o.cleaner_id WHERE o.customer_id = ? ORDER BY o.created_at DESC LIMIT 5`, user.id),
    one<{ active: number; upcoming: number; pending_payments: number }>(`SELECT
      SUM(CASE WHEN status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status NOT IN ('completed', 'cancelled') AND pickup_date >= date('now') THEN 1 ELSE 0 END) AS upcoming,
      SUM(CASE WHEN status <> 'cancelled' AND payment_status IN ('unpaid', 'pending', 'failed') THEN 1 ELSE 0 END) AS pending_payments
      FROM orders WHERE customer_id = ?`, user.id),
    one<{ count: number }>("SELECT COUNT(1) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL", user.id),
  ]);

  const firstName = user.name.split(" ")[0];
  const stats = [
    { label: "Active orders", value: Number(metrics?.active ?? 0), icon: PackageCheck, href: "/customer/orders?status=active" },
    { label: "Upcoming pickups", value: Number(metrics?.upcoming ?? 0), icon: CalendarDays, href: "/customer/orders?status=active" },
    { label: "Pending payments", value: Number(metrics?.pending_payments ?? 0), icon: CreditCard, href: "/customer/orders" },
    { label: "Notifications", value: Number(unread?.count ?? 0), icon: Bell, href: "/notifications" },
  ];

  return (
    <div className="ll-customer-page">
      <div className="ll-customer-wrap">
        <header className="ll-customer-greeting">
          <div>
            <p className="ll-customer-eyebrow"><MapPin size={14} aria-hidden="true" /> Your laundry, your way</p>
            <h1>Good to see you, {firstName} <span aria-hidden="true">👋</span></h1>
            <p>Let&apos;s take laundry off your to-do list.</p>
          </div>
          <Link href="/notifications" className="ll-customer-notification" aria-label={`Notifications (${Number(unread?.count ?? 0)} unread)`}>
            <Bell size={21} aria-hidden="true" />
            {Number(unread?.count ?? 0) > 0 && <span className="ll-notification-indicator" aria-hidden="true" />}
          </Link>
        </header>

        <section className="ll-customer-hero" aria-labelledby="customer-hero-heading">
          <div className="ll-customer-hero-copy">
            <span className="ll-customer-hero-tag"><Sparkles size={14} aria-hidden="true" /> PICKUP & DELIVERY MADE EASY</span>
            <h2 id="customer-hero-heading">Leave the laundry <span>to us.</span></h2>
            <p>Find trusted local cleaners and book a convenient pickup in just a few steps.</p>
            <Link href="/orders/new" className="ll-customer-hero-button">Book a pickup <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
          <div className="ll-customer-hero-art" aria-hidden="true">
            <span className="ll-customer-hero-orbit" />
            <span className="ll-customer-hero-garment"><Shirt size={120} strokeWidth={1.25} /></span>
            <span className="ll-customer-hero-spark"><Sparkles size={26} /></span>
            <span className="ll-customer-hero-tick"><CheckCircle2 size={21} /></span>
          </div>
        </section>

        <div className="ll-customer-quick-search">
          <Search size={19} aria-hidden="true" />
          <span>Looking for a cleaner near you?</span>
          <Link href="/cleaners">Explore cleaners <ChevronRight size={17} aria-hidden="true" /></Link>
        </div>

        <section className="ll-customer-section" aria-labelledby="customer-services-heading">
          <div className="ll-customer-section-heading">
            <div><span className="ll-customer-kicker">HOW CAN WE HELP?</span><h2 id="customer-services-heading">Choose a service</h2></div>
            <Link href="/cleaners">See all <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className="ll-service-grid">
            {services.map(({ title, detail, icon: Icon, href, tone }) => (
              <Link href={href} key={title} className={`ll-service-card ll-service-${tone}`}>
                <span className="ll-service-icon"><Icon size={30} strokeWidth={1.8} aria-hidden="true" /></span>
                <strong>{title}</strong>
                <span className="ll-service-description">{detail}</span>
                <span className="ll-service-arrow"><ArrowRight size={17} aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="ll-customer-section" aria-labelledby="customer-activity-heading">
          <div className="ll-customer-section-heading">
            <div><span className="ll-customer-kicker">AT A GLANCE</span><h2 id="customer-activity-heading">Your laundry activity</h2></div>
          </div>
          <div className="ll-customer-stats">
            {stats.map(({ label, value, icon: Icon, href }) => (
              <Link className="ll-customer-stat" href={href} key={label}>
                <span className="ll-customer-stat-icon"><Icon size={20} aria-hidden="true" /></span>
                <span className="ll-customer-stat-value">{value}</span>
                <span className="ll-customer-stat-label">{label}</span>
                <ArrowRight className="ll-customer-stat-arrow" size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section className="ll-customer-section" aria-labelledby="customer-orders-heading">
          <div className="ll-customer-section-heading">
            <div><span className="ll-customer-kicker">YOUR JOURNEY</span><h2 id="customer-orders-heading">Recent orders</h2></div>
            <Link href="/customer/orders">View all <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className="ll-customer-order-list">
            {orders.length ? orders.map((order) => (
              <Link href={`/orders/${order.id}`} key={order.id} className="ll-customer-order">
                <span className="ll-customer-order-icon"><Truck size={22} aria-hidden="true" /></span>
                <span className="ll-customer-order-body">
                  <strong>{order.business_name}</strong>
                  <span>Order #{order.id} · {dateLabel(order.pickup_date)} {order.pickup_time_window ? `· ${order.pickup_time_window}` : ""}</span>
                </span>
                <span className="ll-customer-order-trailing"><StatusBadge status={order.status} /><strong>{money(order.total)}</strong></span>
                <ChevronRight className="ll-customer-order-chevron" size={19} aria-hidden="true" />
              </Link>
            )) : (
              <div className="ll-customer-order-empty">
                <PackageCheck size={32} aria-hidden="true" />
                <h3>No orders yet</h3>
                <p>Your first laundry booking is just a few taps away.</p>
                <Link href="/cleaners">Discover cleaners <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            )}
          </div>
        </section>

        <div className="ll-customer-bottom">
          <div className="ll-customer-bottom-copy"><Heart size={20} aria-hidden="true" /><span>More living. Less laundry.</span></div>
          <CustomerAccountNav />
        </div>
      </div>
      <nav className="ll-customer-mobile-nav" aria-label="Customer main navigation">
        <Link href="/customer/dashboard" aria-current="page"><PackageCheck size={20} aria-hidden="true" />Home</Link>
        <Link href="/cleaners"><Search size={20} aria-hidden="true" />Explore</Link>
        <Link href="/customer/orders"><Clock3 size={20} aria-hidden="true" />Orders</Link>
        <Link href="/profile"><UserRound size={20} aria-hidden="true" />Profile</Link>
      </nav>
    </div>
  );
}
