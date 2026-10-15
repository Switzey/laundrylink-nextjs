import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { appConfig } from "@/lib/env";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET() {
  const startedAt = performance.now();

  try {
    const database = await one<{ healthy: number }>("SELECT 1 AS healthy");
    if (Number(database?.healthy) !== 1) throw new Error("Database readiness query failed.");

    return NextResponse.json(
      {
        status: "ok",
        service: "laundrylink",
        environment: appConfig.environment,
        database: "available",
        responseTimeMs: Math.max(0, Math.round(performance.now() - startedAt)),
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers },
    );
  } catch (error) {
    logError("health.database_unavailable", error);
    return NextResponse.json(
      {
        status: "unavailable",
        service: "laundrylink",
        environment: appConfig.environment,
        database: "unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers },
    );
  }
}
