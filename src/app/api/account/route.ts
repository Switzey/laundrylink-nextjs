import { NextResponse } from "next/server";
import { apiInternalError, authorizeApiRequest } from "@/lib/api-authorization";

export async function GET() {
  try {
    const authorization = await authorizeApiRequest("api.account.read");
    if ("response" in authorization) return authorization.response;

    const { user } = authorization;
    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return apiInternalError(error, "api.account.error");
  }
}
