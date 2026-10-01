import { NextRequest, NextResponse } from "next/server";
import { startOAuth, type OAuthProvider } from "@/lib/oauth";

export const dynamic = "force-dynamic";

function providerFrom(value: string): OAuthProvider | null {
  return value === "google" || value === "apple" ? value : null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const provider = providerFrom((await context.params).provider);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return startOAuth(provider, request);
}
