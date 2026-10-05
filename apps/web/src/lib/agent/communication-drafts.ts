import "server-only";
import { db } from "@/lib/db";
import { requireWrite, audit, type ApiContext } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { loadFolder, verifyFacts } from "./folder";
import type { FolderFact } from "./procedures";
export async function proposeClientDraft(c: ApiContext, caseId: string) {
  requireWrite(c);
  const folder = await loadFolder(c, caseId);
  const output = folder.outputs.find(
    (o) => o.reviewed_at && !o.stale && o.kind === "PROCEDURE",
  );
  if (!output)
    throw new ApiError(
      422,
      "REVIEWED_ACTIVITY_REQUIRED",
      "Registrá revisión de la actividad antes de preparar una actualización al cliente.",
    );
  const ids = (output.metadata.evidence ?? []).map(
    (ref: { factId: string }) => ref.factId,
  );
  const facts = await db().query(
    "select * from case_facts where tenant_id=$1 and case_id=$2 and id=any($3::uuid[])",
    [c.tenantId, caseId, ids],
  );
  if (
    facts.length !== ids.length ||
    facts.some((f) => f.status !== "CONFIRMED")
  )
    throw new ApiError(409, "SOURCE_CHANGED", "La evidencia cambió.");
  await verifyFacts(c, facts as unknown as FolderFact[]);
  const pending = folder.checklist.filter((i) =>
    ["PENDING", "REQUESTED"].includes(i.status),
  );
  const body = `Actualización para revisión del abogado\n\nSe revisó la carpeta de ${folder.cause.title}.\n${pending.length ? `Documentación pendiente registrada: ${pending.map((i) => i.label).join(", ")}.` : "No hay pedidos documentales pendientes registrados."}\nPróximo paso registrado: ${folder.cause.next_action ?? "A confirmar por el abogado"}.\nEste borrador no confirma plazos, resultados judiciales ni conclusiones médicas.`;
  const rows = await db().query(
    `with thread as(insert into agent_threads(tenant_id,user_id,case_id,title) values($1,$2,$3,'Actualización al cliente para revisión') returning id)
 insert into agent_approvals(tenant_id,user_id,thread_id,case_id,action,payload)
 select $1,$2,id,$3,'DRAFT_COMMUNICATION',$4::jsonb from thread where exists(select 1 from case_outputs where id=$5 and tenant_id=$1 and case_id=$3 and reviewed_at is not null and not stale) returning id,thread_id`,
    [
      c.tenantId,
      c.actorId,
      caseId,
      JSON.stringify({
        title: `Actualización de ${folder.cause.title}`,
        body,
        sourceOutputId: output.id,
      }),
      output.id,
    ],
  );
  if (!rows.length)
    throw new ApiError(
      409,
      "SOURCE_CHANGED",
      "La actividad cambió durante la preparación.",
    );
  await audit(c, "CLIENT_DRAFT_PROPOSED", "agent-approval", rows[0]!.id);
  return {
    id: rows[0]!.id as string,
    thread_id: rows[0]!.thread_id as string,
    body,
    status: "PENDING_APPROVAL",
    sent: false,
  };
}
