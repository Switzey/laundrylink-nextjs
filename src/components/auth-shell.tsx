import type { ReactNode } from "react";
import { CheckCircle2, ShieldCheck, Shirt, Sparkles, Truck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  variant?: "login" | "register" | "recovery";
};

const visuals = {
  login: {
    eyebrow: "WELCOME BACK",
    headline: "Laundry day, beautifully handled.",
    supporting: "Your favourite cleaners, easy bookings and every order update—all in one place.",
  },
  register: {
    eyebrow: "JOIN THE LAUNDRY UPGRADE",
    headline: "A fresher life starts here.",
    supporting: "Discover a simpler way to book trusted local laundry services.",
  },
  recovery: {
    eyebrow: "ACCOUNT SECURITY",
    headline: "You're in good hands.",
    supporting: "A secure, straightforward way to get back into your LaundryLink account.",
  },
} as const;

export function AuthShell({ title, description, children, variant = "login" }: AuthShellProps) {
  const visual = visuals[variant];

  return (
    <section className="ll-auth-stage" aria-label={title}>
      <div className="ll-auth-grid">
        <aside className="ll-auth-hero">
          <div className="ll-auth-logo">
            <BrandLogo />
          </div>

          <div className="ll-auth-hero-copy">
            <div className="ll-auth-eyebrow"><Sparkles size={14} aria-hidden="true" />{visual.eyebrow}</div>
            <h2>{visual.headline}</h2>
            <p>{visual.supporting}</p>
          </div>

          <div className="ll-auth-art" aria-hidden="true">
            <div className="ll-auth-orbit ll-auth-orbit-one" />
            <div className="ll-auth-orbit ll-auth-orbit-two" />
            <div className="ll-auth-art-card">
              <div className="ll-auth-art-shirt"><Shirt size={76} strokeWidth={1.35} /></div>
              <span className="ll-auth-art-spark"><Sparkles size={22} /></span>
              <span className="ll-auth-art-caption"><CheckCircle2 size={17} /> Freshly taken care of</span>
            </div>
          </div>

          <div className="ll-auth-points">
            <span><ShieldCheck size={17} aria-hidden="true" /> Trusted cleaners</span>
            <span><Truck size={17} aria-hidden="true" /> Pickup & delivery</span>
          </div>
        </aside>

        <div className="ll-auth-panel">
          <div className="ll-auth-panel-top">
            <span className="ll-auth-step">LAUNDRYLINK ACCOUNT</span>
            <span className="ll-auth-secure"><ShieldCheck size={15} aria-hidden="true" /> Secure access</span>
          </div>
          <div className="ll-auth-panel-heading">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
