import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div className="page flex flex-1 items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm font-semibold text-brand-navy">
        <LoaderCircle aria-hidden="true" className="animate-spin text-brand-blue" size={22} />
        <span>Loading LaundryLink</span>
      </div>
    </div>
  );
}
