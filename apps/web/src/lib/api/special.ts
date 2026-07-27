import { createHash, randomUUID } from "node:crypto";

import nodemailer from "nodemailer";

import {
  apiContext,
  audit,
  requireRoles,
  requireWrite,
  type ApiContext,
} from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { jsonBody, paginated, response, type RouteParams } from "@/lib/api/http";
import { paginationFrom } from "@/lib/api/pagination";
import {
  activityCreateSchema,
  alertUpdateSchema,
  clientPortalAccessSchema,
  communicationActionSchema,
  contactSchema,
  documentCreateSchema,
  eventReviewSchema,
  idSchema,
  leadConvertSchema,
  settingsUpdateSchema,
  teamMemberSchema,
} from "@/lib/api/schemas";
import { db } from "@/lib/db";

type CountRow = { total: string };

async function routeId(route: RouteParams | undefined): Promise<string> {
  const id = (await route?.params)?.id;
  if (!id) throw new ApiError(400, "ID_REQUIRED", "Falta el identificador.");
  return idSchema.parse(id);
}

async function assertTenantEntity(
  context: ApiContext,
  table: string,
  id: string,
  softDelete = false,
): Promise<void> {
  const deleted = softDelete ? " and deleted_at is null" : "";
  const rows = await db().query(
    `select 1 from public.${table}
      where tenant_id = $1 and id = $2${deleted}
      limit 1`,
    [context.tenantId, id],
  );
  if (rows.length === 0) throw new ApiError(404, "NOT_FOUND", "El recurso no existe.");
}

export async function caseEvents(
  request: Request,
  route: RouteParams | undefined,
): Promise<Response> {
  const context = await apiContext(request);
  const caseId = await routeId(route);
  await assertTenantEntity(context, "cases", caseId, true);
  const pagination = paginationFrom(request);
  const url = new URL(request.url);
  const conditions = ["tenant_id = $1", "case_id = $2"];
  const parameters: unknown[] = [context.tenantId, caseId];
  for (const [name, column] of [
    ["status", "review_status"],
    ["severity", "severity"],
    ["source", "source"],
  ] as const) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    parameters.push(value);
    conditions.push(`${column} = $${parameters.length}`);
  }
  const where = conditions.join(" and ");
  const count = (await db().query(
    `select count(*)::text as total from public.judicial_events where ${where}`,
    parameters,
  )) as CountRow[];
  const listParameters = [...parameters, pagination.limit, pagination.offset];
  const rows = (await db().query(
    `select id, connector_id as "connectorId", sync_run_id as "syncRunId", source,
            source_event_id as "sourceEventId", source_url as "sourceUrl",
            event_type as "eventType", source_date as "sourceDate",
            detected_at as "detectedAt", title, original_text as "originalText",
            content_hash as "contentHash", severity, review_status as "reviewStatus",
            requires_lawyer_review as "requiresLawyerReview",
            possible_deadline as "possibleDeadline", metadata
       from public.judicial_events
      where ${where}
      order by detected_at desc
      limit $${listParameters.length - 1} offset $${listParameters.length}`,
    listParameters,
  )) as Record<string, unknown>[];
  return paginated(rows, {
    page: pagination.page,
    limit: pagination.limit,
    total: Number.parseInt(count[0]?.total ?? "0", 10),
  });
}

