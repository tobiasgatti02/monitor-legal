import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, requireWrite, type ApiContext } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { storedFile } from "./storage";
import { parseDocument } from "./ingestion";
import { exportDocx } from "./docx";
import { exportPdf } from "./pdf";

export const documentInput = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().min(1).max(30000),
  format: z.enum(["pdf", "docx", "txt", "md"]),
  caseId: z.string().uuid().optional(),
}).strict();

export async function createAgentDocument(c: ApiContext, input: z.infer<typeof documentInput>) {
  requireWrite(c);
  if (input.caseId && !(await db().query("select id from cases where tenant_id=$1 and id=$2 and deleted_at is null", [c.tenantId, input.caseId])).length)
    throw new ApiError(404, "NOT_FOUND", "La causa no es accesible.");
  let content: Buffer;
  if (input.format === "pdf") {
    try { content = await exportPdf(input.title, input.body); }
    catch { throw new ApiError(422, "PDF_ENCODING", "El PDF contiene caracteres que la fuente no admite. Usá DOCX para conservarlos."); }
  } else if (input.format === "docx") content = exportDocx(input.title, input.body);
  else content = Buffer.from(`${input.title}\n\nBORRADOR PARA REVISIÓN\n\n${input.body}`, "utf8");
  const id = randomUUID();
  const name = `${input.title.replace(/[\u0000-\u001f/\\]/g, "_")}.${input.format}`;
  const mime = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/markdown" }[input.format];
  const hash = createHash("sha256").update(content).digest("hex");
  await db().transaction([
    { statement: "insert into documents(id,tenant_id,case_id,name,category,storage_provider,storage_key,mime_type,size_bytes,content_hash,created_by) values($1,$2,$3,$4,'DRAFT','NEON',$1::text,$5,$6,$7,$8)", parameters: [id, c.tenantId, input.caseId ?? null, name, mime, content.length, hash, c.actorId] },
    { statement: "insert into document_blobs(document_id,tenant_id,content) values($1,$2,decode($3,'base64'))", parameters: [id, c.tenantId, content.toString("base64")] },
    { statement: "insert into document_versions(tenant_id,document_id,version,storage_key,content_hash,size_bytes,created_by) values($1,$2,1,$2::text,$3,$4,$5)", parameters: [c.tenantId, id, hash, content.length, c.actorId] },
    { statement: "insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata,created_by) values($1,$2,'AGENT_DOCUMENT_CREATED','document',$3,$4::jsonb,$2)", parameters: [c.tenantId, c.actorId, id, JSON.stringify({ format: input.format, size: content.length })] },
  ]);
  return { id, title: input.title, name, case_id: input.caseId, format: input.format, downloadUrl: `/api/knowledge/${id}/source`, draft: true };
}

export async function readAgentDocument(c: ApiContext, id: string, caseId: string | undefined, start: number, count: number) {
  const rows = await db().query("select d.name,d.case_id,d.mime_type,d.storage_provider,d.storage_key,d.content_hash,d.size_bytes,encode(b.content,'base64') as content from documents d left join document_blobs b on b.document_id=d.id and b.tenant_id=d.tenant_id where d.tenant_id=$1 and d.id=$2 and d.deleted_at is null and ($3::uuid is null or d.case_id=$3)", [c.tenantId, id, caseId ?? null]);
  const doc = rows[0];
  if (!doc) throw new ApiError(404, "NOT_FOUND", "Documento no accesible.");
  if (Number(doc.size_bytes) > 5 * 1024 * 1024)
    throw new ApiError(422, "DOCUMENT_SIZE_LIMIT", "Dividí el documento en archivos de hasta 5 MB.");
  let content: Buffer;
  if (doc.storage_provider === "R2") {
    const res = await storedFile(doc.storage_key);
    const reader = res.body?.getReader();
    if (!reader) throw new ApiError(503, "STORAGE_UNAVAILABLE", "Archivo no disponible.");
    const chunks: Buffer[] = []; let bytes = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.length;
      if (bytes > 5 * 1024 * 1024) { await reader.cancel(); throw new ApiError(422, "DOCUMENT_SIZE_LIMIT", "El archivo supera 5 MB."); }
      chunks.push(Buffer.from(part.value));
    }
    content = Buffer.concat(chunks);
  } else {
    if (!doc.content) throw new ApiError(503, "STORAGE_UNAVAILABLE", "El archivo no está disponible.");
    content = Buffer.from(doc.content, "base64");
  }
  if (createHash("sha256").update(content).digest("hex") !== doc.content_hash)
    throw new ApiError(409, "SOURCE_CHANGED", "La fuente cambió; revisá el documento.");
  const pages = await parseDocument(content, doc.mime_type ?? "", doc.name);
  await audit(c, "AGENT_DOCUMENT_READ", "document", id, { start, count });
  const selected = pages.filter(p => p.page >= start && p.page < start + count).map(p => ({ page: p.page, text: p.text.slice(0, 5000), truncated: p.text.length > 5000 }));
  return { name: doc.name, caseId: doc.case_id, checksum: doc.content_hash, totalPages: pages.length, pages: selected, needsOcr: pages.every(p => !p.text.trim()), partial: selected.length < pages.length || selected.some(p => p.truncated) };
}
