import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireWrite, audit, type ApiContext } from "@/lib/api/context";
import { loadFolder } from "./folder";
// Separate provenance from transport. These imports never claim a live judicial session.
export const importSchema = z
  .object({
    source: z.enum(["PJN", "MEV_SCBA", "SCBA_NOTIFICACIONES"]),
    title: z.string().min(1).max(300),
    text: z.string().min(1).max(30000),
    sourceUrl: z
      .url()
      .refine((s) => new URL(s).protocol === "https:")
      .optional(),
    sourceDate: z.string().datetime({ offset: true }).optional(),
    sourceIdentifier: z.string().max(200).optional(),
    documentId: z.string().uuid().optional(),
  })
  .strict();
export async function manualImport(
  c: ApiContext,
  caseId: string,
  input: z.infer<typeof importSchema>,
) {
  requireWrite(c);
  await loadFolder(c, caseId);
  if (
    input.documentId &&
    !(
      await db().query(
        "select id from documents where tenant_id=$1 and case_id=$2 and id=$3 and deleted_at is null",
        [c.tenantId, caseId, input.documentId],
      )
    ).length
  )
    throw new ApiError(
      404,
      "DOCUMENT_NOT_ACCESSIBLE",
      "El documento no pertenece a la causa.",
    );
  const checksum = createHash("sha256").update(input.text).digest("hex");
  const rows = await db().query(
    `insert into judicial_events(tenant_id,case_id,connector_id,source,event_type,source_event_id,source_url,source_date,title,original_text,normalized_text,content_hash,metadata,created_by)
  values($1,$2,null,$3::judicial_source,'MOVEMENT',$8,$9,$10,$4,$5,$5,$6,$11::jsonb,$7) on conflict do nothing returning id`,
    [
      c.tenantId,
      caseId,
      input.source,
      input.title,
      input.text,
      checksum,
      c.actorId,
      `${caseId}:${input.sourceIdentifier ?? "manual"}`,
      input.sourceUrl ?? null,
      input.sourceDate ?? null,
      JSON.stringify({
        transport: "MANUAL",
        documentId: input.documentId ?? null,
        checksum,
        notice:
          "Importación manual. Movimiento referencial, no determina notificación formal ni inicio de plazo.",
      }),
    ],
  );
  await audit(c, "JUDICIAL_MANUAL_IMPORT", "case", caseId, {
    source: input.source,
    checksum,
    duplicate: !rows.length,
  });
  return { id: rows[0]?.id, duplicate: !rows.length, liveConnection: false };
}
