import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="page flex flex-1 items-center justify-center py-10 sm:py-14">
      <div className="surface w-full max-w-md p-6 sm:p-9">
        <BrandLogo />
        <div className="mt-8">
          <h1 className="text-2xl font-bold text-brand-navy">{title}</h1>
          <p className="mt-1.5 text-sm leading-6 text-zinc-500">{description}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
