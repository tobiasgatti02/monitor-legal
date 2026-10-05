import { apiContext } from "@/lib/api/context";
import { api, response } from "@/lib/api/http";
import { db } from "@/lib/db";
import { runDocumentStep } from "@/lib/agent/jobs";
export const maxDuration = 120;
export const GET = api(async (request) => {
  const c = await apiContext(request);
  return response(
    await db().query(
      "select id,document_id,status,checkpoint,error_code,attempt_count,updated_at from jobs where tenant_id=$1 and job_type='LEGAL_INGEST' order by created_at desc limit 50",
      [c.tenantId],
    ),
  );
});
export const POST = api(async (request) =>
  response(await runDocumentStep(await apiContext(request))),
);
