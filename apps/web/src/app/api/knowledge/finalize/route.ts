import { z } from "zod";
import { apiContext, requireWrite, audit } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { storedFile } from "@/lib/agent/storage";
import { queueStatement } from "@/lib/agent/jobs";
export const maxDuration = 120;
export const POST = api(async (request) => {
  const c = await apiContext(request);
  requireWrite(c);
  const input = await jsonBody(
    request,
    z.object({ id: z.string().uuid() }).strict(),
  );
  const rows = await db().query(
    "select * from document_uploads where tenant_id=$1 and user_id=$2 and id=$3 and (expires_at>now() or status='FINALIZED')",
    [c.tenantId, c.actorId, input.id],
  );
  const upload = rows[0];
  if (!upload)
    throw new ApiError(404, "UPLOAD_NOT_FOUND", "La carga no existe o venció.");
  if (upload.status === "FINALIZED")
    return response({ id: input.id, duplicate: true });
  const meta = await (await storedFile(upload.storage_key, true)).json();
  if (
    Number(meta.size) !== Number(upload.size_bytes) ||
    !/^[a-f0-9]{64}$/.test(meta.checksum)
  )
    throw new ApiError(
      422,
      "FILE_MISMATCH",
      "El archivo no coincide con la carga autorizada.",
    );
  await db().transaction([
    {
      statement:
        "insert into documents(id,tenant_id,case_id,name,storage_provider,storage_key,mime_type,size_bytes,content_hash,created_by) values($1,$2,$3,$4,'R2',$5,$6,$7,$8,$9) on conflict(id) do nothing",
      parameters: [
        input.id,
        c.tenantId,
        upload.case_id,
        upload.name,
        upload.storage_key,
        upload.mime,
        upload.size_bytes,
        meta.checksum,
        c.actorId,
      ],
    },
    {
      statement:
        "insert into document_versions(tenant_id,document_id,version,storage_key,content_hash,size_bytes,created_by) values($1,$2,1,$3,$4,$5,$6) on conflict(document_id,version) do nothing",
      parameters: [
        c.tenantId,
        input.id,
        upload.storage_key,
        meta.checksum,
        upload.size_bytes,
        c.actorId,
      ],
    },
    {
      statement:
        "update document_uploads set status='FINALIZED' where tenant_id=$1 and id=$2",
      parameters: [c.tenantId, input.id],
    },
    queueStatement(c, input.id),
  ]);
  await audit(c, "DOCUMENT_UPLOADED", "document", input.id, {
    sizeBytes: meta.size,
    contentHash: meta.checksum,
    storage: "R2",
  });
  const ingestion = { status: "PENDING" };
  return response({ id: input.id, ingestion }, { status: 201 });
});
