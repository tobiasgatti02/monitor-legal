import { apiContext } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { querySchema } from "@/lib/agent/contracts";
import { askAgent } from "@/lib/agent/service";
import { modelConfigured } from "@/lib/agent/gateway";
import { db } from "@/lib/db";

export const maxDuration = 120;
export const POST = api(async (request) =>
  response(
    await askAgent(
      await apiContext(request),
      await jsonBody(request, querySchema),
    ),
  ),
);
export const GET = api(async (request) => {
  const c = await apiContext(request);
  const [threads, cases, approvals, memories, stats] = await Promise.all([
    db().query(
      'select id,title,case_id as "caseId",updated_at as "updatedAt" from agent_threads where tenant_id=$1 and user_id=$2 order by updated_at desc limit 50',
      [c.tenantId, c.actorId],
    ),
    db().query(
      "select id,title from cases where tenant_id=$1 and deleted_at is null order by updated_at desc limit 200",
      [c.tenantId],
    ),
    db().query(
      'select id,action,payload,status,thread_id as "threadId",expires_at as "expiresAt" from agent_approvals where tenant_id=$1 and user_id=$2 and status=\'PENDING\' and expires_at>now() order by created_at desc limit 50',
      [c.tenantId, c.actorId],
    ),
    db().query(
      "select id,value from agent_memories where tenant_id=$1 and user_id=$2 order by created_at desc limit 20",
      [c.tenantId, c.actorId],
    ),
    db().query(
      "select count(*)::int as queries,coalesce(sum(input_tokens+output_tokens),0)::int as tokens from agent_runs where tenant_id=$1 and user_id=$2 and created_at>now()-interval '1 day'",
      [c.tenantId, c.actorId],
    ),
  ]);
  return response({
    threads,
    cases,
    approvals,
    memories,
    stats: stats[0],
    modelConfigured: modelConfigured(),
    actor: c,
  });
});
