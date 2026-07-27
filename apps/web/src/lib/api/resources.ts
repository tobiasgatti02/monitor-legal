import type { ZodType } from "zod";

import { apiContext, audit, requireWrite, type ApiContext } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { jsonBody, paginated, response, type RouteParams } from "@/lib/api/http";
import { paginationFrom } from "@/lib/api/pagination";
import {
  calendarCreateSchema,
  calendarUpdateSchema,
  caseCreateSchema,
  caseUpdateSchema,
  clientCreateSchema,
  clientUpdateSchema,
  communicationCreateSchema,
  communicationUpdateSchema,
  deadlineCreateSchema,
  deadlineUpdateSchema,
  feeCreateSchema,
  feeUpdateSchema,
  integrationCreateSchema,
  integrationUpdateSchema,
  leadCreateSchema,
  leadUpdateSchema,
  paymentCreateSchema,
  paymentUpdateSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from "@/lib/api/schemas";
import { db } from "@/lib/db";

type ObjectParser = ZodType<Record<string, unknown>>;

type Reference = {
  table: string;
  column?: string;
  softDelete?: boolean;
};

export type ResourceConfig = {
  name: string;
  table: string;
  select: string;
  fields: Record<string, string>;
  createSchema: ObjectParser;
  updateSchema: ObjectParser;
  searchColumns?: string[];
  filters?: Record<string, string>;
  references?: Record<string, Reference>;
  softDelete?: boolean;
  orderBy: string;
};

const clientSelect = `
  id, kind, full_name as "fullName", document_id as "documentId", email, phone,
  whatsapp, address, locality, preferred_channel as "preferredChannel", status, source,
  responsible_user_id as "responsibleUserId",
  communication_consent as "communicationConsent",
  update_frequency_days as "updateFrequencyDays",
  last_contact_at as "lastContactAt", next_contact_at as "nextContactAt", notes,
  created_at as "createdAt", updated_at as "updatedAt"`;

const caseSelect = `
  id, client_id as "clientId", docket_number as "docketNumber", title, jurisdiction,
  court, venue, status, priority, responsible_user_id as "responsibleUserId",
  next_action as "nextAction", next_action_at as "nextActionAt",
  last_movement_at as "lastMovementAt", created_at as "createdAt",
  updated_at as "updatedAt"`;

const leadSelect = `
  id, full_name as "fullName", email, whatsapp,
  consultation_reason as "consultationReason", source, urgency, status,
  responsible_user_id as "responsibleUserId", next_action as "nextAction",
  next_action_at as "nextActionAt", counterparty, lost_reason as "lostReason",
  converted_client_id as "convertedClientId", created_at as "createdAt",
  updated_at as "updatedAt"`;

const taskSelect = `
  id, case_id as "caseId", client_id as "clientId", lead_id as "leadId",
  source_event_id as "sourceEventId", parent_task_id as "parentTaskId", title,
  description, status, priority, due_at as "dueAt",
  responsible_user_id as "responsibleUserId", recurrence_rule as "recurrenceRule",
  completed_at as "completedAt", created_at as "createdAt", updated_at as "updatedAt"`;

const deadlineSelect = `
  id, case_id as "caseId", source_event_id as "sourceEventId", title,
  due_at as "dueAt", status, confirmed_by as "confirmedBy",
  confirmed_at as "confirmedAt", previous_due_at as "previousDueAt", notes,
  created_at as "createdAt", updated_at as "updatedAt"`;

const calendarSelect = `
  id, case_id as "caseId", client_id as "clientId", deadline_id as "deadlineId",
  event_type as "eventType", title, starts_at as "startsAt", ends_at as "endsAt",
  all_day as "allDay", responsible_user_id as "responsibleUserId", location,
  external_calendar_id as "externalCalendarId", created_at as "createdAt",
  updated_at as "updatedAt"`;

const communicationSelect = `
  id, client_id as "clientId", case_id as "caseId", lead_id as "leadId",
  source_event_id as "sourceEventId", channel, direction, status, subject, body,
  sent_at as "sentAt", approved_by as "approvedBy", approved_at as "approvedAt",
  external_id as "externalId", created_at as "createdAt", updated_at as "updatedAt"`;

const feeSelect = `
  id, case_id as "caseId", agreement_type as "agreementType", currency,
  agreed_amount::text as "agreedAmount", notes, created_at as "createdAt",
  updated_at as "updatedAt"`;

const paymentSelect = `
  id, fee_id as "feeId", amount::text, currency, paid_at as "paidAt", method,
  concept, receipt_document_id as "receiptDocumentId", created_at as "createdAt",
  updated_at as "updatedAt"`;

const integrationSelect = `
  id, source, account_label as "accountLabel", status, schedule,
  last_attempt_at as "lastAttemptAt", last_success_at as "lastSuccessAt",
  next_run_at as "nextRunAt", last_error_code as "lastErrorCode",
  last_error_message as "lastErrorMessage", created_at as "createdAt",
  updated_at as "updatedAt"`;

const memberReference: Reference = { table: "tenant_members", column: "user_id" };

export const resources = {
  clients: {
    name: "client",
    table: "clients",
    select: clientSelect,
    fields: {
      kind: "kind",
      fullName: "full_name",
      documentId: "document_id",
      email: "email",
      phone: "phone",
      whatsapp: "whatsapp",
      address: "address",
      locality: "locality",
      preferredChannel: "preferred_channel",
      status: "status",
      source: "source",
      responsibleUserId: "responsible_user_id",
      communicationConsent: "communication_consent",
      updateFrequencyDays: "update_frequency_days",
      nextContactAt: "next_contact_at",
      notes: "notes",
    },
    createSchema: clientCreateSchema,
    updateSchema: clientUpdateSchema,
    searchColumns: ["full_name", "document_id", "email", "whatsapp"],
    filters: { status: "status", responsibleUserId: "responsible_user_id" },
    references: { responsibleUserId: memberReference },
    softDelete: true,
    orderBy: "updated_at desc",
  },
  cases: {
    name: "case",
    table: "cases",
    select: caseSelect,
    fields: {
      clientId: "client_id",
      docketNumber: "docket_number",
      title: "title",
      jurisdiction: "jurisdiction",
      court: "court",
      venue: "venue",
      status: "status",
      priority: "priority",
      responsibleUserId: "responsible_user_id",
      nextAction: "next_action",
      nextActionAt: "next_action_at",
    },
    createSchema: caseCreateSchema,
    updateSchema: caseUpdateSchema,
    searchColumns: ["title", "docket_number", "court"],
    filters: {
      status: "status",
      priority: "priority",
      clientId: "client_id",
      responsibleUserId: "responsible_user_id",
    },
    references: {
      clientId: { table: "clients", softDelete: true },
      responsibleUserId: memberReference,
    },
    softDelete: true,
    orderBy: "coalesce(last_movement_at, created_at) desc",
  },
  leads: {
    name: "lead",
    table: "leads",
    select: leadSelect,
    fields: {
      fullName: "full_name",
      email: "email",
      whatsapp: "whatsapp",
      consultationReason: "consultation_reason",
      source: "source",
      urgency: "urgency",
      status: "status",
      responsibleUserId: "responsible_user_id",
      nextAction: "next_action",
      nextActionAt: "next_action_at",
      counterparty: "counterparty",
      lostReason: "lost_reason",
    },
    createSchema: leadCreateSchema,
    updateSchema: leadUpdateSchema,
    searchColumns: ["full_name", "email", "whatsapp", "counterparty"],
    filters: {
      status: "status",
      urgency: "urgency",
      responsibleUserId: "responsible_user_id",
    },
    references: { responsibleUserId: memberReference },
    softDelete: true,
    orderBy: "created_at desc",
  },
  tasks: {
    name: "task",
    table: "tasks",
    select: taskSelect,
    fields: {
      caseId: "case_id",
      clientId: "client_id",
      leadId: "lead_id",
      sourceEventId: "source_event_id",
      parentTaskId: "parent_task_id",
      title: "title",
      description: "description",
      status: "status",
      priority: "priority",
      dueAt: "due_at",
      responsibleUserId: "responsible_user_id",
      recurrenceRule: "recurrence_rule",
    },
    createSchema: taskCreateSchema,
    updateSchema: taskUpdateSchema,
    searchColumns: ["title", "description"],
    filters: {
      status: "status",
      priority: "priority",
      caseId: "case_id",
      clientId: "client_id",
      leadId: "lead_id",
      responsibleUserId: "responsible_user_id",
    },
    references: {
      caseId: { table: "cases", softDelete: true },
      clientId: { table: "clients", softDelete: true },
      leadId: { table: "leads", softDelete: true },
      sourceEventId: { table: "judicial_events" },
      parentTaskId: { table: "tasks" },
      responsibleUserId: memberReference,
    },
    orderBy: "due_at asc nulls last, created_at desc",
  },
  deadlines: {
    name: "deadline",
    table: "deadlines",
    select: deadlineSelect,
    fields: {
      caseId: "case_id",
      sourceEventId: "source_event_id",
      title: "title",
      dueAt: "due_at",
      status: "status",
      notes: "notes",
    },
    createSchema: deadlineCreateSchema,
    updateSchema: deadlineUpdateSchema,
    searchColumns: ["title", "notes"],
    filters: { status: "status", caseId: "case_id" },
    references: {
      caseId: { table: "cases", softDelete: true },
      sourceEventId: { table: "judicial_events" },
    },
    orderBy: "due_at asc",
  },
  calendar: {
    name: "calendar-event",
    table: "calendar_events",
    select: calendarSelect,
    fields: {
      caseId: "case_id",
      clientId: "client_id",
      deadlineId: "deadline_id",
      eventType: "event_type",
      title: "title",
      startsAt: "starts_at",
      endsAt: "ends_at",
      allDay: "all_day",
      responsibleUserId: "responsible_user_id",
      location: "location",
    },
    createSchema: calendarCreateSchema,
    updateSchema: calendarUpdateSchema,
    searchColumns: ["title", "location"],
    filters: {
      eventType: "event_type",
      caseId: "case_id",
      clientId: "client_id",
      responsibleUserId: "responsible_user_id",
    },
    references: {
      caseId: { table: "cases", softDelete: true },
      clientId: { table: "clients", softDelete: true },
      deadlineId: { table: "deadlines" },
      responsibleUserId: memberReference,
    },
    orderBy: "starts_at asc",
  },
  communications: {
    name: "communication",
    table: "communications",
    select: communicationSelect,
    fields: {
      clientId: "client_id",
      caseId: "case_id",
      leadId: "lead_id",
      sourceEventId: "source_event_id",
      channel: "channel",
      direction: "direction",
      status: "status",
      subject: "subject",
      body: "body",
      sentAt: "sent_at",
    },
    createSchema: communicationCreateSchema,
    updateSchema: communicationUpdateSchema,
    searchColumns: ["subject", "body"],
    filters: {
      clientId: "client_id",
      caseId: "case_id",
      leadId: "lead_id",
      channel: "channel",
      status: "status",
    },
    references: {
      clientId: { table: "clients", softDelete: true },
      caseId: { table: "cases", softDelete: true },
      leadId: { table: "leads", softDelete: true },
      sourceEventId: { table: "judicial_events" },
    },
    orderBy: "created_at desc",
  },
  fees: {
    name: "fee",
    table: "fees",
    select: feeSelect,
    fields: {
      caseId: "case_id",
      agreementType: "agreement_type",
      currency: "currency",
      agreedAmount: "agreed_amount",
      notes: "notes",
    },
    createSchema: feeCreateSchema,
    updateSchema: feeUpdateSchema,
    searchColumns: ["agreement_type", "notes"],
    filters: { caseId: "case_id", currency: "currency" },
    references: { caseId: { table: "cases", softDelete: true } },
    orderBy: "created_at desc",
  },
  payments: {
    name: "payment",
    table: "payments",
    select: paymentSelect,
    fields: {
      feeId: "fee_id",
      amount: "amount",
      currency: "currency",
      paidAt: "paid_at",
      method: "method",
      concept: "concept",
      receiptDocumentId: "receipt_document_id",
    },
    createSchema: paymentCreateSchema,
    updateSchema: paymentUpdateSchema,
    searchColumns: ["concept", "method"],
    filters: { feeId: "fee_id", currency: "currency" },
    references: {
      feeId: { table: "fees" },
      receiptDocumentId: { table: "documents", softDelete: true },
    },
    orderBy: "paid_at desc",
  },
  integrations: {
    name: "connector",
    table: "connectors",
    select: integrationSelect,
    fields: {
      source: "source",
      accountLabel: "account_label",
      schedule: "schedule",
    },
    createSchema: integrationCreateSchema,
    updateSchema: integrationUpdateSchema,
    searchColumns: ["account_label"],
    filters: { source: "source", status: "status" },
    orderBy: "source, account_label",
  },
} as const satisfies Record<string, ResourceConfig>;

export type ResourceName = keyof typeof resources;

function mappedValues(
  config: ResourceConfig,
  input: Record<string, unknown>,
): { columns: string[]; values: unknown[] } {
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    const column = config.fields[key];
    if (!column || value === undefined) continue;
    columns.push(column);
    values.push(value);
  }
  return { columns, values };
}

