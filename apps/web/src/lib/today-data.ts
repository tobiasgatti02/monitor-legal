import "server-only";

import { capabilities } from "@/lib/agent/flags";
import { demoDashboard } from "@/lib/demo-data";
import {
  orderAttention,
  todayDashboardSchema,
  type AttentionItem,
  type TodayDashboard,
} from "@/lib/dashboard";
import { db, isDatabaseConfigured } from "@/lib/db";
import { demoMode } from "@/lib/demo-mode";

type MembershipRow = {
  tenant_id: string;
  actor_name: string | null;
};

type SummaryRow = {
  urgent: string;
  possible_deadlines: string;
  overdue_tasks: string;
  upcoming: string;
  notifications: string;
  waiting_clients: string;
  untouched_leads: string;
  sync_failures: string;
};

type EventRow = {
  id: string;
  title: string;
  context: string | null;
  source: "PJN" | "MEV_SCBA" | "SCBA_NOTIFICACIONES";
  detected_at: string;
  original_text: string;
  owner: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  source_url: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  context: string | null;
  due_at: string;
  status: string;
};

type CommunicationRow = {
  id: string;
  client: string;
  matter: string | null;
  reason: string;
  days_waiting: number;
  whatsapp: string | null;
  email: string | null;
};

type LeadRow = {
  id: string;
  name: string;
  matter: string;
  stage: string;
  next_action: string | null;
  overdue: boolean;
};

type ConnectorRow = {
  id: string;
  name: string;
  status: "CONNECTED" | "DEGRADED" | "DISCONNECTED" | "PAUSED";
  last_sync: string | null;
  detail: string | null;
};