export async function listEvents(request: Request): Promise<Response> {
  const context = await apiContext(request);
  const pagination = paginationFrom(request);
  const url = new URL(request.url);
  const conditions = ["e.tenant_id = $1"];
  const parameters: unknown[] = [context.tenantId];
  for (const [name, column] of [
    ["status", "e.review_status"],
    ["severity", "e.severity"],
    ["source", "e.source"],
    ["caseId", "e.case_id"],
  ] as const) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    parameters.push(value);
    conditions.push(`${column} = $${parameters.length}`);
  }
  const where = conditions.join(" and ");
  const count = (await db().query(
    `select count(*)::text as total from public.judicial_events e where ${where}`,
    parameters,
  )) as CountRow[];
  const values = [...parameters, pagination.limit, pagination.offset];
  const rows = (await db().query(
    `select e.id, e.case_id as "caseId", e.source, e.source_url as "sourceUrl",
            e.event_type as "eventType", e.source_date as "sourceDate",
            e.detected_at as "detectedAt", e.title, e.original_text as "originalText",
            e.severity, e.review_status as "reviewStatus",
            e.requires_lawyer_review as "requiresLawyerReview",
            e.possible_deadline as "possibleDeadline",
            coalesce(c.title, c.docket_number) as "caseTitle"
       from public.judicial_events e
       left join public.cases c on c.id = e.case_id and c.tenant_id = e.tenant_id
      where ${where}
      order by e.detected_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  )) as Record<string, unknown>[];
  return paginated(rows, {
    page: pagination.page,
    limit: pagination.limit,
    total: Number.parseInt(count[0]?.total ?? "0", 10),
  });
}

export async function reviewEvent(
  request: Request,
  route: RouteParams | undefined,
): Promise<Response> {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN", "LAWYER"]);
  const eventId = await routeId(route);
  const input = await jsonBody(request, eventReviewSchema);
  const events = (await db().query(
    `select id, severity, possible_deadline from public.judicial_events
      where tenant_id = $1 and id = $2 limit 1`,
    [context.tenantId, eventId],
  )) as { id: string; severity: string; possible_deadline: boolean }[];
  const event = events[0];
  if (!event) throw new ApiError(404, "NOT_FOUND", "La novedad no existe.");
  const severity = input.severity ?? event.severity;
  const possibleDeadline = input.possibleDeadline ?? event.possible_deadline;
  const rows = await db().query(
    `with review as (
       insert into public.event_reviews (
         tenant_id, event_id, status, previous_severity, severity,
         possible_deadline, note, reviewed_by, created_by
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       returning id
     )
     update public.judicial_events
        set review_status = $3, severity = $5, possible_deadline = $6
      where tenant_id = $1 and id = $2
      returning id, review_status as "reviewStatus", severity,
                possible_deadline as "possibleDeadline"`,
    [
      context.tenantId,
      eventId,
      input.status,
      event.severity,
      severity,
      possibleDeadline,
      input.note ?? null,
      context.actorId,
    ],
  );
  await audit(context, "JUDICIAL_EVENT_REVIEWED", "judicial-event", eventId, {
    status: input.status,
    severity,
    possibleDeadline,
  });
  return response(rows[0]);
}

export async function clientContact(
  request: Request,
  route: RouteParams | undefined,
): Promise<Response> {
  const context = await apiContext(request);
  requireWrite(context);
  const clientId = await routeId(route);
  await assertTenantEntity(context, "clients", clientId, true);
  const input = await jsonBody(request, contactSchema);
  if (
    input.direction === "OUTBOUND" &&
    ["EMAIL", "WHATSAPP"].includes(input.channel) &&
    input.status === "SENT"
  ) {
    throw new ApiError(
      422,
      "APPROVAL_REQUIRED",
      "Email y WhatsApp deben registrarse primero como borrador y aprobarse.",
    );
  }
  const rows = await db().query(
    `with created as (
       insert into public.communications (
         tenant_id, client_id, case_id, channel, direction, status,
         subject, body, sent_at, created_by
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id, client_id as "clientId", case_id as "caseId", channel,
                 direction, status, subject, body, sent_at as "sentAt",
                 created_at as "createdAt"
     ), touched as (
       update public.clients
          set last_contact_at = case when $6 in ('SENT', 'REPLIED') then coalesce($9, now())
                                     else last_contact_at end
        where tenant_id = $1 and id = $2
     )
     select * from created`,
    [
      context.tenantId,
      clientId,
      input.caseId ?? null,
      input.channel,
      input.direction,
      input.status,
      input.subject ?? null,
      input.body,
      input.sentAt ?? null,
      context.actorId,
    ],
  );
  const id = String((rows[0] as { id?: string } | undefined)?.id ?? "");
  await audit(context, "CLIENT_CONTACT_RECORDED", "communication", id, {
    clientId,
    channel: input.channel,
    status: input.status,
  });
  return response(rows[0], { status: 201 });
}

export async function leadActivities(
  request: Request,
  route: RouteParams | undefined,
): Promise<Response> {
  const context = await apiContext(request);
  const leadId = await routeId(route);
  await assertTenantEntity(context, "leads", leadId, true);
  const pagination = paginationFrom(request);
  const count = (await db().query(
    `select count(*)::text as total from public.lead_activities
      where tenant_id = $1 and lead_id = $2`,
    [context.tenantId, leadId],
  )) as CountRow[];
  const rows = (await db().query(
    `select id, activity_type as "activityType", note, happened_at as "happenedAt",
            created_by as "createdBy", created_at as "createdAt"
       from public.lead_activities
      where tenant_id = $1 and lead_id = $2
      order by happened_at desc
      limit $3 offset $4`,
    [context.tenantId, leadId, pagination.limit, pagination.offset],
  )) as Record<string, unknown>[];
  return paginated(rows, {
    page: pagination.page,
    limit: pagination.limit,
    total: Number.parseInt(count[0]?.total ?? "0", 10),
  });
}

export async function createLeadActivity(
  request: Request,
  route: RouteParams | undefined,
): Promise<Response> {
  const context = await apiContext(request);
  requireWrite(context);
  const leadId = await routeId(route);
  await assertTenantEntity(context, "leads", leadId, true);
  const input = await jsonBody(request, activityCreateSchema);
  const rows = await db().query(
    `insert into public.lead_activities (
       tenant_id, lead_id, activity_type, note, happened_at, created_by
     ) values ($1, $2, $3, $4, coalesce($5, now()), $6)
     returning id, activity_type as "activityType", note,
               happened_at as "happenedAt", created_at as "createdAt"`,
    [
      context.tenantId,
      leadId,
      input.activityType,
      input.note ?? null,
      input.happenedAt ?? null,
      context.actorId,
    ],
  );
  const id = String((rows[0] as { id?: string } | undefined)?.id ?? "");
  await audit(context, "LEAD_ACTIVITY_CREATED", "lead-activity", id, { leadId });
  return response(rows[0], { status: 201 });
}

export async function convertLead(
  request: Request,
  route: RouteParams | undefined,
): Promise<Response> {
  const context = await apiContext(request);
  requireWrite(context);
  const leadId = await routeId(route);
  const input = await jsonBody(request, leadConvertSchema);
  const rows = (await db().query(
    `with selected as (
       select * from public.leads
        where tenant_id = $1 and id = $2 and deleted_at is null
          and converted_client_id is null
        for update
     ), new_client as (
       insert into public.clients (
         tenant_id, kind, full_name, email, whatsapp, status, source,
         responsible_user_id, communication_consent, notes, created_by
       )
       select tenant_id, $3, full_name, email, whatsapp, 'ACTIVE', 'LEAD',
              responsible_user_id, false, consultation_reason, $4
         from selected
       returning id
     ), converted as (
       update public.leads
          set status = 'HIRED', converted_client_id = (select id from new_client)
        where tenant_id = $1 and id = $2
       returning id
     ), activity as (
       insert into public.lead_activities (
         tenant_id, lead_id, activity_type, note, created_by
       )
       select $1, id, 'STATUS_CHANGE', 'Convertido en cliente', $4 from converted
     ), new_case as (
       insert into public.cases (
         tenant_id, client_id, title, status, priority,
         responsible_user_id, created_by
       )
       select $1, new_client.id,
              coalesce($6, selected.consultation_reason),
              'ACTIVE', selected.urgency, selected.responsible_user_id, $4
         from new_client cross join selected
        where $5
       returning id
     )
     select new_client.id as "clientId",
            (select id from new_case) as "caseId"
       from new_client`,
    [
      context.tenantId,
      leadId,
      input.clientKind,
      context.actorId,
      input.createCase,
      input.caseTitle ?? null,
    ],
  )) as { clientId: string; caseId: string | null }[];
  const result = rows[0];
  if (!result) {
    throw new ApiError(
      409,
      "LEAD_ALREADY_CONVERTED",
      "El lead no existe o ya fue convertido.",
    );
  }
  await audit(context, "LEAD_CONVERTED", "lead", leadId, result);
  return response(result, { status: 201 });
}

type DocumentRow = {
  id: string;
  name: string;
  mimeType: string | null;
  contentBase64?: string;
};

export async function listDocuments(request: Request): Promise<Response> {
  const context = await apiContext(request);
  const pagination = paginationFrom(request);
  const url = new URL(request.url);
  const conditions = ["tenant_id = $1", "deleted_at is null"];
  const parameters: unknown[] = [context.tenantId];
  for (const [name, column] of [
    ["clientId", "client_id"],
    ["caseId", "case_id"],
    ["taskId", "task_id"],
    ["category", "category"],
  ] as const) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    parameters.push(value);
    conditions.push(`${column} = $${parameters.length}`);
  }
  const search = url.searchParams.get("search")?.trim();
  if (search) {
    parameters.push(`%${search}%`);
    conditions.push(`name ilike $${parameters.length}`);
  }
  const where = conditions.join(" and ");
  const count = (await db().query(
    `select count(*)::text as total from public.documents where ${where}`,
    parameters,
  )) as CountRow[];
  const listParameters = [...parameters, pagination.limit, pagination.offset];
  const rows = (await db().query(
    `select id, client_id as "clientId", case_id as "caseId", task_id as "taskId",
            name, category, mime_type as "mimeType", size_bytes as "sizeBytes",
            content_hash as "contentHash", shared_with_client as "sharedWithClient",
            created_at as "createdAt", updated_at as "updatedAt"
       from public.documents
      where ${where}
      order by created_at desc
      limit $${listParameters.length - 1} offset $${listParameters.length}`,
    listParameters,
  )) as Record<string, unknown>[];
  return paginated(rows, {
    page: pagination.page,
    limit: pagination.limit,
    total: Number.parseInt(count[0]?.total ?? "0", 10),
  });
}

export async function createDocument(request: Request): Promise<Response> {
  const context = await apiContext(request);
  requireWrite(context);
  const input = await jsonBody(request, documentCreateSchema);
  const content = Buffer.from(input.contentBase64, "base64");
  if (content.length === 0 || content.length > 5 * 1024 * 1024) {
    throw new ApiError(413, "DOCUMENT_TOO_LARGE", "El archivo debe pesar entre 1 byte y 5 MB.");
  }
  for (const [table, id] of [
    ["clients", input.clientId],
    ["cases", input.caseId],
    ["tasks", input.taskId],
  ] as const) {
    if (id) await assertTenantEntity(context, table, id, table !== "tasks");
  }
  const id = randomUUID();
  const hash = createHash("sha256").update(content).digest("hex");
  const rows = await db().query(
    `with document as (
       insert into public.documents (
         id, tenant_id, client_id, case_id, task_id, name, category,
         storage_provider, storage_key, mime_type, size_bytes, content_hash,
         shared_with_client, created_by
       ) values (
         $1, $2, $3, $4, $5, $6, $7,
         'NEON', $1::text, $8, $9, $10, $11, $12
       )
       returning id, name, category, mime_type as "mimeType",
                 size_bytes as "sizeBytes", content_hash as "contentHash",
                 shared_with_client as "sharedWithClient", created_at as "createdAt"
     ), blob as (
       insert into public.document_blobs (document_id, tenant_id, content)
       values ($1, $2, decode($13, 'base64'))
     )
     select * from document`,
    [
      id,
      context.tenantId,
      input.clientId ?? null,
      input.caseId ?? null,
      input.taskId ?? null,
      input.name,
      input.category,
      input.mimeType ?? "application/octet-stream",
      content.length,
      hash,
      input.sharedWithClient,
      context.actorId,
      input.contentBase64,
    ],
  );
  await audit(context, "DOCUMENT_UPLOADED", "document", id, {
    category: input.category,
    sizeBytes: content.length,
    contentHash: hash,
  });
  return response(rows[0], { status: 201 });
}

export async function getDocument(
  request: Request,
  route: RouteParams | undefined,
): Promise<Response> {
  const context = await apiContext(request);
  const id = await routeId(route);
  const rows = await db().query(
    `select id, client_id as "clientId", case_id as "caseId", task_id as "taskId",
            name, category, mime_type as "mimeType", size_bytes as "sizeBytes",
            content_hash as "contentHash", shared_with_client as "sharedWithClient",
            created_at as "createdAt", updated_at as "updatedAt"
       from public.documents
      where tenant_id = $1 and id = $2 and deleted_at is null limit 1`,
    [context.tenantId, id],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "El documento no existe.");
  await audit(context, "DOCUMENT_VIEWED", "document", id);
  return response(rows[0]);
}

export async function deleteDocument(
  request: Request,
  route: RouteParams | undefined,
): Promise<Response> {
  const context = await apiContext(request);
  requireWrite(context);
  const id = await routeId(route);
  await assertTenantEntity(context, "documents", id, true);
  await db().query(
    `update public.documents set deleted_at = now()
      where tenant_id = $1 and id = $2`,
    [context.tenantId, id],
  );
  await audit(context, "DOCUMENT_DELETED", "document", id);
  return new Response(null, { status: 204 });
}

export async function downloadDocument(
  request: Request,
  route: RouteParams | undefined,
): Promise<Response> {
  const context = await apiContext(request);
  const id = await routeId(route);
  const rows = (await db().query(
    `select d.id, d.name, d.mime_type as "mimeType",
            encode(b.content, 'base64') as "contentBase64"
       from public.documents d
       join public.document_blobs b on b.document_id = d.id and b.tenant_id = d.tenant_id
      where d.tenant_id = $1 and d.id = $2 and d.deleted_at is null
      limit 1`,
    [context.tenantId, id],
  )) as DocumentRow[];
  const document = rows[0];
  if (!document?.contentBase64) {
    throw new ApiError(404, "NOT_FOUND", "El contenido del documento no existe.");
  }
  await audit(context, "DOCUMENT_DOWNLOADED", "document", id);
  const encodedName = encodeURIComponent(document.name);
  return new Response(Buffer.from(document.contentBase64, "base64"), {
    headers: {
      "Content-Type": document.mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function communicationAction(
  request: Request,
  route: RouteParams | undefined,
): Promise<Response> {
  const context = await apiContext(request);
  requireWrite(context);
  const communicationId = await routeId(route);
  const input = await jsonBody(request, communicationActionSchema);
  const rows = (await db().query(
    `select c.*, cl.email, cl.whatsapp, cl.full_name
       from public.communications c
       left join public.clients cl
         on cl.id = c.client_id and cl.tenant_id = c.tenant_id
      where c.tenant_id = $1 and c.id = $2 limit 1`,
    [context.tenantId, communicationId],
  )) as Record<string, unknown>[];
  const communication = rows[0];
  if (!communication) throw new ApiError(404, "NOT_FOUND", "La comunicación no existe.");

  if (input.action === "SUBMIT") {
    if (communication.status !== "DRAFT") {
      throw new ApiError(409, "INVALID_STATUS", "Sólo un borrador puede enviarse a aprobar.");
    }
    await db().query(
      `update public.communications set status = 'PENDING_APPROVAL'
        where tenant_id = $1 and id = $2`,
      [context.tenantId, communicationId],
    );
  } else if (input.action === "APPROVE" || input.action === "REJECT") {
    requireRoles(context, ["OWNER", "ADMIN", "LAWYER"]);
    if (communication.status !== "PENDING_APPROVAL") {
      throw new ApiError(409, "INVALID_STATUS", "La comunicación no espera aprobación.");
    }
    const approved = input.action === "APPROVE";
    await db().query(
      `with decision as (
         insert into public.communication_approvals (
           tenant_id, communication_id, decision, note, decided_by, created_by
         ) values ($1, $2, $3, $4, $5, $5)
       )
       update public.communications
          set status = $6, approved_by = case when $6 = 'APPROVED' then $5 else null end,
              approved_at = case when $6 = 'APPROVED' then now() else null end
        where tenant_id = $1 and id = $2`,
      [
        context.tenantId,
        communicationId,
        approved ? "APPROVED" : "REJECTED",
        input.note ?? null,
        context.actorId,
        approved ? "APPROVED" : "DRAFT",
      ],
    );
  } else {
    if (communication.status !== "APPROVED") {
      throw new ApiError(409, "APPROVAL_REQUIRED", "La comunicación debe estar aprobada.");
    }
    const channel = String(communication.channel);
    if (channel === "EMAIL") {
      const smtpUser = process.env.EMAIL_USER;
      const smtpPass = process.env.EMAIL_PASS;
      const recipient = typeof communication.email === "string" ? communication.email : null;
      if (!smtpUser || !smtpPass || !recipient) {
        throw new ApiError(
          503,
          "EMAIL_NOT_CONFIGURED",
          "Falta configurar SMTP o el email del cliente.",
        );
      }
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: smtpUser, pass: smtpPass },
      });
      const sent = await transporter.sendMail({
        from: `Monitor Legal <${smtpUser}>`,
        to: recipient,
        subject: String(communication.subject ?? "Actualización de su expediente"),
        text: String(communication.body),
      });
      await db().query(
        `update public.communications
            set status = 'SENT', sent_at = now(), external_id = $3
          where tenant_id = $1 and id = $2`,
        [context.tenantId, communicationId, sent.messageId],
      );
    } else {
      if (
        communication.channel === "WHATSAPP" &&
        !String(communication.whatsapp ?? "").replace(/\D/g, "")
      ) {
        throw new ApiError(422, "WHATSAPP_MISSING", "El cliente no tiene WhatsApp.");
      }
      await db().query(
        `update public.communications set status = 'SENT', sent_at = now()
          where tenant_id = $1 and id = $2`,
        [context.tenantId, communicationId],
      );
    }
  }

  await audit(context, `COMMUNICATION_${input.action}`, "communication", communicationId);
  const updated = await db().query(
    `select id, channel, direction, status, subject, body, sent_at as "sentAt",
            approved_by as "approvedBy", approved_at as "approvedAt"
       from public.communications where tenant_id = $1 and id = $2`,
    [context.tenantId, communicationId],
  );
  const item = updated[0] as Record<string, unknown> | undefined;
  if (input.action === "SEND" && communication.channel === "WHATSAPP") {
    const phone = String(communication.whatsapp ?? "").replace(/\D/g, "");
    return response({
      ...item,
      launchUrl: `https://wa.me/${phone}?text=${encodeURIComponent(String(communication.body))}`,
    });
  }
  return response(item);
}

