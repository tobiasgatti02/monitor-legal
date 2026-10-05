import "server-only";
import { db } from "@/lib/db";
import type { ApiContext } from "@/lib/api/context";
export type DailyAIUsage = {
  limit: number;
  used: number;
  actorUsed: number;
  remaining: number;
  resetsAt: string;
  origin: "APP_LEDGER";
};
export async function dailyAIUsage(c: ApiContext): Promise<DailyAIUsage> {
  const rows = await db().query("select app.daily_ai_usage($1::uuid) as usage", [c.tenantId]);
  return rows[0]!.usage as DailyAIUsage;
}
