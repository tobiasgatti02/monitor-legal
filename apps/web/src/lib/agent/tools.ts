import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireWrite, type ApiContext } from "@/lib/api/context";
import { actionSchema, type Citation, type ToolDefinition } from "./contracts";
import { retrieve } from "./retrieval";
import { ApiError } from "@/lib/api/errors";

const lookupSchema = z
  .object({
    query: z.string().max(300).default(""),
    caseId: z.string().uuid().optional(),
  })
  .strict();
const knowledgeSchema = z
  .object({ query: z.string().min(1).max(1000) })
  .strict();
const clarificationSchema = z
  .object({ question: z.string().trim().min(1).max(1000) })
  .strict();
export function agentTools(
  context: ApiContext,
  threadId: string,
  caseId?: string,
) {
  const sources: Citation[] = [];
  let retrievalMode = "none";
  let clarification: string | undefined;
  let proposal: {title:string;citation:string;action:string}|undefined;
  const implementations = {
    requestClarification: {
      description:
        "Pedir un dato que falta para continuar, por ejemplo la causa o el tipo de escrito. Formular solo una pregunta, sin afirmar hechos ni derecho no verificado.",
      schema: clarificationSchema,
      execute: async (input: z.infer<typeof clarificationSchema>) => {
        clarification = input.question;
        return {
          question: clarification,
          instruction:
            "Mostrá esta pregunta al usuario para poder continuar. No afirmes hechos ni acciones ejecutadas.",
        };
      },
    },
    searchKnowledge: {
      description:
        "Buscar evidencia en documentos autorizados. Usar las citas S de los resultados.",
      schema: knowledgeSchema,
      execute: async (input: z.infer<typeof knowledgeSchema>) => {
        const result = await retrieve(context, input.query, caseId);
        retrievalMode = result.mode;
        return result.chunks.map((c) => {
          let source = sources.find((s) => s.chunkId === c.id);
          if (!source) {
            source = {
              id: `S${sources.filter((s) => s.chunkId).length + 1}`,
              title: c.title,
              excerpt: c.content,
              url: `/api/knowledge/${c.documentId}/source#page=${c.pageStart}`,
              documentId: c.documentId,
              chunkId: c.id,
              pageStart: c.pageStart,
              pageEnd: c.pageEnd,
            };
            sources.push(source);
          }
          return {
            citation: source.id,
            title: c.title,
            page: c.pageStart,
            text: c.content,
          };
        });
      },
    },
    searchCases: {
      description:
        "Consultar causas autorizadas y su próxima acción. No contiene análisis jurídico.",
      schema: lookupSchema,
      execute: async (input: z.infer<typeof lookupSchema>) => {
        const rows = await db().query(
          `select id,title,docket_number,court,status,next_action,next_action_at from cases
          where tenant_id=$1 and deleted_at is null and ($2='' or title ilike '%'||$2||'%' or docket_number ilike '%'||$2||'%')
            and ($3::uuid is null or id=$3) order by updated_at desc limit 15`,
          [context.tenantId, input.query, caseId ?? input.caseId ?? null],
        );
        return records(
          rows,
          "causas",
          "No encontré causas accesibles que coincidan con esta consulta.",
        );
      },
    },
    searchClients: {
      description: "Consultar datos de contacto de clientes autorizados.",
      schema: lookupSchema,
      execute: async (input: z.infer<typeof lookupSchema>) => {
        const rows = await db().query(
          `select cl.id,cl.full_name,cl.email,cl.phone,cl.whatsapp,cl.status from clients cl
          where cl.tenant_id=$1 and cl.deleted_at is null and ($2='' or cl.full_name ilike '%'||$2||'%')
          and ($3::uuid is null or exists(select 1 from cases c where c.client_id=cl.id and c.tenant_id=cl.tenant_id and c.id=$3)) limit 15`,
          [context.tenantId, input.query, caseId ?? input.caseId ?? null],
        );
        return records(
          rows,
          "clientes",
          "No encontré clientes accesibles que coincidan con esta consulta.",
        );
      },
    },
    getDeadlines: {
      description:
        "Consultar plazos registrados, incluidos los posibles que requieren confirmación. No calcular vencimientos legales.",
      schema: lookupSchema,
      execute: async (input: z.infer<typeof lookupSchema>) => {
        const rows = await db().query(
          `select id,case_id,title,due_at,status,notes from deadlines where tenant_id=$1
          and status not in('COMPLETED','DISMISSED') and ($2='' or title ilike '%'||$2||'%')
          and ($3::uuid is null or case_id=$3) order by due_at limit 30`,
          [context.tenantId, input.query, caseId ?? input.caseId ?? null],
        );
        return records(
          rows,
          "tareas",
          "No encontré plazos pendientes registrados para esta consulta. Esto no confirma la ausencia de vencimientos legales.",
        );
      },
    },
    getTasks: {
      description: "Consultar tareas pendientes del estudio y responsables.",
      schema: lookupSchema,
      execute: async (input: z.infer<typeof lookupSchema>) => {
        const rows = await db().query(
          `select id,case_id,title,due_at,status,priority from tasks where tenant_id=$1
          and status not in('DONE','CANCELLED') and ($2='' or title ilike '%'||$2||'%') and ($3::uuid is null or case_id=$3)
          order by due_at nulls last limit 30`,
          [context.tenantId, input.query, caseId ?? input.caseId ?? null],
        );
        return records(
          rows,
          "tareas",
          "No encontré tareas pendientes registradas para esta consulta.",
        );
      },
    },
    getReminders: {
      description:
        "Consultar recordatorios personales programados y alertas del usuario.",
      schema: lookupSchema,
      execute: async (input: z.infer<typeof lookupSchema>) => {
        const rows = await db().query(
          "select id,case_id,title,due_at,repeat_frequency,priority,status from reminders where tenant_id=$1 and user_id=$2 and status='ACTIVE' and ($3::uuid is null or case_id=$3) order by due_at limit 30",
          [context.tenantId, context.actorId, caseId ?? input.caseId ?? null],
        );
        return records(
          rows,
          "alertas",
          "No tenés recordatorios activos registrados para esta consulta.",
        );
      },
    },
    getMovements: {
      description:
        "Consultar movimientos judiciales originales y estado de revisión.",
      schema: lookupSchema,
      execute: async (input: z.infer<typeof lookupSchema>) => {
        const rows = await db().query(
          `select id,case_id,title,left(original_text,1200) as text,source_date,review_status from judicial_events
          where tenant_id=$1 and ($2='' or title ilike '%'||$2||'%') and ($3::uuid is null or case_id=$3)
          order by detected_at desc limit 15`,
          [context.tenantId, input.query, caseId ?? input.caseId ?? null],
        );
        return records(
          rows,
          "novedades",
          "No encontré movimientos judiciales accesibles que coincidan con esta consulta.",
        );
      },
    },
    proposeAction: {
      description:
        "Proponer un recordatorio personal, tarea, plazo POSIBLE o comunicación en borrador. CREATE_REMINDER requiere fecha ISO con zona horaria, admite recurrencia diaria o semanal y causa opcional. Nunca ejecuta la acción: requiere aprobación humana.",
      schema: actionSchema,
      execute: async (input: z.infer<typeof actionSchema>) => {
        requireWrite(context);
        input.caseId = input.caseId ?? caseId;
        if (caseId && input.caseId !== caseId)
          throw new ApiError(
            403,
            "SCOPE_MISMATCH",
            "La acción está fuera de la causa elegida.",
          );
        const cases = input.caseId
          ? await db().query(
              "select id from cases where tenant_id=$1 and id=$2 and deleted_at is null",
              [context.tenantId, input.caseId],
            )
          : [{ id: null }];
        if (!cases.length)
          throw new ApiError(404, "NOT_FOUND", "Causa no accesible.");
        const rows = await db().query(
          `insert into agent_approvals(tenant_id,user_id,thread_id,case_id,action,payload)
          values($1,$2,$3,$4,$5,$6::jsonb) returning id,status,action,payload`,
          [
            context.tenantId,
            context.actorId,
            threadId,
            input.caseId ?? null,
            input.action,
            JSON.stringify(input),
          ],
        );
        const citation = `R${sources.filter((s) => !s.chunkId).length + 1}`;
        sources.push({
          id: citation,
          title: `Propuesta: ${input.title}`,
          url: "/agente",
          excerpt: JSON.stringify(rows[0]),
          caseId: input.caseId,
        });
        proposal={title:input.title,citation,action:input.action};
        return {
          approval: rows[0],
          citation,
          instruction:
            "Pendiente de aprobación humana. La acción aún no se ejecutó.",
        };
      },
    },
  };
  function records(
    rows: Record<string, unknown>[],
    route: string,
    emptyMessage: string,
  ) {
    if (!rows.length) {
      const citation = `R${sources.filter((s) => !s.chunkId).length + 1}`;
      sources.push({
        id: citation,
        title: "Resultado de la consulta",
        url: `/${route}`,
        excerpt: emptyMessage,
        caseId,
      });
      return [{ message: emptyMessage, citation }];
    }
    return rows.map((row) => {
      const source: Citation = {
        id: `R${sources.filter((s) => !s.chunkId).length + 1}`,
        title: String(row.title ?? row.full_name ?? "Registro del estudio"),
        url: route === "causas" ? `/causas/${row.id}` : `/${route}`,
        excerpt: JSON.stringify(row),
      };
      source.caseId =
        route === "causas"
          ? String(row.id)
          : row.case_id
            ? String(row.case_id)
            : undefined;
      source.clientId = route === "clientes" ? String(row.id) : undefined;
      sources.push(source);
      return { ...row, citation: source.id };
    });
  }
  const definitions: ToolDefinition[] = Object.entries(implementations).map(
    ([name, tool]) => ({
      type: "function",
      function: {
        name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.schema, { io: "input" }) as Record<
          string,
          unknown
        >,
      },
    }),
  );
  return {
    definitions,
    sources,
    get retrievalMode() {
      return retrievalMode;
    },
    get proposal(){return proposal;},
    get clarification() {
      return clarification;
    },
    async execute(name: string, raw: string) {
      if (!(name in implementations))
        throw new ApiError(422, "UNKNOWN_TOOL", "Herramienta no permitida.");
      const tool = implementations[name as keyof typeof implementations];
      // Union schemas are validated before the matching implementation executes.
      const input = tool.schema.parse(JSON.parse(raw));
      return (tool.execute as (value: unknown) => Promise<unknown>)(input);
    },
  };
}
