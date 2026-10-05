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
  const ledger = await db().query(
    `select count(*)::int as attempts,count(*) filter(where usage_origin<>'reported')::int as estimated,
    coalesce(sum(coalesce(neurons,neurons_reserved)),0)::text as neurons,
    coalesce(sum(coalesce(usd,neurons_reserved*0.011/1000)),0)::text as usd,
    count(*) filter(where status='UNCERTAIN' or status='RESERVED')::int as uncertain,
    coalesce(sum(input_tokens),0)::bigint as "reportedInputTokens",coalesce(sum(output_tokens),0)::bigint as "reportedOutputTokens"
    from ai_attempts where tenant_id=$1 and user_id=$2 and created_at>now()-interval '7 days'`,
    [c.tenantId, c.actorId],
  );
  return response({
    ...rows[0],
    ...ledger[0],
    costOrigin:
      "Tarifa marginal estimada; no facturación. Usage ausente conserva reserva.",
    tariffVersion: "cf-2026-10-04",
  });
});