async function ensureReferences(
  context: ApiContext,
  config: ResourceConfig,
  input: Record<string, unknown>,
): Promise<void> {
  for (const [field, reference] of Object.entries(config.references ?? {})) {
    const value = input[field];
    if (value === undefined || value === null || value === "") continue;
    const column = reference.column ?? "id";
    const deleted = reference.softDelete ? " and deleted_at is null" : "";
    const rows = await db().query(
      `select 1 from public.${reference.table}
        where tenant_id = $1 and ${column} = $2${deleted}
        limit 1`,
      [context.tenantId, value],
    );
    if (rows.length === 0) {
      throw new ApiError(
        422,
        "INVALID_REFERENCE",
        `La referencia ${field} no pertenece al estudio activo.`,
      );
    }
  }
}

async function readOne(
  context: ApiContext,
  config: ResourceConfig,
  id: string,
): Promise<Record<string, unknown>> {
  const deleted = config.softDelete ? " and deleted_at is null" : "";
  const rows = (await db().query(
    `select ${config.select} from public.${config.table}
      where tenant_id = $1 and id = $2${deleted}
      limit 1`,
    [context.tenantId, id],
  )) as Record<string, unknown>[];
  const item = rows[0];
  if (!item) {
    throw new ApiError(404, "NOT_FOUND", "El recurso solicitado no existe.");
  }
  return item;
}