export async function enqueueIntegration(
  request: Request,
  route: RouteParams | undefined,
  operation: "TEST" | "SYNC",
): Promise<Response> {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  const connectorId = await routeId(route);
  const connectors = (await db().query(
    `select id, source, account_label from public.connectors
      where tenant_id = $1 and id = $2 limit 1`,
    [context.tenantId, connectorId],
  )) as { id: string; source: string; account_label: string }[];
  const connector = connectors[0];
  if (!connector) throw new ApiError(404, "NOT_FOUND", "La integración no existe.");
  const jobType = operation === "TEST" ? "CONNECTOR_TEST" : "CONNECTOR_SYNC";
  const idempotencyKey = `${jobType}:${connectorId}:${randomUUID()}`;
  const jobs = await db().query(
    `insert into public.jobs (
       tenant_id, connector_id, job_type, status, idempotency_key,
       payload, created_by
     ) values ($1, $2, $3, 'QUEUED', $4, $5::jsonb, $6)
     returning id, job_type as "jobType", status, scheduled_at as "scheduledAt"`,
    [
      context.tenantId,
      connectorId,
      jobType,
      idempotencyKey,
      JSON.stringify({ source: connector.source, accountLabel: connector.account_label }),
      context.actorId,
    ],
  );

  let dispatched = false;
  if (
    connector.source === "PJN" &&
    process.env.GITHUB_DISPATCH_TOKEN &&
    process.env.GITHUB_REPOSITORY
  ) {
    const account = connector.account_label.toLowerCase().includes("mazzarini")
      ? "mazzarini"
      : "gatti";
    const dispatch = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/monitor.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main", inputs: { account, operation } }),
      },
    );
    dispatched = dispatch.ok;
    if (!dispatch.ok) {
      await db().query(
        `update public.jobs set status = 'FAILED', completed_at = now(),
                error_code = 'DISPATCH_FAILED'
          where tenant_id = $1 and id = $2`,
        [context.tenantId, (jobs[0] as { id: string }).id],
      );
      throw new ApiError(502, "DISPATCH_FAILED", "GitHub Actions rechazó la ejecución.");
    }
  }
  await audit(context, `${jobType}_QUEUED`, "connector", connectorId, { dispatched });
  return response({ ...(jobs[0] as object), dispatched }, { status: 202 });
}

