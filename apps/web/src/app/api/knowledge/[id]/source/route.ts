import { apiContext, audit } from "@/lib/api/context";
import { api } from "@/lib/api/http";
import { idSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { storedFile } from "@/lib/agent/storage";
export const GET = api(async (request, route) => {
  const c = await apiContext(request),
    id = idSchema.parse((await route?.params)?.id);
  const rows = (await db().query(
    `select d.name,d.mime_type,d.storage_provider,d.storage_key,encode(b.content,'base64') as content from documents d
    left join document_blobs b on b.document_id=d.id and b.tenant_id=d.tenant_id where d.tenant_id=$1 and d.id=$2 and d.deleted_at is null`,
    [c.tenantId, id],
  )) as {
    name: string;
    mime_type: string;
    content: string;
    storage_provider: string;
    storage_key: string;
  }[];
  if (!rows.length)
    throw new ApiError(404, "NOT_FOUND", "Fuente no accesible.");
  await audit(c, "SOURCE_OPENED", "document", id);
  const doc = rows[0]!,
    pdf = doc.mime_type === "application/pdf" || doc.name.endsWith(".pdf");
  const body =
    doc.storage_provider === "R2"
      ? (await storedFile(doc.storage_key)).body
      : Buffer.from(doc.content, "base64");
  return new Response(body, {
    headers: {
      "Content-Type": pdf ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `${pdf ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
});