export async function listResource(
  request: Request,
  resource: ResourceName,
  forcedFilters: Record<string, string> = {},
): Promise<Response> {
  const context = await apiContext(request);
  const config: ResourceConfig = resources[resource];
  const url = new URL(request.url);
  const pagination = paginationFrom(request);
  const conditions = ["tenant_id = $1"];
  const parameters: unknown[] = [context.tenantId];

  if (config.softDelete) conditions.push("deleted_at is null");

  const search = url.searchParams.get("search")?.trim();
  if (search && config.searchColumns?.length) {
    parameters.push(`%${search}%`);
    const placeholder = `$${parameters.length}`;
    conditions.push(
      `(${config.searchColumns.map((column) => `${column} ilike ${placeholder}`).join(" or ")})`,
    );
  }

  for (const [queryName, column] of Object.entries(config.filters ?? {})) {
    const value = forcedFilters[queryName] ?? url.searchParams.get(queryName);
    if (!value) continue;
    parameters.push(value);
    conditions.push(`${column} = $${parameters.length}`);
  }

  for (const [queryName, value] of Object.entries(forcedFilters)) {
    if (!value || config.filters?.[queryName]) continue;
    const column = config.fields[queryName];
    if (!column) continue;
    parameters.push(value);
    conditions.push(`${column} = $${parameters.length}`);
  }

  const where = conditions.join(" and ");
  const countRows = (await db().query(
    `select count(*)::text as total from public.${config.table} where ${where}`,
    parameters,
  )) as { total: string }[];
  const total = Number.parseInt(countRows[0]?.total ?? "0", 10);

  const dataParameters = [...parameters, pagination.limit, pagination.offset];
  const rows = (await db().query(
    `select ${config.select} from public.${config.table}
      where ${where}
      order by ${config.orderBy}
      limit $${dataParameters.length - 1} offset $${dataParameters.length}`,
    dataParameters,
  )) as Record<string, unknown>[];

  return paginated(rows, { page: pagination.page, limit: pagination.limit, total });
}

