import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { ApiContext } from "@/lib/api/context";
import { audit, requireWrite } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { chunkPages } from "./core";
import { gateway } from "./gateway";
import { storedFile } from "./storage";

export async function parseDocument(
  content: Buffer,
  mime: string,
  name: string,
) {
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(content) });
    try {
      const result = await parser.getText();
      if (result.total > 200)
        throw new ApiError(
          422,
          "TOO_MANY_PAGES",
          "Dividí el PDF en archivos de hasta 200 páginas.",
        );
      return result.pages.map((p) => ({ page: p.num, text: p.text }));
    } finally {
      await parser.destroy();
    }
  }
  if (name.toLowerCase().endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: content });
    // DOCX has no stable physical pages: citation explicitly names a section.
    return [{ page: 1, text: result.value }];
  }
  if (
    ["text/plain", "text/markdown", "text/csv"].includes(mime) ||
    /\.(txt|md|csv)$/i.test(name)
  ) {
    return content
      .toString("utf8")
      .split("\f")
      .map((text, i) => ({ page: i + 1, text }));
  }
  throw new ApiError(
    415,
    "UNSUPPORTED_FORMAT",
    "Para indexar usá PDF, DOCX, TXT o Markdown. Otros formatos pueden almacenarse como adjuntos.",
  );
}

export async function indexDocument(
  context: ApiContext,
  id: string,
  ocrPages?: { page: number; text: string }[],
) {
  requireWrite(context);
  const rows = (await db().query(
    `select d.id,d.name,d.mime_type,d.content_hash,d.storage_provider,d.storage_key,encode(b.content,'base64') as content
    from documents d left join document_blobs b on b.document_id=d.id and b.tenant_id=d.tenant_id
    where d.tenant_id=$1 and d.id=$2 and d.deleted_at is null`,
    [context.tenantId, id],
  )) as {
    id: string;
    name: string;
    mime_type: string;
    content_hash: string;
    content: string | null;
    storage_provider: string;
    storage_key: string;
  }[];
  const doc = rows[0];
  if (!doc) throw new ApiError(404, "NOT_FOUND", "Documento no encontrado.");
  const locked = await db().query(
    `insert into knowledge_documents(document_id,tenant_id,checksum,status)
    values($1,$2,$3,'PROCESSING') on conflict(document_id) do update set status='PROCESSING',updated_at=now(),error_code=null
    where knowledge_documents.status <> 'PROCESSING' or knowledge_documents.updated_at < now()-interval '5 minutes' returning document_id`,
    [id, context.tenantId, doc.content_hash],
  );
  if (!locked.length)
    throw new ApiError(
      409,
      "INDEX_IN_PROGRESS",
      "Este documento ya se está procesando.",
    );
  try {
    if (!ocrPages && /\.(png|jpe?g)$/i.test(doc.name)) {
      await db().query(
        "update knowledge_documents set status='NEEDS_OCR',page_count=1,error_code='OCR_REQUIRED',updated_at=now() where tenant_id=$1 and document_id=$2",
        [context.tenantId, id],
      );
      return { status: "NEEDS_OCR", pageCount: 1, chunkCount: 0 };
    }
    const original =
      doc.storage_provider === "R2"
        ? Buffer.from(await (await storedFile(doc.storage_key)).arrayBuffer())
        : Buffer.from(doc.content ?? "", "base64");
    if (
      createHash("sha256").update(original).digest("hex") !== doc.content_hash
    )
      throw new ApiError(
        422,
        "CHECKSUM_MISMATCH",
        "El original no coincide con su huella digital.",
      );
    const pages =
      ocrPages ?? (await parseDocument(original, doc.mime_type, doc.name));
    if (pages.reduce((sum, p) => sum + p.text.length, 0) > 500000)
      throw new ApiError(
        422,
        "TEXT_TOO_LARGE",
        "Dividí el documento para indexarlo.",
      );
    const chunks = chunkPages(pages);
    if (
      !chunks.length ||
      (doc.mime_type === "application/pdf" &&
        pages.some((p) => p.text.trim().length < 20))
    ) {
      await db().query(
        "update knowledge_documents set status='NEEDS_OCR',page_count=$3,error_code='OCR_REQUIRED',updated_at=now() where tenant_id=$1 and document_id=$2",
        [context.tenantId, id, pages.length],
      );
      return { status: "NEEDS_OCR", pageCount: pages.length, chunkCount: 0 };
    }
    // Reuse persisted embeddings by content checksum before atomic index replacement.
    const old = (await db().query(
      "select checksum,embedding::text from knowledge_chunks where tenant_id=$1 and document_id=$2 and embedding_model='bge-m3-v1'",
      [context.tenantId, id],
    )) as { checksum: string; embedding: string | null }[];
    const cache = new Map(
      old.filter((c) => c.embedding).map((c) => [c.checksum, c.embedding!]),
    );
    const vectors = new Map<string, string>(cache);
    const missing = chunks.filter((c) => !cache.has(c.checksum));
    for (let i = 0; i < missing.length; i += 8) {
      try {
        const batch = missing.slice(i, i + 8);
        const embeddings = await gateway.embed(batch.map((c) => c.content));
        batch.forEach((c, j) =>
          vectors.set(c.checksum, JSON.stringify(embeddings[j])),
        );
      } catch {
        break;
      }
    }
    const payload = chunks.map((c) => ({
      ...c,
      embedding: vectors.get(c.checksum) ?? null,
    }));
    // Statement performs replacement + completion atomically; deletion is limited to this index.
    await db().query(
      `with removed as (delete from knowledge_chunks where tenant_id=$1 and document_id=$2 returning id),
      added as (insert into knowledge_chunks(tenant_id,document_id,ordinal,page_start,page_end,content,checksum,embedding,embedding_model)
        select $1,$2,(x->>'ordinal')::int,(x->>'pageStart')::int,(x->>'pageEnd')::int,x->>'content',x->>'checksum',
          (x->>'embedding')::vector,case when x->>'embedding' is not null then 'bge-m3-v1' end
        from jsonb_array_elements($3::jsonb) x where (select count(*) from removed)>=0 returning id)
      update knowledge_documents set status='READY',checksum=$4,page_count=$5,chunk_count=(select count(*) from added),
        indexed_at=now(),updated_at=now(),error_code=null where tenant_id=$1 and document_id=$2`,
      [
        context.tenantId,
        id,
        JSON.stringify(payload),
        doc.content_hash,
        pages.length,
      ],
    );
    await audit(context, "DOCUMENT_INDEXED", "document", id, {
      chunks: chunks.length,
      pages: pages.length,
      embeddings: vectors.size,
      ocr: Boolean(ocrPages),
    });
    return {
      status: "READY",
      pageCount: pages.length,
      chunkCount: chunks.length,
      semantic: chunks.every((c) => vectors.has(c.checksum)),
    };
  } catch (error) {
    await db().query(
      "update knowledge_documents set status='FAILED',error_code=$3,updated_at=now() where tenant_id=$1 and document_id=$2",
      [
        context.tenantId,
        id,
        error instanceof ApiError ? error.code : "PARSING_FAILED",
      ],
    );
    throw error;
  }
}
export function contentChecksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