export async function listSyncRuns(request: Request): Promise<Response> {
  const context = await apiContext(request);
  const pagination = paginationFrom(request);
  const url = new URL(request.url);
  const connectorId = url.searchParams.get("connectorId");
  const conditions = ["sr.tenant_id = $1"];
  const parameters: unknown[] = [context.tenantId];
  if (connectorId) {
    parameters.push(connectorId);
    conditions.push(`sr.connector_id = $${parameters.length}`);
  }
  const where = conditions.join(" and ");
  const count = (await db().query(
    `select count(*)::text as total from public.sync_runs sr where ${where}`,
    parameters,
  )) as CountRow[];
  const values = [...parameters, pagination.limit, pagination.offset];
  const rows = (await db().query(
    `select sr.id, sr.connector_id as "connectorId", c.account_label as "connectorName",
            sr.status, sr.trigger, sr.started_at as "startedAt",
            sr.completed_at as "completedAt", sr.cases_checked as "casesChecked",
            sr.events_detected as "eventsDetected", sr.error_code as "errorCode",
            sr.error_message as "errorMessage", sr.created_at as "createdAt"
       from public.sync_runs sr
       join public.connectors c on c.id = sr.connector_id and c.tenant_id = sr.tenant_id
      where ${where}
      order by sr.created_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  )) as Record<string, unknown>[];
  return paginated(rows, {
    page: pagination.page,
    limit: pagination.limit,
    total: Number.parseInt(count[0]?.total ?? "0", 10),
  });
}

export async function listAlerts(request: Request): Promise<Response> {
  const context = await apiContext(request);
  const pagination = paginationFrom(request);
  const unreadOnly = new URL(request.url).searchParams.get("unread") === "true";
  const unread = unreadOnly ? " and read_at is null" : "";
  const count = (await db().query(
    `select count(*)::text as total from public.notifications
      where tenant_id = $1 and user_id = $2${unread}`,
    [context.tenantId, context.actorId],
  )) as CountRow[];
  const rows = (await db().query(
    `select id, event_id as "eventId", channel, priority, title, body,
            read_at as "readAt", snoozed_until as "snoozedUntil",
            sent_at as "sentAt", failed_at as "failedAt", created_at as "createdAt"
       from public.notifications
      where tenant_id = $1 and user_id = $2${unread}
      order by created_at desc limit $3 offset $4`,
    [context.tenantId, context.actorId, pagination.limit, pagination.offset],
  )) as Record<string, unknown>[];
  return paginated(rows, {
    page: pagination.page,
    limit: pagination.limit,
    total: Number.parseInt(count[0]?.total ?? "0", 10),
  });
}

export async function updateAlert(request: Request): Promise<Response> {
  const context = await apiContext(request);
  const input = await jsonBody(request, alertUpdateSchema);
  if (input.action === "SNOOZE" && !input.snoozedUntil) {
    throw new ApiError(422, "SNOOZE_DATE_REQUIRED", "Indicá hasta cuándo posponer.");
  }
  const rows = await db().query(
    `update public.notifications
        set read_at = case when $4 = 'READ' then now()
                           when $4 = 'UNREAD' then null else read_at end,
            snoozed_until = case when $4 = 'SNOOZE' then $5 else snoozed_until end
      where tenant_id = $1 and user_id = $2 and id = $3
      returning id, read_at as "readAt", snoozed_until as "snoozedUntil"`,
    [
      context.tenantId,
      context.actorId,
      input.id,
      input.action,
      input.snoozedUntil ?? null,
    ],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "La alerta no existe.");
  return response(rows[0]);
}

export async function listAudit(request: Request): Promise<Response> {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  const pagination = paginationFrom(request);
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const conditions = ["tenant_id = $1"];
  const parameters: unknown[] = [context.tenantId];
  if (action) {
    parameters.push(action);
    conditions.push(`action = $${parameters.length}`);
  }
  const where = conditions.join(" and ");
  const count = (await db().query(
    `select count(*)::text as total from public.audit_logs where ${where}`,
    parameters,
  )) as CountRow[];
  const values = [...parameters, pagination.limit, pagination.offset];
  const rows = (await db().query(
    `select id, actor_user_id as "actorUserId", action, entity_type as "entityType",
            entity_id as "entityId", metadata, created_at as "createdAt"
       from public.audit_logs where ${where}
      order by created_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  )) as Record<string, unknown>[];
  return paginated(rows, {
    page: pagination.page,
    limit: pagination.limit,
    total: Number.parseInt(count[0]?.total ?? "0", 10),
  });
}

