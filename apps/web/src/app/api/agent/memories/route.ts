import { z } from "zod";
import { apiContext } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { db } from "@/lib/db";
export const POST = api(async (request) => {
  const c = await apiContext(request),
    input = await jsonBody(
      request,
      z.object({ value: z.string().trim().min(1).max(1000) }).strict(),
    );
  const rows = await db().query(
    `insert into agent_memories(tenant_id,user_id,value) select $1,$2,$3
    where (select count(*) from agent_memories where tenant_id=$1 and user_id=$2)<20 returning id,value`,
    [c.tenantId, c.actorId, input.value],
  );
  return response(rows[0], { status: 201 });
});
export const DELETE = api(async (request) => {
  const c = await apiContext(request),
    input = await jsonBody(
      request,
      z.object({ id: z.string().uuid() }).strict(),
    );
  await db().query(
    "delete from agent_memories where tenant_id=$1 and user_id=$2 and id=$3",
    [c.tenantId, c.actorId, input.id],
  );
  return new Response(null, { status: 204 });
});
