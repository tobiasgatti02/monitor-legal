import { apiContext, audit, requireWrite } from "@/lib/api/context";
import { api, response } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { createHash, randomUUID } from "node:crypto";
import { queueStatement } from "@/lib/agent/jobs";
import { z } from "zod";

export const maxDuration = 120;
export const GET = api(async (request) => {
  const c = await apiContext(request);
  const rows = await db().query(
    `select d.id,d.name,d.case_id as "caseId",c.title as "caseTitle",d.mime_type as "mimeType",
    d.size_bytes as "sizeBytes",d.created_at as "createdAt",case when k.status='READY' and k.artifact_key is null then 'STALE' else coalesce(k.status,'PENDING') end as status,
    k.covered_pages as "coveredPages",k.extraction_status as "extractionStatus",
    (select jsonb_build_object('id',j.id,'status',j.status,'stage',j.checkpoint->>'stage','offset',j.checkpoint->>'offset','errorCode',j.error_code) from jobs j where j.document_id=d.id and j.job_type='LEGAL_INGEST' order by j.created_at desc limit 1) as job,
    k.page_count as "pageCount",k.chunk_count as "chunkCount",k.error_code as "errorCode",
    (select count(*) from knowledge_chunks ch where ch.document_id=d.id and ch.embedding is not null)::int as "embeddedChunks"
    from documents d left join knowledge_documents k on k.document_id=d.id and k.tenant_id=d.tenant_id
    left join cases c on c.id=d.case_id and c.tenant_id=d.tenant_id
    where d.tenant_id=$1 and d.deleted_at is null order by d.created_at desc limit 200`,
    [c.tenantId],
  );
  return response(rows);
});
export const POST = api(async (request) => {
  const c = await apiContext(request);
  requireWrite(c);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024)
    throw new ApiError(413, "INVALID_FILE", "Subí un archivo de hasta 5 MB.");
  const caseId = form.get("caseId")
    ? z.string().uuid().parse(form.get("caseId"))
    : null;
  if (
    caseId &&
    !(
      await db().query(
        "select id from cases where tenant_id=$1 and id=$2 and deleted_at is null",
        [c.tenantId, caseId],
      )
    ).length
  )
    throw new ApiError(404, "NOT_FOUND", "Causa no accesible.");
  const content = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(content).digest("hex"),
    id = randomUUID();
  const existing = await db().query(
    "select id from documents where tenant_id=$1 and content_hash=$2 and case_id is not distinct from $3::uuid and deleted_at is null limit 1",
    [c.tenantId, hash, caseId],
  );
  if (existing.length)
    return response({ id: existing[0]!.id, duplicate: true });
  await db().transaction([
    {
      statement: `insert into documents(id,tenant_id,case_id,name,storage_provider,storage_key,mime_type,size_bytes,content_hash,created_by)
      values($1,$2,$3,$4,'NEON',$1::text,$5,$6,$7,$8)`,
      parameters: [
        id,
        c.tenantId,
        caseId,
        file.name.slice(0, 200),
        file.type || "application/octet-stream",
        file.size,
        hash,
        c.actorId,
      ],
    },
    {
      statement:
        "insert into document_blobs(document_id,tenant_id,content) values($1,$2,decode($3,'base64'))",
      parameters: [id, c.tenantId, content.toString("base64")],
    },
    {
      statement:
        "insert into document_versions(tenant_id,document_id,version,storage_key,content_hash,size_bytes,created_by) values($1,$2,1,$2::text,$3,$4,$5)",
      parameters: [c.tenantId, id, hash, file.size, c.actorId],
    },
    queueStatement(c, id),
  ]);
  await audit(c, "DOCUMENT_UPLOADED", "document", id, {
    sizeBytes: file.size,
    contentHash: hash,
  });
  const ingestion = { status: "PENDING" };
  return response({ id, ingestion }, { status: 201 });
});
