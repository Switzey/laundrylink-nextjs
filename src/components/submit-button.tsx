"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingLabel, className = "btn-primary w-full" }: { children: React.ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-disabled={pending}>
      {pending && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />}
      {pending ? pendingLabel : children}
    </button>
  );
}
