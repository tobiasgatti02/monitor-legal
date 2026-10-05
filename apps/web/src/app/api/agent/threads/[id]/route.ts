import { verifyAgentCitations } from "@/lib/agent/citations";
import type { Citation } from "@/lib/agent/contracts";
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
    'select id,role,content,citations,metadata,created_at as "createdAt" from agent_messages where tenant_id=$1 and thread_id=$2 order by created_at desc limit 40',
    [c.tenantId, id],
  );
  messages.reverse();
  try {
    await verifyAgentCitations(
      c,
      messages.flatMap((m) => m.citations as Citation[]),
    );
  } catch {
    for (const message of messages)
      if (message.role === "assistant" && message.citations?.length) {
        message.content =
          "Respuesta desactualizada: sus fuentes cambiaron o dejaron de ser accesibles. Volvé a consultar.";
        message.citations = [];
        message.metadata = { ...message.metadata, stale: true };
      }
  }
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
