import { redirect } from "next/navigation";
import { dashboardForRole, requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser(undefined, { returnTo: "/dashboard" });
  redirect(dashboardForRole(user.role));
}

