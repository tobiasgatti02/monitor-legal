import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import {
  requireWrite,
  requireRoles,
  audit,
  type ApiContext,
} from "@/lib/api/context";
import { requireCapability } from "./flags";
import {
  specialties,
  procedureBody,
  discrepancies,
  type Specialty,
  type FolderFact,
} from "./procedures";
import { artifact } from "./storage";
import type { Page } from "./jobs";

export const folderAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CONFIGURE"),
      specialty: z.enum(["WORK_ACCIDENT", "HEALTH", "LABOR", "SUCCESSION"]),
      jurisdiction: z.string().trim().min(1).max(200),
      forum: z.string().trim().min(1).max(200),
      court: z.string().trim().min(1).max(200),
      stage: z.string().max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal("ADD_FACT"),
      kind: z.enum(["FACT", "EVENT", "PERSON", "ASSET"]),
      label: z.string().min(1).max(200),
      value: z.string().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      action: z.literal("REVIEW_FACT"),
      id: z.string().uuid(),
      status: z.enum(["CONFIRMED", "REJECTED"]),
      value: z.string().min(1).max(4000),
      reason: z.string().min(1).max(2000),
    })
    .strict(),
  z.object({ action: z.literal("INIT_CHECKLIST") }).strict(),
  z
    .object({
      action: z.literal("ADD_ITEM"),
      label: z.string().min(1).max(200),
      description: z.string().max(2000).default(""),
      dependsOn: z.string().uuid().optional(),
      responsibleUserId: z.string().max(200).optional(),
      dueAt: z.string().datetime({ offset: true }).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("UPDATE_ITEM"),
      id: z.string().uuid(),
      status: z.enum(["PENDING", "REQUESTED", "RECEIVED", "WAIVED"]),
      documentId: z.string().uuid().optional(),
      label: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).optional(),
      responsibleUserId: z.string().max(200).optional(),
      dueAt: z.string().datetime({ offset: true }).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("REGISTER_OBLIGATION"),
      factId: z.string().uuid(),
      title: z.string().min(1).max(200),
      dueAt: z.string().datetime({ offset: true }).optional(),
      responsibleUserId: z.string().max(200).optional(),
    })
    .strict(),
  z.object({ action: z.literal("PROCEDURE") }).strict(),
  z
    .object({ action: z.literal("REVIEW_OUTPUT"), id: z.string().uuid() })
    .strict(),
]);
export async function loadFolder(c: ApiContext, id: string) {
  requireCapability("liveFolder");
  const rows = await db().query(
    "select id,title,specialty,jurisdiction,forum,court,legal_stage,next_action,next_action_at,updated_at from cases where tenant_id=$1 and id=$2 and deleted_at is null",
    [c.tenantId, id],
  );
  const cause = rows[0];
  if (!cause) throw new ApiError(404, "NOT_FOUND", "Causa no accesible.");
  const [facts, checklist, documents, outputs, obligations, members] =
    await Promise.all([
      db().query(
        `select f.*,count(*) over()::int as total from case_facts f where tenant_id=$1 and case_id=$2 order by event_date nulls last,created_at limit 200`,
        [c.tenantId, id],
      ),
      db().query(
        `select i.*,d.status as dependency_status,u.full_name as responsible_name from case_checklists i left join case_checklists d on d.id=i.depends_on and d.case_id=i.case_id and d.tenant_id=i.tenant_id left join users u on u.id=i.responsible_user_id where i.tenant_id=$1 and i.case_id=$2 order by i.created_at limit 100`,
        [c.tenantId, id],
      ),
      db().query(
        `select d.id,d.name,d.content_hash,k.status,k.page_count,k.covered_pages,k.extraction_status,k.extraction_total,k.extraction_covered from documents d left join knowledge_documents k on k.document_id=d.id and k.tenant_id=d.tenant_id where d.tenant_id=$1 and d.case_id=$2 and d.deleted_at is null order by d.created_at limit 200`,
        [c.tenantId, id],
      ),
      db().query(
        "select id,kind,title,body,revision,metadata,stale,reviewed_at,created_at from case_outputs where tenant_id=$1 and case_id=$2 order by created_at desc limit 20",
        [c.tenantId, id],
      ),
      db().query(
        "select id,title,status,due_at,responsible_user_id,source_fact_id from tasks where tenant_id=$1 and case_id=$2 and source_fact_id is not null order by created_at desc limit 100",
        [c.tenantId, id],
      ),
      db().query(
        "select tm.user_id,u.full_name from tenant_members tm join users u on u.id=tm.user_id where tm.tenant_id=$1 and tm.active order by u.full_name limit 100",
        [c.tenantId],
      ),
    ]);
  const partial =
    documents.some(
      (d) => d.status !== "READY" || d.extraction_status !== "COMPLETE",
    ) ||
    Number(facts[0]?.total ?? 0) > facts.length ||
    documents.length === 200 ||
    checklist.length === 100;
  return {
    cause,
    obligations,
    members,
    facts: facts as unknown as FolderFact[],
    checklist,
    documents,
    outputs,
    partial,
    discrepancies: discrepancies(facts as unknown as FolderFact[]),
  };
}
type EvidenceFact = FolderFact & { start_offset?: number; end_offset?: number };
export async function verifyFact(c: ApiContext, fact: EvidenceFact) {
  return verifyFacts(c, [fact]);
}
export async function verifyFacts(c: ApiContext, facts: EvidenceFact[]) {
  if (facts.length > 200)
    throw new ApiError(
      422,
      "EVIDENCE_LIMIT",
      "Revisá evidencia por grupos acotados.",
    );
  if (facts.some((f) => f.stale))
    throw new ApiError(
      409,
      "STALE_EVIDENCE",
      "La evidencia está desactualizada.",
    );
  const documentary = facts.filter((f) => f.document_id);
  if (!documentary.length) return;
  const rows = await db().query(
    `select d.id,d.content_hash,d.case_id,k.artifact_key,v.version,v.content_hash as version_hash from documents d join knowledge_documents k on k.document_id=d.id and k.tenant_id=d.tenant_id join document_versions v on v.document_id=d.id and v.tenant_id=d.tenant_id where d.tenant_id=$1 and d.id=any($2::uuid[]) and v.version=any($3::int[]) and d.deleted_at is null`,
    [
      c.tenantId,
      [...new Set(documentary.map((f) => f.document_id))],
      [...new Set(documentary.map((f) => f.source_version))],
    ],
  );
  for (const documentId of new Set(documentary.map((f) => f.document_id))) {
    const group = documentary.filter((f) => f.document_id === documentId),
      doc = rows.find((r) => r.id === documentId);
    if (!doc?.artifact_key)
      throw new ApiError(409, "SOURCE_CHANGED", "Falta acceso a la fuente.");
    const pages = (await artifact(doc.artifact_key)) as Page[];
    for (const fact of group) {
      const version = rows.find(
        (r) => r.id === documentId && Number(r.version) === fact.source_version,
      );
      if (
        doc.content_hash !== fact.source_checksum ||
        version?.version_hash !== fact.source_checksum
      )
        throw new ApiError(
          409,
          "SOURCE_CHANGED",
          "Cambió la versión de la fuente.",
        );
      const text = pages.find((p) => p.page === fact.page)?.text;
      if (
        !text ||
        text.slice(fact.start_offset, fact.end_offset) !== fact.passage
      )
        throw new ApiError(
          422,
          "PASSAGE_NOT_VERIFIED",
          "El pasaje no coincide con el texto de la fuente.",
        );
    }
  }
}
export async function folderMutation(
  c: ApiContext,
  id: string,
  input: z.infer<typeof folderAction>,
) {
  requireWrite(c);
  const folder = await loadFolder(c, id);
  if (input.action === "CONFIGURE") {
    await db().query(
      "update cases set specialty=$3,jurisdiction=$4,forum=$5,court=$6,legal_stage=$7,updated_at=now() where tenant_id=$1 and id=$2",
      [
        c.tenantId,
        id,
        input.specialty,
        input.jurisdiction,
        input.forum,
        input.court,
        input.stage,
      ],
    );
  } else if (input.action === "ADD_FACT") {
    await db().query(
      "insert into case_facts(tenant_id,case_id,kind,label,original_value,status,author) values($1,$2,$3,$4,$5,'REPORTED',$6)",
      [c.tenantId, id, input.kind, input.label, input.value, c.actorId],
    );
  } else if (input.action === "REVIEW_FACT") {
    requireRoles(c, ["OWNER", "ADMIN", "LAWYER"]);
    const rows = await db().query(
      "select * from case_facts where tenant_id=$1 and case_id=$2 and id=$3",
      [c.tenantId, id, input.id],
    );
    const f = rows[0];
    if (!f) throw new ApiError(404, "NOT_FOUND", "Hecho no accesible.");
    if (input.status === "CONFIRMED")
      await verifyFact(c, f as unknown as FolderFact);
    await db().query(
      `with locked as(select * from case_facts where tenant_id=$1 and case_id=$2 and id=$3 for update),history as(insert into case_fact_reviews(tenant_id,case_id,fact_id,old_value,new_value,status,actor,reason) select $1,$2,id,coalesce(normalized_value,original_value),$4,$5,$6,$7 from locked returning id) update case_facts set normalized_value=$4,status=$5,updated_at=now() where tenant_id=$1 and case_id=$2 and id=$3 and exists(select 1 from history)`,
      [
        c.tenantId,
        id,
        input.id,
        input.value,
        input.status,
        c.actorId,
        input.reason,
      ],
    );
  } else if (input.action === "INIT_CHECKLIST") {
    const specialty = folder.cause.specialty as Specialty;
    if (!specialties[specialty])
      throw new ApiError(
        422,
        "SPECIALTY_REQUIRED",
        "Configurá la especialidad primero.",
      );
    await db().transaction(
      specialties[specialty].documents.map((label, index) => ({
        statement:
          "insert into case_checklists(tenant_id,case_id,definition_key,definition_version,label,description,created_by) values($1,$2,$3,1,$4,'Lista inicial sintética y configurable; revisar con el abogado',$5) on conflict do nothing",
        parameters: [c.tenantId, id, `${specialty}:${index}`, label, c.actorId],
      })),
    );
  } else if (input.action === "ADD_ITEM") {
    if (input.responsibleUserId)
      await checkResponsible(c, input.responsibleUserId);
    await db().query(
      "insert into case_checklists(tenant_id,case_id,definition_key,definition_version,label,description,depends_on,responsible_user_id,due_at,created_by) values($1,$2,gen_random_uuid()::text,1,$3,$4,$5,$6,$7,$8)",
      [
        c.tenantId,
        id,
        input.label,
        input.description,
        input.dependsOn ?? null,
        input.responsibleUserId ?? null,
        input.dueAt ?? null,
        c.actorId,
      ],
    );
  } else if (input.action === "UPDATE_ITEM") {
    if (input.responsibleUserId)
      await checkResponsible(c, input.responsibleUserId);
    if (
      input.documentId &&
      !(
        await db().query(
          "select id from documents where tenant_id=$1 and case_id=$2 and id=$3 and deleted_at is null",
          [c.tenantId, id, input.documentId],
        )
      ).length
    )
      throw new ApiError(
        404,
        "DOCUMENT_NOT_ACCESSIBLE",
        "El documento no pertenece a esta causa.",
      );
    const rows = await db().query(
      `update case_checklists i set status=$4,document_id=$5,label=coalesce($6,label),description=coalesce($7,description),responsible_user_id=coalesce($8,responsible_user_id),due_at=coalesce($9,due_at),updated_at=now() where tenant_id=$1 and case_id=$2 and id=$3 and ($4 not in('RECEIVED','WAIVED') or depends_on is null or exists(select 1 from case_checklists dep where dep.id=i.depends_on and dep.tenant_id=i.tenant_id and dep.case_id=i.case_id and dep.status in('RECEIVED','WAIVED'))) returning id`,
      [
        c.tenantId,
        id,
        input.id,
        input.status,
        input.documentId ?? null,
        input.label ?? null,
        input.description ?? null,
        input.responsibleUserId ?? null,
        input.dueAt ?? null,
      ],
    );
    if (!rows.length)
      throw new ApiError(
        409,
        "DEPENDENCY_PENDING",
        "Falta resolver la dependencia o el ítem no es accesible.",
      );
  } else if (input.action === "REGISTER_OBLIGATION") {
    requireRoles(c, ["OWNER", "ADMIN", "LAWYER"]);
    if (folder.cause.specialty !== "HEALTH")
      throw new ApiError(
        422,
        "HEALTH_REQUIRED",
        "La obligación corresponde al procedimiento de salud.",
      );
    const f = folder.facts.find((f) => f.id === input.factId);
    if (!f || f.status !== "CONFIRMED" || f.stale || !f.document_id)
      throw new ApiError(
        422,
        "CONFIRMED_EVIDENCE_REQUIRED",
        "Seleccioná una obligación documentada y confirmada.",
      );
    await verifyFact(c, f);
    if (input.responsibleUserId)
      await checkResponsible(c, input.responsibleUserId);
    await db().query(
      `insert into tasks(tenant_id,case_id,title,description,due_at,responsible_user_id,source_fact_id,created_by) select $1,$2,$3,$4,$5,$6,$7,$8 where exists(select 1 from case_facts where tenant_id=$1 and case_id=$2 and id=$7 and status='CONFIRMED' and not stale) on conflict do nothing`,
      [
        c.tenantId,
        id,
        input.title,
        `Obligación revisada por el abogado. Fuente: ${f.document_id}, versión ${f.source_version}, página ${f.page}. Pasaje: ${f.passage}. Fecha ingresada manualmente; no se calculó un plazo procesal.`,
        input.dueAt ?? null,
        input.responsibleUserId ?? c.actorId,
        f.id,
        c.actorId,
      ],
    );
  } else if (input.action === "PROCEDURE") {
    const specialty = folder.cause.specialty as Specialty;
    if (
      !specialties[specialty] ||
      !folder.cause.jurisdiction ||
      !folder.cause.forum ||
      !folder.cause.court
    )
      throw new ApiError(
        422,
        "CASE_CONTEXT_REQUIRED",
        "Registrá especialidad, jurisdicción, fuero y tribunal.",
      );
    const body = procedureBody(
      specialty,
      folder.facts,
      folder.checklist as { label: string; status: string }[],
      folder.documents as { id: string; name: string }[],
      folder.partial,
    );
    await db().query(
      "insert into case_outputs(tenant_id,case_id,kind,title,body,metadata,created_by) values($1,$2,'PROCEDURE',$3,$4,$5::jsonb,$6)",
      [
        c.tenantId,
        id,
        specialties[specialty].label,
        body,
        JSON.stringify({
          partial: folder.partial,
          specialty,
          evidence: folder.facts
            .filter((f) => !f.stale && f.status !== "REJECTED" && f.document_id)
            .map((f) => ({
              factId: f.id,
              documentId: f.document_id,
              version: f.source_version,
              checksum: f.source_checksum,
            })),
        }),
        c.actorId,
      ],
    );
  } else if (input.action === "REVIEW_OUTPUT") {
    requireRoles(c, ["OWNER", "ADMIN", "LAWYER"]);
    const output = folder.outputs.find((o) => o.id === input.id);
    if (!output || output.stale)
      throw new ApiError(
        409,
        "OUTPUT_STALE",
        "El resultado requiere regeneración o no es accesible.",
      );
    if (output.kind === "DRAFT" && /\{\{|\bPENDIENTE\b/.test(output.body))
      throw new ApiError(
        422,
        "PLACEHOLDERS_PENDING",
        "Completá y revisá los campos pendientes antes de registrar revisión.",
      );
    const evidence = (output.metadata?.evidence ?? []) as { factId: string }[];
    const refs = await db().query(
      "select * from case_facts where tenant_id=$1 and case_id=$2 and id=any($3::uuid[])",
      [c.tenantId, id, evidence.map((e) => e.factId)],
    );
    if (
      refs.length !== evidence.length ||
      refs.some((f) => f.status !== "CONFIRMED")
    )
      throw new ApiError(
        422,
        "FACT_REVIEW_REQUIRED",
        "Confirmá los hechos citados antes de revisar el resultado.",
      );
    await verifyFacts(c, refs as unknown as EvidenceFact[]);
    await db().query(
      "update case_outputs set reviewed_by=$4,reviewed_at=now() where tenant_id=$1 and case_id=$2 and id=$3 and not stale",
      [c.tenantId, id, input.id, c.actorId],
    );
  }
  if (
    [
      "ADD_FACT",
      "REVIEW_FACT",
      "UPDATE_ITEM",
      "CONFIGURE",
      "ADD_ITEM",
      "INIT_CHECKLIST",
    ].includes(input.action)
  )
    await db().query(
      "update case_outputs set stale=true where tenant_id=$1 and case_id=$2",
      [c.tenantId, id],
    );
  await audit(c, `FOLDER_${input.action}`, "case", id);
  return loadFolder(c, id);
}
async function checkResponsible(c: ApiContext, user: string) {
  if (
    !(
      await db().query(
        "select user_id from tenant_members where tenant_id=$1 and user_id=$2 and active",
        [c.tenantId, user],
      )
    ).length
  )
    throw new ApiError(
      422,
      "RESPONSIBLE_NOT_MEMBER",
      "El responsable debe pertenecer al estudio.",
    );
}
