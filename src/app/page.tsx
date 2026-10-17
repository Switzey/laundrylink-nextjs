import { redirect } from "next/navigation";
import { destinationForUser, getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? destinationForUser(user) : "/login");
}