export async function getResource(
  request: Request,
  route: RouteParams | undefined,
  resource: ResourceName,
): Promise<Response> {
  const context = await apiContext(request);
  const config: ResourceConfig = resources[resource];
  const id = (await route?.params)?.id;
  if (!id) throw new ApiError(400, "ID_REQUIRED", "Falta el identificador.");
  return response(await readOne(context, config, id));
}

export async function createResource(
  request: Request,
  resource: ResourceName,
  forced: Record<string, unknown> = {},
): Promise<Response> {
  const context = await apiContext(request);
  requireWrite(context);
  const config: ResourceConfig = resources[resource];
  const input = {
    ...(await jsonBody(request, config.createSchema)),
    ...forced,
  };
  await ensureReferences(context, config, input);
  const mapped = mappedValues(config, input);
  const columns = ["tenant_id", ...mapped.columns, "created_by"];
  const values = [context.tenantId, ...mapped.values, context.actorId];
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const rows = (await db().query(
    `insert into public.${config.table} (${columns.join(", ")})
     values (${placeholders.join(", ")})
     returning id`,
    values,
  )) as { id: string }[];
  const id = rows[0]?.id;
  if (!id) throw new ApiError(500, "CREATE_FAILED", "No se pudo crear el recurso.");
  await audit(context, `${config.name.toUpperCase()}_CREATED`, config.name, id);
  return response(await readOne(context, config, id), { status: 201 });
}

