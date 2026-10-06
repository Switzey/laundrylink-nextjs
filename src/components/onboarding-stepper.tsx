import Link from "next/link";
import { Building2, Check, FileCheck2, ListChecks, MapPin, ShieldCheck } from "lucide-react";

export const ONBOARDING_STEPS = [
  { key: "business", label: "Business", icon: Building2 },
  { key: "location", label: "Location", icon: MapPin },
  { key: "services", label: "Services", icon: ListChecks },
  { key: "verification", label: "Verification", icon: ShieldCheck },
  { key: "review", label: "Review", icon: FileCheck2 },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["key"];

export function OnboardingStepper({ current, completedThrough }: { current: OnboardingStep; completedThrough: OnboardingStep }) {
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === current);
  const completedIndex = ONBOARDING_STEPS.findIndex((step) => step.key === completedThrough);
  return (
    <nav aria-label="Vendor onboarding progress" className="mb-7 overflow-x-auto pb-1">
      <ol className="grid min-w-[680px] grid-cols-5 border-b border-zinc-200">
        {ONBOARDING_STEPS.map((step, index) => {
          const Icon = step.icon;
          const active = index === currentIndex;
          const complete = index < completedIndex || (completedThrough === "review" && index < 4);
          return (
            <li key={step.key} className={`relative border-b-2 ${active ? "border-brand-blue" : "border-transparent"}`}>
              <Link className={`flex items-center justify-center gap-2 px-3 py-3 text-sm font-bold ${active ? "text-brand-blue" : "text-zinc-500 hover:text-brand-navy"}`} href={`/cleaner/onboarding?step=${step.key}`} aria-current={active ? "step" : undefined}>
                <span className={`grid h-7 w-7 place-items-center rounded-full border ${complete ? "border-teal-600 bg-teal-600 text-white" : active ? "border-blue-200 bg-blue-50 text-brand-blue" : "border-zinc-200 bg-white"}`}>
                  {complete ? <Check size={14} /> : <Icon size={14} />}
                </span>
                {step.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
