import { apiContext, requireRoles } from "@/lib/api/context";
import { api, response } from "@/lib/api/http";
import { db } from "@/lib/db";
export const GET = api(async (request) => {
  const c = await apiContext(request);
  requireRoles(c, ["OWNER", "ADMIN"]);
  // Metrics cover the authenticated actor; no access to another lawyer's conversations.
  const rows = await db().query(
    `select count(*)::int as queries,count(*) filter(where status='FAILED')::int as errors,
  count(*) filter(where status='ABSTAINED')::int as abstentions,
  percentile_cont(0.5) within group(order by latency_ms) as "p50Ms",
  percentile_cont(0.95) within group(order by latency_ms) as "p95Ms",
  coalesce(sum(input_tokens),0)::bigint as "inputTokens",coalesce(sum(output_tokens),0)::bigint as "outputTokens",
  coalesce(avg(jsonb_array_length(tool_calls)),0) as "averageTools"
  from agent_runs where tenant_id=$1 and created_at>now()-interval '7 days'`,
    [c.tenantId],
  );
  return response(rows[0]);
});
