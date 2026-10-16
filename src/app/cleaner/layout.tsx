import type { ReactNode } from "react";
import { VendorWorkspaceNav } from "@/components/vendor-workspace-nav";

export default function CleanerLayout({ children }: { children: ReactNode }) {
  return <><div className="shell pt-5"><VendorWorkspaceNav /></div>{children}</>;
}
