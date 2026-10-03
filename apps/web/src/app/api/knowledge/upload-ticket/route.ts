import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiContext, requireWrite } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { uploadTicket } from "@/lib/agent/storage";
export const POST = api(async (request) => {
  const c = await apiContext(request);
  requireWrite(c);
  const input = await jsonBody(
    request,
    z
      .object({
        name: z.string().min(1).max(200),
        mime: z.string().max(100),
        size: z
          .number()
          .int()
          .min(1)
          .max(5 * 1024 * 1024),
        caseId: z.string().uuid().optional(),
      })
      .strict(),
  );
  if (
    input.caseId &&
    !(
      await db().query(
        "select id from cases where tenant_id=$1 and id=$2 and deleted_at is null",
        [c.tenantId, input.caseId],
      )
    ).length
  )
    throw new ApiError(404, "NOT_FOUND", "Causa no accesible.");
  const id = randomUUID(),
    key = `${c.tenantId}/${id}`,
    mime = input.mime || "application/octet-stream";
  await db().query(
    "insert into document_uploads(id,tenant_id,user_id,case_id,name,mime,size_bytes,storage_key) values($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      c.tenantId,
      c.actorId,
      input.caseId ?? null,
      input.name,
      mime,
      input.size,
      key,
    ],
  );
  return response({ id, url: uploadTicket(key, input.size, input.name, mime) });
});