export async function updateResource(
  request: Request,
  route: RouteParams | undefined,
  resource: ResourceName,
): Promise<Response> {
  const context = await apiContext(request);
  requireWrite(context);
  const config: ResourceConfig = resources[resource];
  const id = (await route?.params)?.id;
  if (!id) throw new ApiError(400, "ID_REQUIRED", "Falta el identificador.");
  const previous = await readOne(context, config, id);
  const input = await jsonBody(request, config.updateSchema);
  if (resource === "communications" && previous.status !== "DRAFT") {
    throw new ApiError(
      409,
      "COMMUNICATION_LOCKED",
      "Sólo pueden editarse comunicaciones en borrador.",
    );
  }
  if (
    resource === "leads" &&
    typeof input.status === "string" &&
    ["NOT_HIRED", "NO_RESPONSE", "CONFLICT", "OUT_OF_SCOPE"].includes(input.status) &&
    !input.lostReason &&
    !previous.lostReason
  ) {
    throw new ApiError(422, "LOST_REASON_REQUIRED", "Indicá el motivo de cierre del lead.");
  }
  await ensureReferences(context, config, input);
  const mapped = mappedValues(config, input);
  if (mapped.columns.length === 0) {
    throw new ApiError(422, "EMPTY_UPDATE", "No hay campos para actualizar.");
  }
  const values = [...mapped.values, context.tenantId, id];
  const set = mapped.columns.map((column, index) => `${column} = $${index + 1}`);
  await db().query(
    `update public.${config.table}
        set ${set.join(", ")}
      where tenant_id = $${values.length - 1} and id = $${values.length}`,
    values,
  );
  if (resource === "tasks" && typeof input.status === "string") {
    await db().query(
      `update public.tasks
          set completed_at = case when status = 'DONE' then coalesce(completed_at, now())
                                  else null end
        where tenant_id = $1 and id = $2`,
      [context.tenantId, id],
    );
  }
  if (resource === "deadlines") {
    const dueAtChanged = typeof input.dueAt === "string" && input.dueAt !== previous.dueAt;
    await db().query(
      `update public.deadlines
          set previous_due_at = case when $3 then $4::timestamptz else previous_due_at end,
              confirmed_by = case when status = 'CONFIRMED' then $5 else confirmed_by end,
              confirmed_at = case when status = 'CONFIRMED'
                                  then coalesce(confirmed_at, now()) else confirmed_at end
        where tenant_id = $1 and id = $2`,
      [context.tenantId, id, dueAtChanged, previous.dueAt ?? null, context.actorId],
    );
  }
  await audit(context, `${config.name.toUpperCase()}_UPDATED`, config.name, id, {
    fields: Object.keys(input),
  });
  return response(await readOne(context, config, id));
}

export async function deleteResource(
  request: Request,
  route: RouteParams | undefined,
  resource: ResourceName,
): Promise<Response> {
  const context = await apiContext(request);
  requireWrite(context);
  const config: ResourceConfig = resources[resource];
  const id = (await route?.params)?.id;
  if (!id) throw new ApiError(400, "ID_REQUIRED", "Falta el identificador.");
  await readOne(context, config, id);
  if (config.softDelete) {
    await db().query(
      `update public.${config.table} set deleted_at = now()
        where tenant_id = $1 and id = $2`,
      [context.tenantId, id],
    );
  } else {
    await db().query(
      `delete from public.${config.table} where tenant_id = $1 and id = $2`,
      [context.tenantId, id],
    );
  }
  await audit(context, `${config.name.toUpperCase()}_DELETED`, config.name, id);
  return new Response(null, { status: 204 });
}