function dateLabel(date = new Date()): string {
  const label = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function relativeTime(value: string): string {
  const elapsedMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (elapsedMinutes < 60) return `hace ${elapsedMinutes} min`;
  const hours = Math.round(elapsedMinutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

function sourceLabel(source: EventRow["source"]): AttentionItem["source"] {
  if (source === "MEV_SCBA") return "MEV";
  if (source === "SCBA_NOTIFICACIONES") return "SCBA";
  return "PJN";
}

function numberValue(value: string): number {
  const result = Number.parseInt(value, 10);
  return Number.isFinite(result) ? result : 0;
}

export async function getTodayDashboard(
  actorId: string,
): Promise<TodayDashboard> {
  const demoEnabled = demoMode();
  if (demoEnabled) {
    return todayDashboardSchema.parse({
      ...demoDashboard,
      dateLabel: dateLabel(),
    });
  }
  if (!isDatabaseConfigured())
    throw new Error("La base del estudio no está configurada.");

  const sql = db();
  const memberships = (await sql.query(
    `select tm.tenant_id, u.full_name as actor_name
       from public.tenant_members tm
       left join public.users u on u.id = tm.user_id
      where tm.user_id = $1 and tm.active
      order by tm.created_at
      limit 1`,
    [actorId],
  )) as MembershipRow[];
  const membership = memberships[0];
  if (!membership) {
    throw new Error("El usuario autenticado no pertenece a ningún estudio");
  }

  const tenantId = membership.tenant_id;
  const [
    summaryRows,
    eventRows,
    taskRows,
    communicationRows,
    leadRows,
    connectorRows,
  ] = (await Promise.all([
    sql.query(
      `select
          (select count(*) from public.judicial_events
            where tenant_id = $1 and review_status = 'UNREVIEWED'
              and severity in ('CRITICAL', 'HIGH'))::text as urgent,
          (select count(*) from public.deadlines
            where tenant_id = $1 and status in ('DETECTED', 'POSSIBLE'))::text
              as possible_deadlines,
          (select count(*) from public.tasks
            where tenant_id = $1 and status not in ('DONE', 'CANCELLED')
              and due_at < now())::text as overdue_tasks,
          (select count(*) from public.deadlines
            where tenant_id = $1 and status = 'CONFIRMED'
              and due_at between now() and now() + interval '14 days')::text as upcoming,
          (select count(*) from public.notifications
            where tenant_id = $1 and user_id = $2 and read_at is null)::text as notifications,
          (select count(*) from public.clients
            where tenant_id = $1 and deleted_at is null
              and next_contact_at <= now())::text as waiting_clients,
          (select count(*) from public.leads
            where tenant_id = $1 and deleted_at is null
              and status in ('NEW', 'TO_CONTACT'))::text as untouched_leads,
          (select count(*) from public.connectors
            where tenant_id = $1 and status in ('DEGRADED', 'DISCONNECTED'))::text
              as sync_failures`,
      [tenantId, actorId],
    ),
    sql.query(
      `select e.id, e.title, coalesce(c.title, c.docket_number) as context, e.source,
                e.detected_at, e.original_text, e.source_url,
                coalesce(u.full_name, 'Sin asignar') as owner, e.severity
           from public.judicial_events e
           left join public.cases c on c.id = e.case_id
           left join public.users u on u.id = c.responsible_user_id
          where e.tenant_id = $1 and e.review_status = 'UNREVIEWED'
          order by
            case e.severity when 'CRITICAL' then 4 when 'HIGH' then 3
              when 'MEDIUM' then 2 else 1 end desc,
            e.detected_at desc
          limit 8`,
      [tenantId],
    ),
    sql.query(
      `select t.id, t.title, coalesce(c.title, cl.full_name) as context, t.due_at, t.status
           from public.tasks t
           left join public.cases c on c.id = t.case_id
           left join public.clients cl on cl.id = t.client_id
          where t.tenant_id = $1 and t.status not in ('DONE', 'CANCELLED')
            and t.due_at >= date_trunc('day', now())
            and t.due_at < date_trunc('day', now()) + interval '1 day'
          order by t.due_at
          limit 10`,
      [tenantId],
    ),
    sql.query(
      `select cl.id, cl.full_name as client, c.title as matter,
                case when cl.next_contact_at <= now() then 'Contacto prometido pendiente'
                     else 'Novedad pendiente de comunicar' end as reason,
                greatest(0, extract(day from now() - coalesce(cl.last_contact_at, cl.created_at)))::int
                  as days_waiting,
                cl.whatsapp, cl.email
           from public.clients cl
           left join lateral (
             select cases.title from public.cases
              where cases.client_id = cl.id and cases.deleted_at is null
              order by cases.updated_at desc limit 1
           ) c on true
          where cl.tenant_id = $1 and cl.deleted_at is null
            and (cl.next_contact_at <= now() or exists (
              select 1 from public.judicial_events e
               where e.case_id in (select id from public.cases where client_id = cl.id)
                 and e.review_status = 'REVIEWED'
                 and not exists (
                   select 1 from public.communications comm
                    where comm.source_event_id = e.id and comm.status = 'SENT'
                 )
            ))
          order by days_waiting desc limit 5`,
      [tenantId],
    ),
    sql.query(
      `select id, full_name as name, consultation_reason as matter, status::text as stage,
                next_action, coalesce(next_action_at < now(), false) as overdue
           from public.leads
          where tenant_id = $1 and deleted_at is null
            and status not in ('HIRED', 'NOT_HIRED', 'CONFLICT', 'OUT_OF_SCOPE')
          order by overdue desc, created_at
          limit 5`,
      [tenantId],
    ),
    sql.query(
      `select id, source::text || ' · ' || account_label as name, status,
                last_success_at as last_sync,
                coalesce(last_error_message, 'Sin errores recientes') as detail
           from public.connectors
          where tenant_id = $1
          order by source, account_label`,
      [tenantId],
    ),
  ])) as [
    SummaryRow[],
    EventRow[],
    TaskRow[],
    CommunicationRow[],
    LeadRow[],
    ConnectorRow[],
  ];

  const summary = summaryRows[0];
  if (!summary) throw new Error("No se pudo calcular el resumen diario");

  const folderAttention: AttentionItem[] = [];
  if (capabilities().liveFolder) {
    const pending = await sql.query(
      `select i.id,i.label,c.title,c.id as case_id,i.updated_at,i.due_at,coalesce(u.full_name,'Sin asignar') as owner,dep.label as dependency,dep.status as dependency_status from case_checklists i join cases c on c.id=i.case_id and c.tenant_id=i.tenant_id left join users u on u.id=i.responsible_user_id left join case_checklists dep on dep.id=i.depends_on and dep.tenant_id=i.tenant_id where i.tenant_id=$1 and c.deleted_at is null and i.status in('PENDING','REQUESTED') order by i.due_at nulls last,i.updated_at limit 12`,
      [tenantId],
    );
    folderAttention.push(
      ...pending.map((i) => ({
        id: i.id,
        type: "DOCUMENT" as const,
        title: `Documentación: ${i.label}`,
        context: i.title,
        source: "ESTUDIO" as const,
        relativeTime: relativeTime(i.updated_at),
        reason: `Regla: pedido pendiente. Fecha de gestión: ${i.due_at ?? "sin fecha"}. Actualizado: ${i.updated_at}.${i.dependency ? ` Depende de ${i.dependency} (${i.dependency_status}).` : ""} No es un plazo procesal.`,
        owner: i.owner,
        priority:
          i.due_at && Date.parse(i.due_at) < Date.now()
            ? ("HIGH" as const)
            : ("MEDIUM" as const),
        primaryAction: "Abrir carpeta",
        sourceUrl: `/causas/${i.case_id}`,
      })),
    );
    const quiet = await sql.query(
      `select id,title,updated_at,coalesce(next_action,'Definir próximo paso') as next_action from cases where tenant_id=$1 and deleted_at is null and status='ACTIVE' and updated_at<now()-interval '14 days' order by updated_at limit 5`,
      [tenantId],
    );
    folderAttention.push(
      ...quiet.map((i) => ({
        id: i.id,
        type: "CASE" as const,
        title: `Ficha sin actualizar: ${i.title}`,
        context: i.next_action,
        source: "ESTUDIO" as const,
        relativeTime: relativeTime(i.updated_at),
        reason: `Regla: ficha de causa activa sin actualización durante 14 días. Fuente: registro de causa; última actualización ${i.updated_at}. Verificar actividad no registrada.`,
        owner: "Responsable de la causa",
        priority: "MEDIUM" as const,
        primaryAction: "Abrir carpeta",
        sourceUrl: `/causas/${i.id}`,
      })),
    );
  }

  const dashboard: TodayDashboard = {
    actorName: membership.actor_name?.split(" ")[0] ?? "Abogado",
    dateLabel: dateLabel(),
    summary: {
      urgent: numberValue(summary.urgent),
      possibleDeadlines: numberValue(summary.possible_deadlines),
      overdueTasks: numberValue(summary.overdue_tasks),
      upcoming: numberValue(summary.upcoming),
      notifications: numberValue(summary.notifications),
      waitingClients: numberValue(summary.waiting_clients),
      untouchedLeads: numberValue(summary.untouched_leads),
      syncFailures: numberValue(summary.sync_failures),
    },
    attention: orderAttention([
      ...folderAttention,
      ...eventRows.map((event) => ({
        id: event.id,
        type: "EVENT" as const,
        title: event.title,
        context: event.context ?? "Expediente sin vincular",
        source: sourceLabel(event.source),
        relativeTime: relativeTime(event.detected_at),
        reason: event.original_text,
        owner: event.owner ?? "Sin asignar",
        priority: event.severity,
        primaryAction: "Revisar",
        sourceUrl: event.source_url,
      })),
    ]),
    agenda: taskRows.map((task) => ({
      id: task.id,
      time: new Intl.DateTimeFormat("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date(task.due_at)),
      title: task.title,
      context: task.context ?? "Tarea interna",
      kind: "TASK",
      completed: task.status === "DONE",
    })),
    communications: communicationRows.map((item) => ({
      id: item.id,
      client: item.client,
      matter: item.matter ?? "Sin causa vinculada",
      reason: item.reason,
      daysWaiting: item.days_waiting,
      whatsapp: item.whatsapp,
      email: item.email,
    })),
    leads: leadRows.map((lead) => ({
      id: lead.id,
      name: lead.name,
      matter: lead.matter,
      stage: lead.stage,
      nextAction: lead.next_action ?? "Definir próxima acción",
      overdue: lead.overdue,
    })),
    integrations: connectorRows.map((connector) => ({
      id: connector.id,
      name: connector.name
        .replace("MEV_SCBA", "MEV")
        .replace("SCBA_NOTIFICACIONES", "SCBA"),
      status:
        connector.status === "CONNECTED"
          ? "HEALTHY"
          : connector.status === "DEGRADED"
            ? "DEGRADED"
            : "OFFLINE",
      lastSync: connector.last_sync
        ? new Intl.DateTimeFormat("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(connector.last_sync))
        : "Nunca",
      detail: connector.detail ?? "Sin detalle",
    })),
  };

  return todayDashboardSchema.parse(dashboard);
}
