import { apiContext } from "@/lib/api/context";
import { api, response } from "@/lib/api/http";
import { idSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
export const GET = api(async (request, route) => {
  const c = await apiContext(request),
    id = idSchema.parse((await route?.params)?.id);
  const threads = await db().query(
    'select id,title,case_id as "caseId" from agent_threads where tenant_id=$1 and user_id=$2 and id=$3',
    [c.tenantId, c.actorId, id],
  );
  if (!threads.length)
    throw new ApiError(404, "NOT_FOUND", "Conversación no encontrada.");
  const messages = await db().query(
    'select id,role,content,citations,metadata,created_at as "createdAt" from agent_messages where tenant_id=$1 and thread_id=$2 order by created_at limit 200',
    [c.tenantId, id],
  );
  return response({ thread: threads[0], messages });
});
export const DELETE = api(async (request, route) => {
  const c = await apiContext(request),
    id = idSchema.parse((await route?.params)?.id);
  await db().query(
    "delete from agent_threads where tenant_id=$1 and user_id=$2 and id=$3",
    [c.tenantId, c.actorId, id],
  );
  return new Response(null, { status: 204 });
});