export async function clientPortal(request: Request): Promise<Response> {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN", "LAWYER"]);
  const rows = await db().query(
    `select pa.id, pa.client_id as "clientId", cl.full_name as "clientName",
            pa.auth_user_id as "authUserId", pa.active, pa.expires_at as "expiresAt",
            pa.last_used_at as "lastUsedAt", pa.created_at as "createdAt"
       from public.client_portal_access pa
       join public.clients cl on cl.id = pa.client_id and cl.tenant_id = pa.tenant_id
      where pa.tenant_id = $1 order by pa.created_at desc`,
    [context.tenantId],
  );
  return response(rows);
}

export async function createClientPortalAccess(request: Request): Promise<Response> {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  const input = await jsonBody(request, clientPortalAccessSchema);
  await assertTenantEntity(context, "clients", input.clientId, true);
  const authUsers = await db().query(`select 1 from public."user" where id = $1 limit 1`, [
    input.authUserId,
  ]);
  if (authUsers.length === 0) {
    throw new ApiError(422, "AUTH_USER_NOT_FOUND", "El usuario de portal no existe.");
  }
  const rows = await db().query(
    `insert into public.client_portal_access (
       tenant_id, client_id, auth_user_id, expires_at, created_by
     ) values ($1, $2, $3, $4, $5)
     on conflict (tenant_id, client_id, auth_user_id)
     do update set active = true, expires_at = excluded.expires_at
     returning id, client_id as "clientId", auth_user_id as "authUserId",
               active, expires_at as "expiresAt"`,
    [
      context.tenantId,
      input.clientId,
      input.authUserId,
      input.expiresAt ?? null,
      context.actorId,
    ],
  );
  const id = String((rows[0] as { id?: string } | undefined)?.id ?? "");
  await audit(context, "CLIENT_PORTAL_ACCESS_GRANTED", "client-portal-access", id);
  return response(rows[0], { status: 201 });
}

