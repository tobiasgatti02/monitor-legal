import "server-only";
import { randomUUID } from "node:crypto";
import { dbMeasurements } from "@/lib/db-scope";
import { db } from "@/lib/db";
import { audit, requireWrite, type ApiContext } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { parseDocument, contentChecksum } from "./ingestion";
import { chunkPages } from "./core";
import { artifact, storedFile } from "./storage";
import { createWork, withBudget, tokenBound } from "./budgets";
import { gateway } from "./gateway";
import { capabilities } from "./flags";
import { extractUnit } from "./extraction";

export const parserVersion = "legal-v2:ocr-local-v1:schema-v1";
export type Page = { page: number; text: string };
export type Job = {
  id: string;
  tenant_id: string;
  case_id: string | null;
  document_id: string;
  created_by: string;
  fence: number;
  checkpoint: {
    stage?: string;
    offset?: number;
    workId?: string;
    artifactKey?: string;
    factsOffset?: number;
    extractionWorkId?: string;
    extractionScopeEnd?: number;
  };
  payload: { ocrKey?: string; continueExtraction?: boolean };
  attempt_count: number;
  max_attempts: number;
};
export function queueStatement(c: ApiContext, id: string, ocrKey?: string) {
  return {
    statement: `insert into jobs(tenant_id,case_id,document_id,job_type,idempotency_key,payload,created_by)
    select d.tenant_id,d.case_id,d.id,'LEGAL_INGEST','ingest:'||d.id||':'||d.content_hash||':'||$4||':'||$5,jsonb_build_object('ocrKey',nullif($5,'')), $3 from documents d
    where d.tenant_id=$1 and d.id=$2 and d.deleted_at is null on conflict(tenant_id,idempotency_key) do nothing`,
    parameters: [c.tenantId, id, c.actorId, parserVersion, ocrKey ?? ""],
  };
}
export function validatePages(pages: Page[], ocr = false) {
  if (
    !pages.length ||
    pages.length > 200 ||
    pages.reduce((n, p) => n + p.text.length, 0) > 500000 ||
    pages.some(
      (p, i) => p.page !== i + 1 || p.text.length > (ocr ? 50000 : 500000),
    )
  )
    throw new ApiError(
      422,
      "INVALID_PAGE_COVERAGE",
      "Incluí todas las páginas, en orden y sin duplicados, dentro del límite de texto.",
    );
}
export async function enqueueDocument(
  c: ApiContext,
  id: string,
  pages?: Page[],
) {
  requireWrite(c);
  const doc = await db().query(
    "select id from documents where tenant_id=$1 and id=$2 and deleted_at is null",
    [c.tenantId, id],
  );
  if (!doc.length)
    throw new ApiError(404, "NOT_FOUND", "Documento no accesible.");
  let ocrKey: string | undefined;
  if (pages) {
    validatePages(pages, true);
    ocrKey = `${c.tenantId}/${id}/${contentChecksum(JSON.stringify(pages))}`;
    await artifact(ocrKey, pages);
  }
  await db().transaction([queueStatement(c, id, ocrKey)]);
  const rows = await db().query(
    "select id,status,checkpoint,error_code from jobs where tenant_id=$1 and document_id=$2 and job_type='LEGAL_INGEST' order by created_at desc limit 1",
    [c.tenantId, id],
  );
  return { status: "PENDING", job: rows[0] };
}
export async function assertLease(c: ApiContext, j: Job, renew = true) {
  const rows = await db().query(
    `update jobs j set lease_until=case when $4 then now()+interval '90 seconds' else lease_until end
    where j.tenant_id=$1 and j.id=$2 and j.fence=$3 and j.status='RUNNING' and j.lease_until>now()
    and exists(select 1 from documents d where d.id=j.document_id and d.tenant_id=j.tenant_id and d.case_id is not distinct from j.case_id and d.deleted_at is null) returning j.id`,
    [c.tenantId, j.id, j.fence, renew],
  );
  if (!rows.length)
    throw new ApiError(
      409,
      "STALE_LEASE",
      "El trabajo perdió su lease o acceso. No se publica este resultado.",
    );
}
function guard(j: Job) {
  return {
    statement:
      "select id from jobs where id=$1 and tenant_id=$2 and fence=$3 and status='RUNNING' and lease_until>now() for update",
    parameters: [j.id, j.tenant_id, j.fence],
  };
}
// Every write of derived data includes the fence in its SQL, even within a guarded transaction.
export async function runDocumentStep(c: ApiContext, id?: string) {
  if (!capabilities().durableIngestion)
    return { processed: false, disabled: true };
  requireWrite(c);
  if (!id) {
    const rows = await db().query(
      "select id from jobs where tenant_id=$1 and job_type='LEGAL_INGEST' and status in('QUEUED','RUNNING') and scheduled_at<=now() order by scheduled_at limit 1",
      [c.tenantId],
    );
    id = rows[0]?.id;
  }
  if (!id) return { processed: false };
  const claimed = (await db().query(
    "select * from app.claim_legal_job($1,$2)",
    [id, randomUUID()],
  )) as Job[];
  const j = claimed[0];
  if (!j) return { processed: false };
  const fenceWhere =
    "exists(select 1 from jobs j where j.id=$1 and j.tenant_id=$2 and j.fence=$3 and j.status='RUNNING' and j.lease_until>now())";
  const params = [j.id, c.tenantId, j.fence];
  const cp = { ...j.checkpoint };
  const started = Date.now(),
    memory = process.memoryUsage();
  try {
    await assertLease(c, j);
    const docs = await db().query(
      `select d.id,d.name,d.case_id,d.mime_type,d.content_hash,d.size_bytes,d.storage_provider,d.storage_key,
      (select max(version) from document_versions v where v.document_id=d.id and v.tenant_id=d.tenant_id) as version
      from documents d where d.tenant_id=$1 and d.id=$2 and d.deleted_at is null`,
      [c.tenantId, j.document_id],
    );
    const doc = docs[0];
    if (!doc)
      throw new ApiError(403, "ACCESS_REVOKED", "Documento no accesible.");
    if (Number(doc.size_bytes) > 5 * 1024 * 1024)
      throw new ApiError(413, "FILE_TOO_LARGE", "El archivo supera 5 MB.");
    if (!cp.stage) {
      const ready = await db().query(
        "select artifact_key,page_count,extraction_status from knowledge_documents where tenant_id=$1 and document_id=$2 and checksum=$3 and parser_version=$4 and status='READY'",
        [c.tenantId, j.document_id, doc.content_hash, parserVersion],
      );
      if (ready.length && !j.payload.ocrKey) {
        cp.artifactKey = ready[0]!.artifact_key;
        cp.stage =
          capabilities().extraction &&
          doc.case_id &&
          ready[0]!.extraction_status !== "COMPLETE"
            ? "facts"
            : "complete";
      } else {
        let pages: Page[];
        const original =
          doc.storage_provider === "R2"
            ? Buffer.from(
                await (await storedFile(doc.storage_key)).arrayBuffer(),
              )
            : Buffer.from(
                (
                  await db().query(
                    "select encode(content,'base64') as content from document_blobs where tenant_id=$1 and document_id=$2",
                    [c.tenantId, j.document_id],
                  )
                )[0]?.content ?? "",
                "base64",
              );
        const { createHash } = await import("node:crypto");
        if (
          createHash("sha256").update(original).digest("hex") !==
          doc.content_hash
        )
          throw new ApiError(422, "CHECKSUM_MISMATCH", "La fuente cambió.");
        if (j.payload.ocrKey) {
          pages = (await artifact(j.payload.ocrKey)) as Page[];
          validatePages(pages, true);
          if (
            /\.pdf$/i.test(doc.name) &&
            (await parseDocument(original, doc.mime_type, doc.name)).length !==
              pages.length
          )
            throw new ApiError(
              422,
              "PARTIAL_OCR",
              "El OCR no cubre todas las páginas del original.",
            );
          if (/\.(png|jpe?g)$/i.test(doc.name) && pages.length !== 1)
            throw new ApiError(
              422,
              "INVALID_OCR",
              "La imagen debe tener una página.",
            );
        } else if (/\.(png|jpe?g)$/i.test(doc.name))
          pages = [{ page: 1, text: "" }];
        else pages = await parseDocument(original, doc.mime_type, doc.name);
        validatePages(pages);
        const serialized = JSON.stringify(pages),
          key = `${c.tenantId}/${j.document_id}/${contentChecksum(serialized)}`;
        await artifact(key, pages);
        await assertLease(c, j);
        const previous = await db().query(
          "select checksum,parser_version,artifact_key from knowledge_documents where tenant_id=$1 and document_id=$2",
          [c.tenantId, j.document_id],
        );
        const changed =
          !!previous.length &&
          (previous[0]!.checksum !== doc.content_hash ||
            previous[0]!.parser_version !== parserVersion ||
            previous[0]!.artifact_key !== key);
        const missing = pages.filter((p) => p.text.trim().length < 20).length;
        const status = missing ? "NEEDS_OCR" : "PROCESSING";
        cp.artifactKey = key;
        cp.offset = 0;
        cp.factsOffset = 0;
        cp.stage = missing ? "ocr" : "index";
        cp.workId = await createWork(
          c,
          "ingestion",
          doc.case_id ?? undefined,
          j.document_id,
        );
        await db().transaction([
          guard(j),
          {
            statement: `insert into knowledge_documents(document_id,tenant_id,checksum,parser_version,status,source_version,artifact_key,page_count,covered_pages,chunk_count,extraction_status)
          select $4,$2,$5,$6,$7,$8,$9,$10,$11,0,'PENDING' where ${fenceWhere} on conflict(document_id) do update set checksum=excluded.checksum,parser_version=excluded.parser_version,status=excluded.status,source_version=excluded.source_version,artifact_key=excluded.artifact_key,page_count=excluded.page_count,covered_pages=excluded.covered_pages,extraction_status='PENDING',updated_at=now()`,
            parameters: [
              ...params,
              j.document_id,
              doc.content_hash,
              parserVersion,
              status,
              doc.version ?? 1,
              key,
              pages.length,
              pages.length - missing,
            ],
          },
          {
            statement: `update case_facts set stale=true where tenant_id=$2 and document_id=$4 and $5 and ${fenceWhere}`,
            parameters: [...params, j.document_id, changed],
          },
          {
            statement: `update case_outputs set stale=true where tenant_id=$2 and case_id=$4 and $5 and ${fenceWhere}`,
            parameters: [...params, doc.case_id, changed],
          },
        ]);
      }
    } else if (cp.stage === "index") {
      const pages = (await artifact(cp.artifactKey!)) as Page[];
      const chunks = chunkPages(pages),
        offset = cp.offset ?? 0,
        batch = chunks.slice(offset, offset + 8);
      const old = await db().query(
        "select checksum,embedding::text from knowledge_chunks where tenant_id=$1 and document_id=$2 and checksum=any($3::text[]) and embedding_model='bge-m3-v1'",
        [c.tenantId, j.document_id, batch.map((x) => x.checksum)],
      );
      const cache = new Map(
        old.filter((r) => r.embedding).map((r) => [r.checksum, r.embedding]),
      );
      const missing = batch.filter((b) => !cache.has(b.checksum));
      if (missing.length) {
        await withBudget(
          {
            workId: cp.workId!,
            profile: "ingestion",
            task: "ingestion-embedding",
            beforeCall: () => assertLease(c, j),
          },
          async () => {
            try {
              const vectors = await gateway.embed(
                missing.map((x) => x.content),
              );
              missing.forEach((x, i) =>
                cache.set(x.checksum, JSON.stringify(vectors[i])),
              );
            } catch (e) {
              if (e instanceof ApiError && e.code === "STALE_LEASE")
                throw e; /* FTS usable; semantic coverage recorded separately. */
            }
          },
        );
      }
      await assertLease(c, j);
      const payload = batch.map((b) => ({
        ...b,
        embedding: cache.get(b.checksum) ?? null,
      }));
      cp.offset = offset + batch.length;
      if (cp.offset >= chunks.length)
        cp.stage =
          capabilities().extraction && doc.case_id ? "facts" : "complete";
      await db().transaction([
        guard(j),
        {
          statement: `insert into knowledge_chunks(tenant_id,document_id,ordinal,page_start,page_end,content,checksum,embedding,embedding_model,source_version)
        select $2,$4,(x->>'ordinal')::int,(x->>'pageStart')::int,(x->>'pageEnd')::int,x->>'content',x->>'checksum',(x->>'embedding')::vector,case when x->>'embedding' is not null then 'bge-m3-v1' end,$6 from jsonb_array_elements($5::jsonb) x where ${fenceWhere}
        on conflict(document_id,ordinal) do update set page_start=excluded.page_start,page_end=excluded.page_end,content=excluded.content,checksum=excluded.checksum,embedding=excluded.embedding,embedding_model=excluded.embedding_model,source_version=excluded.source_version`,
          parameters: [
            ...params,
            j.document_id,
            JSON.stringify(payload),
            doc.version ?? 1,
          ],
        },
        {
          statement: `delete from knowledge_chunks where tenant_id=$2 and document_id=$4 and ordinal >= $5 and ${fenceWhere}`,
          parameters: [...params, j.document_id, chunks.length],
        },
        {
          statement: `update knowledge_documents set chunk_count=$5,updated_at=now() where tenant_id=$2 and document_id=$4 and ${fenceWhere}`,
          parameters: [...params, j.document_id, cp.offset],
        },
      ]);
    } else if (cp.stage === "facts") {
      const pages = (await artifact(cp.artifactKey!)) as Page[];
      const units = chunkPages(pages, 1200, 0),
        offset = cp.factsOffset ?? 0;
      if (!cp.extractionWorkId) {
        cp.extractionWorkId = await createWork(
          c,
          "extraction_document",
          doc.case_id,
          j.document_id,
        );
        cp.extractionScopeEnd = j.payload.continueExtraction
          ? Math.min(offset + 6, units.length)
          : units.length;
        await db().query(
          "update jobs set checkpoint=$4::jsonb where id=$1 and tenant_id=$2 and fence=$3 and status='RUNNING' and lease_until>now()",
          [...params, JSON.stringify(cp)],
        );
      }
      await db().query(
        `update knowledge_documents set extraction_total=$5,extraction_covered=$6,extraction_status='PARTIAL' where tenant_id=$2 and document_id=$4 and ${fenceWhere}`,
        [...params, j.document_id, units.length, offset],
      );
      const planned = units.slice(offset, cp.extractionScopeEnd);
      const inputEstimate = planned.reduce(
        (n, u) => n + 2 * (tokenBound(u.content) + 2200),
        0,
      );
      try {
        await db().query("select app.prepare_extraction($1,$2,$3,$4)", [
          cp.extractionWorkId,
          inputEstimate,
          planned.length * 1200,
          planned.length * 2,
        ]);
      } catch {
        throw new ApiError(
          429,
          "DOCUMENT_EXTRACTION_BUDGET",
          "La extracción completa supera el presupuesto. Podés continuar por hasta seis unidades revisables por vez. La cobertura parcial queda registrada.",
        );
      }
      if (offset < units.length) {
        await withBudget(
          {
            workId: cp.extractionWorkId,
            profile: "extraction",
            task: "extract-facts",
            beforeCall: () => assertLease(c, j),
          },
          () => extractUnit(c, { ...j, checkpoint: cp }, doc, units[offset]!),
        );
        cp.factsOffset = offset + 1;
      }
      await db().query(
        `update knowledge_documents set extraction_covered=$5 where tenant_id=$2 and document_id=$4 and ${fenceWhere}`,
        [...params, j.document_id, cp.factsOffset],
      );
      if (cp.factsOffset! >= cp.extractionScopeEnd!) {
        await db().query("select app.release_extraction($1)", [
          cp.extractionWorkId,
        ]);
        if (cp.factsOffset! >= units.length) cp.stage = "complete";
        else {
          delete cp.extractionWorkId;
          delete cp.extractionScopeEnd;
          throw new ApiError(
            429,
            "EXTRACTION_CONTINUE_REQUIRED",
            "Cobertura parcial guardada. Continuá explícitamente con el siguiente grupo de unidades.",
          );
        }
      }
    }
    await assertLease(c, j);
    const done = ["complete", "ocr"].includes(cp.stage!);
    await db().transaction([
      guard(j),
      {
        statement: `update jobs set checkpoint=$4::jsonb,status=$5::sync_status,scheduled_at=now(),completed_at=case when $5='SUCCEEDED' then now() else null end,lease_until=null,attempt_count=case when $5='QUEUED' then 0 else attempt_count end,updated_at=now(),error_code=null where id=$1 and tenant_id=$2 and fence=$3 and status='RUNNING' and lease_until>now()`,
        parameters: [
          ...params,
          JSON.stringify(cp),
          done ? "SUCCEEDED" : "QUEUED",
        ],
      },
      {
        statement: `update knowledge_documents set status=$5,extraction_status=case when $6='PENDING' and extraction_status='COMPLETE' then extraction_status else $6 end,indexed_at=case when $5='READY' then now() else indexed_at end,updated_at=now() where tenant_id=$2 and document_id=$4 and exists(select 1 from jobs where id=$1 and fence=$3 and status=$7::sync_status)`,
        parameters: [
          ...params,
          j.document_id,
          cp.stage === "ocr" ? "NEEDS_OCR" : done ? "READY" : "PROCESSING",
          done && cp.stage !== "ocr" && cp.extractionWorkId
            ? "COMPLETE"
            : cp.stage === "facts"
              ? "PARTIAL"
              : "PENDING",
          done ? "SUCCEEDED" : "QUEUED",
        ],
      },
    ]);
    await audit(c, "INGESTION_STEP", "job", j.id, {
      stage: cp.stage,
      offset: cp.offset,
      factsOffset: cp.factsOffset,
      durationMs: Date.now() - started,
      rss: process.memoryUsage().rss,
      heap: process.memoryUsage().heapUsed,
      rssDelta: process.memoryUsage().rss - memory.rss,
      database: dbMeasurements(),
    });
    return { processed: true, id: j.id, checkpoint: cp, done };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "INGESTION_FAILED";
    if (code === "STALE_LEASE")
      return { processed: false, id: j.id, error: code };
    const transient = [
      "STORAGE_UNAVAILABLE",
      "ARTIFACT_UNAVAILABLE",
      "MODEL_UNAVAILABLE",
    ].includes(code);
    const retry = transient && j.attempt_count < j.max_attempts;
    await db().transaction([
      guard(j),
      {
        statement: `update jobs set checkpoint=$4::jsonb,status=$5::sync_status,error_code=$6,lease_until=null,scheduled_at=now()+($7||' seconds')::interval,updated_at=now() where id=$1 and tenant_id=$2 and fence=$3 and status='RUNNING' and lease_until>now()`,
        parameters: [
          ...params,
          JSON.stringify(cp),
          retry ? "QUEUED" : "FAILED",
          code,
          Math.ceil(2 ** j.attempt_count + Math.random() * 3),
        ],
      },
      {
        statement: `update knowledge_documents set status='PARTIAL',extraction_status=case when $5='facts' then 'PARTIAL' else extraction_status end,error_code=$6,updated_at=now() where tenant_id=$2 and document_id=$4 and exists(select 1 from jobs where id=$1 and fence=$3)`,
        parameters: [...params, j.document_id, cp.stage ?? "parse", code],
      },
    ]);
    return { processed: true, id: j.id, error: code, retry, checkpoint: cp };
  }
}
