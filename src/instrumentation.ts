import type { Instrumentation } from "next";
import { logError } from "@/lib/logger";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  logError("request.error", error, {
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