export async function listTeam(request: Request): Promise<Response> {
  const context = await apiContext(request);
  const rows = await db().query(
    `select u.id, u.full_name as "fullName", u.email, u.avatar_url as "avatarUrl",
            tm.role_code as role, tm.active, tm.created_at as "joinedAt"
       from public.tenant_members tm
       join public.users u on u.id = tm.user_id
      where tm.tenant_id = $1
      order by tm.active desc, u.full_name`,
    [context.tenantId],
  );
  return response(rows);
}

export async function addTeamMember(request: Request): Promise<Response> {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  const input = await jsonBody(request, teamMemberSchema);
  const users = (await db().query(
    `select id, name, email from public."user" where lower(email) = lower($1) limit 1`,
    [input.email],
  )) as { id: string; name: string; email: string }[];
  const user = users[0];
  if (!user) {
    throw new ApiError(
      422,
      "USER_NOT_REGISTERED",
      "Ese email todavía no tiene una cuenta. Habilitá el alta cerrada sólo durante su registro.",
    );
  }
  const rows = await db().query(
    `insert into public.tenant_members (
       tenant_id, user_id, role_code, active, created_by
     ) values ($1, $2, $3, true, $4)
     on conflict (tenant_id, user_id)
     do update set role_code = excluded.role_code, active = true
     returning user_id as id, role_code as role, active`,
    [context.tenantId, user.id, input.role, context.actorId],
  );
  await audit(context, "TENANT_MEMBER_ADDED", "user", user.id, { role: input.role });
  return response({ ...(rows[0] as object), fullName: user.name, email: user.email }, {
    status: 201,
  });
}

