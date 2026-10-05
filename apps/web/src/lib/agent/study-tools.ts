import "server-only";
import { z } from "zod";
import { resources, listResource, getResource, createResource, updateResource, deleteResource, type ResourceName, type ResourceConfig } from "@/lib/api/resources";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { audit, requireWrite, type ApiContext } from "@/lib/api/context";
import { folderAction, loadFolder, folderMutation } from "./folder";
import { draftSchema, draftMutation } from "./drafts";
import { importSchema, manualImport } from "./imports";
import { documentInput, createAgentDocument, readAgentDocument } from "./study-documents";

const moduleSchema = z.enum(Object.keys(resources) as [ResourceName, ...ResourceName[]]);
const dataSchema = z.record(z.string(), z.unknown());
const caseSchema = z.string().uuid();

export function studyTools(
  c: ApiContext,
  selectedCase: string | undefined,
  record: (rows: Record<string, unknown>[], route: string, empty: string) => unknown,
  finish: (message: string) => void,
) {
  function request(method: string, body?: unknown, query?: string) {
    return new Request(`https://agent.internal/api/resources${query ? `?${query}` : ""}`, {
      method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  }
  function route(id: string) { return { params: Promise.resolve({ id }) }; }
  function constrain(module: ResourceName, data: Record<string, unknown>, id?: string) {
    if (!selectedCase) return data;
    if (module === "cases" && id !== selectedCase)
      throw new ApiError(403, "SCOPE_MISMATCH", "Abrí una conversación general para gestionar otra causa.");
    if (data.caseId && data.caseId !== selectedCase)
      throw new ApiError(403, "SCOPE_MISMATCH", "El registro está fuera de la causa elegida.");
    if (module !== "cases" && "caseId" in resources[module].fields)
      return { ...data, caseId: selectedCase };
    return data;
  }
  async function checkRecordScope(module: ResourceName, id: string) {
    const r = await getResource(request("GET"), route(id), module, c);
    const previous = (await r.json()).data;
    if (selectedCase && (module === "cases" ? id !== selectedCase : previous.caseId !== selectedCase))
      throw new ApiError(403, "SCOPE_MISMATCH", "Abrí una conversación general para gestionar este registro.");
    return previous;
  }
  async function result(response: Response, module: string, message?: string) {
    const body = await response.json();
    const rows = Array.isArray(body.data) ? body.data : [body.data];
    const paths: Record<string, string> = { clients: "clientes", cases: "causas", tasks: "tareas", deadlines: "tareas", calendar: "tareas", communications: "clientes", fees: "honorarios", payments: "honorarios", integrations: "integraciones" };
    const entries = record(rows.map((row: Record<string, unknown>) => ({ ...row, case_id: row.caseId })), paths[module] ?? module, "No encontré registros accesibles.");
    if (message) {
      const citation = (entries as { citation: string }[])[0]?.citation;
      const label = rows[0]?.title ?? rows[0]?.fullName ?? rows[0]?.subject;
      finish(`${message}${label ? ` «${label}».` : ""} [${citation}]`);
    }
    return { records: entries, pagination: body.pagination };
  }
  function caseScope(id: string) {
    if (selectedCase && selectedCase !== id)
      throw new ApiError(403, "SCOPE_MISMATCH", "La causa está fuera de esta conversación.");
  }
  return {
    describeModule: {
      description: "Consultar campos y reglas exactos antes de crear o editar: clients, cases, leads, tasks, deadlines, calendar, communications, fees, payments, integrations. No inventes nombres de campos.",
      schema: z.object({ module: moduleSchema, operation: z.enum(["create", "update"]) }).strict(),
      execute: async (input: { module: ResourceName; operation: "create" | "update" }) => {
        const config: ResourceConfig = resources[input.module];
        return z.toJSONSchema(input.operation === "create" ? config.createSchema : config.updateSchema, { io: "input" });
      },
    },
    readStudyRecords: {
      description: "Leer cualquier módulo del estudio: buscar/listar registros, estados completos, o leer un registro por ID. Incluye notas e historia de clientes, honorarios, pagos y calendario. Conservá IDs para modificar.",
      schema: z.object({ module: moduleSchema, id: z.string().uuid().optional(), search: z.string().max(300).optional(), page: z.number().int().min(1).max(1000).default(1) }).strict(),
      execute: async (input: { module: ResourceName; id?: string; search?: string; page: number }) => {
        if (input.id) {
          await checkRecordScope(input.module, input.id);
          return result(await getResource(request("GET"), route(input.id), input.module, c), input.module);
        }
        if (selectedCase && input.module === "cases")
          return result(await getResource(request("GET"), route(selectedCase), "cases", c), "cases");
        if (selectedCase && !("caseId" in resources[input.module].fields))
          throw new ApiError(403, "SCOPE_MISMATCH", "Usá la conversación general para listar este módulo.");
        const query = new URLSearchParams({ page: String(input.page), limit: "10", search: input.search ?? "" });
        return result(await listResource(request("GET", undefined, query.toString()), input.module, selectedCase ? { caseId: selectedCase } : {}, c), input.module);
      },
    },
    createStudyRecord: {
      description: "Crear un registro solicitado por el usuario con los campos de describeModule. Ejecuta y devuelve el registro real. Tareas y clientes no requieren documentos. No usar para enviar comunicaciones.",
      schema: z.object({ module: moduleSchema, data: dataSchema }).strict(),
      execute: async (input: { module: ResourceName; data: Record<string, unknown> }) => {
        const data = constrain(input.module, input.data);
        if (input.module === "communications") data.status = "DRAFT";
        if (input.module === "deadlines") data.status = "POSSIBLE";
        if (input.module === "tasks" && !data.responsibleUserId) data.responsibleUserId = c.actorId;
        return result(await createResource(request("POST", data), input.module, {}, c), input.module, "Creé el registro solicitado.");
      },
    },
    updateStudyRecord: {
      description: "Modificar un registro existente después de leerlo. Usá su ID real y los campos de describeModule; permite completar/cancelar tareas, editar causas, datos y notas/historias de clientes. Ejecuta el cambio y devuelve el registro actualizado.",
      schema: z.object({ module: moduleSchema, id: z.string().uuid(), data: dataSchema }).strict(),
      execute: async (input: { module: ResourceName; id: string; data: Record<string, unknown> }) => {
        await checkRecordScope(input.module, input.id);
        if (input.module === "communications" && input.data.status && input.data.status !== "DRAFT")
          throw new ApiError(422, "DRAFT_ONLY", "Esta herramienta conserva la comunicación como borrador.");
        return result(await updateResource(request("PATCH", constrain(input.module, input.data, input.id)), route(input.id), input.module, c), input.module, "Actualicé el registro solicitado.");
      },
    },
    archiveStudyRecord: {
      description: "Archivar clientes, causas o leads sólo cuando el usuario lo pida explícitamente. Conserva el registro con borrado lógico. Para tareas usar updateStudyRecord status CANCELLED.",
      schema: z.object({ module: z.enum(["clients", "cases", "leads"]), id: z.string().uuid() }).strict(),
      execute: async (input: { module: "clients" | "cases" | "leads"; id: string }) => {
        await checkRecordScope(input.module, input.id);
        await deleteResource(request("DELETE"), route(input.id), input.module, c);
        const entries = record([{ id: input.id, title: "Registro archivado", archived: true }], "auditoria", "") as { citation: string }[];
        finish(`Archivé el registro solicitado. [${entries[0]!.citation}]`);
        return entries;
      },
    },
    listDocuments: {
      description: "Listar archivos autorizados con IDs y fecha de carga. search busca sólo texto literal del nombre, no contenido. Para el último subido o más reciente: search vacío, sort newest, limit 1; para el primero: oldest. offset permite seleccionar el siguiente/anterior del listado. No uses palabras de orden como búsqueda. Para leer contenido usá readDocument con el ID del resultado.",
      schema: z.object({
        search: z.string().max(300).default("").describe("Texto literal del nombre. Vacío para seleccionar por fecha u orden."),
        caseId: caseSchema.optional(),
        sort: z.enum(["newest", "oldest"]).default("newest").describe("Orden por fecha de carga, no por fecha del contenido."),
        limit: z.number().int().min(1).max(20).default(20),
        offset: z.number().int().min(0).max(1000).default(0),
        uploadedFrom: z.string().datetime({ offset: true }).optional(),
        uploadedBefore: z.string().datetime({ offset: true }).optional(),
      }).strict(),
      execute: async (input: { search: string; caseId?: string; sort: "newest" | "oldest"; limit: number; offset: number; uploadedFrom?: string; uploadedBefore?: string }) => {
        if (input.caseId) caseScope(input.caseId);
        const id = selectedCase ?? input.caseId;
        const order = input.sort === "oldest" ? "asc" : "desc";
        const rows = await db().query(`select d.id,d.name,d.case_id,d.mime_type,d.size_bytes,d.created_at as "uploadedAt",k.status as extraction_status
          from documents d left join knowledge_documents k on k.document_id=d.id and k.tenant_id=d.tenant_id
          where d.tenant_id=$1 and d.deleted_at is null and ($2::uuid is null or d.case_id=$2)
            and ($3='' or d.name ilike '%'||$3||'%')
            and ($4::timestamptz is null or d.created_at >= $4::timestamptz)
            and ($5::timestamptz is null or d.created_at < $5::timestamptz)
          order by d.created_at ${order},d.id ${order} limit $6 offset $7`,
          [c.tenantId, id ?? null, input.search, input.uploadedFrom ?? null, input.uploadedBefore ?? null, input.limit, input.offset]);
        const empty = input.search
          ? `No hay documentos accesibles cuyo nombre coincida con «${input.search}» dentro de los filtros consultados. No se buscó en su contenido.`
          : "No hay documentos accesibles dentro de los filtros y la posición consultados.";
        return {
          records: record(rows, "documentos", empty),
          returnedCount: rows.length,
          filters: { ...input, caseId: id },
          searchedField: "name",
          orderedBy: "uploadedAt",
        };
      },
    },
    readDocument: {
      description: "Leer páginas de un PDF/DOCX original autorizado. Devuelve texto y cobertura; un PDF escaneado requiere OCR si no tiene texto. No inventar contenido de páginas faltantes.",
      schema: z.object({ documentId: z.string().uuid(), startPage: z.number().int().min(1).default(1), pageCount: z.number().int().min(1).max(3).default(2) }).strict(),
      execute: async (input: { documentId: string; startPage: number; pageCount: number }) => {
        const doc = await readAgentDocument(c, input.documentId, selectedCase, input.startPage, input.pageCount);
        const entries = record([{ id: input.documentId, title: doc.name, case_id: doc.caseId, ...doc }], "documentos", "");
        return entries;
      },
    },
    createDocument: {
      description: "Crear y guardar un archivo PDF, DOCX, TXT o Markdown con título y texto. Es un borrador para revisión; devuelve enlace de descarga. Sólo usar hechos proporcionados por usuario o leídos con herramientas, sin inventar hechos ni citas.",
      schema: documentInput,
      execute: async (input: z.infer<typeof documentInput>) => {
        requireWrite(c);
        if (input.caseId) caseScope(input.caseId);
        const doc = await createAgentDocument(c, { ...input, caseId: selectedCase ?? input.caseId });
        const entries = record([doc], "documentos", "") as { citation: string }[];
        finish(`Creé el documento «${doc.title}». [Descargar ${input.format.toUpperCase()}](${doc.downloadUrl}). Borrador para revisión. [${entries[0]!.citation}]`);
        return entries;
      },
    },
    caseWorkspace: {
      description: "Leer o modificar carpeta e historia de una causa: hechos reportados, eventos, personas, bienes, checklist, borradores. Primero DESCRIBE para consultar el esquema de la operación. Los campos faltantes se piden al usuario.",
      schema: z.object({ caseId: caseSchema, operation: z.enum(["READ", "DESCRIBE", "FOLDER", "DRAFT", "IMPORT"]), data: dataSchema.optional() }).strict(),
      execute: async (input: { caseId: string; operation: "READ" | "DESCRIBE" | "FOLDER" | "DRAFT" | "IMPORT"; data?: Record<string, unknown> }) => {
        caseScope(input.caseId);
        if (input.operation === "DESCRIBE") return { folder: z.toJSONSchema(folderAction, { io: "input" }), drafts: z.toJSONSchema(draftSchema, { io: "input" }), imports: z.toJSONSchema(importSchema, { io: "input" }) };
        if (input.operation === "READ") return record([{ title: "Carpeta de causa", case_id: input.caseId, ...(await loadFolder(c, input.caseId)) }], "causas", "");
        if (input.operation === "FOLDER") await folderMutation(c, input.caseId, folderAction.parse(input.data));
        if (input.operation === "DRAFT") await draftMutation(c, input.caseId, draftSchema.parse(input.data));
        if (input.operation === "IMPORT") await manualImport(c, input.caseId, importSchema.parse(input.data));
        await audit(c, "AGENT_WORKSPACE_UPDATED", "case", input.caseId, { operation: input.operation });
        const entries = record([{ title: "Carpeta actualizada", case_id: input.caseId, operation: input.operation }], "causas", "") as { citation: string }[];
        finish(`Actualicé la carpeta de la causa. [${entries[0]!.citation}]`);
        return entries;
      },
    },
  };
}
