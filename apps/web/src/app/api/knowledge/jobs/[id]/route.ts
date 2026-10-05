import { z } from "zod";
import { apiContext, requireWrite } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
export const POST = api(async (request, route) => {
  const c = await apiContext(request);
  requireWrite(c);
  const id = z
    .string()
    .uuid()
    .parse((await route?.params)?.id);
  const input = await jsonBody(
    request,
    z.object({ action: z.enum(["RETRY", "CANCEL", "CONTINUE"]) }).strict(),
  );
  if (input.action === "CONTINUE") {
    const previous = await db().query(
      "select checkpoint->>'extractionWorkId' as work from jobs where tenant_id=$1 and id=$2 and created_by=$3 and job_type='LEGAL_INGEST' and status in('FAILED','CANCELLED')",
      [c.tenantId, id, c.actorId],
    );
    if (previous[0]?.work)
      await db().query("select app.release_extraction($1)", [previous[0].work]);
  }
  const rows = await db().query(
    `update jobs set status=$4::sync_status,fence=fence+1,lease_until=null,attempt_count=0,error_code=null,scheduled_at=now(),updated_at=now(),payload=case when $5 then payload||'{"continueExtraction":true}'::jsonb else payload end,checkpoint=case when $5 then checkpoint-'extractionWorkId'-'extractionScopeEnd' else checkpoint end
 where tenant_id=$1 and id=$2 and job_type='LEGAL_INGEST' and created_by=$3 and ($4='CANCELLED' or status in('FAILED','CANCELLED')) returning id,status,checkpoint`,
    [
      c.tenantId,
      id,
      c.actorId,
      input.action === "CANCEL" ? "CANCELLED" : "QUEUED",
      input.action === "CONTINUE",
    ],
  );
  if (!rows.length)
    throw new ApiError(409, "JOB_STATE", "El trabajo no admite esa acción.");
  return response(rows[0]);
});