export async function getSettings(request: Request): Promise<Response> {
  const context = await apiContext(request);
  const rows = await db().query(
    `select t.id, t.name, t.cuit, t.locality, t.timezone, t.email, t.phone, t.whatsapp,
            np.email_enabled as "emailEnabled",
            np.dashboard_enabled as "dashboardEnabled",
            np.morning_digest as "morningDigest",
            np.evening_digest as "eveningDigest",
            np.quiet_hours_start::text as "quietHoursStart",
            np.quiet_hours_end::text as "quietHoursEnd"
       from public.tenants t
       left join public.notification_preferences np
         on np.tenant_id = t.id and np.user_id = $2
      where t.id = $1 limit 1`,
    [context.tenantId, context.actorId],
  );
  return response(rows[0]);
}

export async function updateSettings(request: Request): Promise<Response> {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  const input = await jsonBody(request, settingsUpdateSchema);
  await db().query(
    `update public.tenants
        set name = coalesce($2, name), cuit = coalesce($3, cuit),
            locality = coalesce($4, locality), email = coalesce($5, email),
            phone = coalesce($6, phone), whatsapp = coalesce($7, whatsapp)
      where id = $1`,
    [
      context.tenantId,
      input.name ?? null,
      input.cuit ?? null,
      input.locality ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.whatsapp ?? null,
    ],
  );
  await db().query(
    `insert into public.notification_preferences (
       tenant_id, user_id, email_enabled, dashboard_enabled,
       morning_digest, evening_digest, quiet_hours_start, quiet_hours_end, created_by
     ) values (
       $1, $2, coalesce($3, true), coalesce($4, true),
       coalesce($5, true), coalesce($6, false), $7, $8, $2
     )
     on conflict (tenant_id, user_id) do update set
       email_enabled = coalesce($3, notification_preferences.email_enabled),
       dashboard_enabled = coalesce($4, notification_preferences.dashboard_enabled),
       morning_digest = coalesce($5, notification_preferences.morning_digest),
       evening_digest = coalesce($6, notification_preferences.evening_digest),
       quiet_hours_start = coalesce($7, notification_preferences.quiet_hours_start),
       quiet_hours_end = coalesce($8, notification_preferences.quiet_hours_end)`,
    [
      context.tenantId,
      context.actorId,
      input.emailEnabled ?? null,
      input.dashboardEnabled ?? null,
      input.morningDigest ?? null,
      input.eveningDigest ?? null,
      input.quietHoursStart ?? null,
      input.quietHoursEnd ?? null,
    ],
  );
  await audit(context, "SETTINGS_UPDATED", "tenant", context.tenantId, {
    fields: Object.keys(input),
  });
  return getSettings(request);
}
