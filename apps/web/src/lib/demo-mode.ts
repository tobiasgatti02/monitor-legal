import "server-only";

import { isDatabaseConfigured } from "@/lib/db";

export function demoMode(): boolean {
  return process.env.MONITOR_LEGAL_DEMO === "true" || !isDatabaseConfigured();
}
