"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileWarning,
  Gavel,
  HeartPulse,
  ListTodo,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  UserRound,
  UserRoundPlus,
  Users,
  WifiOff,
} from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import {
  orderAttention,
  type AttentionItem,
  type TodayDashboard as DashboardData,
} from "@/lib/dashboard";

const summaryCards = [
  { key: "urgent", label: "Urgencias sin revisar", icon: CircleAlert, tone: "danger" },
  { key: "possibleDeadlines", label: "Posibles plazos", icon: FileWarning, tone: "warning" },
  { key: "overdueTasks", label: "Tareas vencidas", icon: ListTodo, tone: "danger" },
  { key: "upcoming", label: "Próximos 14 días", icon: CalendarClock, tone: "neutral" },
  { key: "notifications", label: "Nuevas notificaciones", icon: BellRing, tone: "neutral" },
  { key: "waitingClients", label: "Clientes esperando", icon: Users, tone: "warning" },
  { key: "untouchedLeads", label: "Leads sin contactar", icon: UserRoundPlus, tone: "neutral" },
  { key: "syncFailures", label: "Fallos de sincronización", icon: WifiOff, tone: "danger" },
] as const;

const typeIcons: Record<AttentionItem["type"], typeof Gavel> = {
  EVENT: Gavel,
  DEADLINE: CalendarClock,
  TASK: ListTodo,
  COMMUNICATION: MessageCircle,
  LEAD: UserRoundPlus,
  SYNC: HeartPulse,
};

const quickActions = [
  { label: "Nueva tarea", icon: ListTodo, shortcut: "T" },
  { label: "Nuevo cliente", icon: UserRound, shortcut: "" },
  { label: "Nuevo lead", icon: UserRoundPlus, shortcut: "L" },
  { label: "Nueva causa", icon: BriefcaseBusiness, shortcut: "C" },
  { label: "Nueva nota", icon: FileWarning, shortcut: "" },
  { label: "Registrar llamada", icon: Phone, shortcut: "" },
] as const;

function sourceClass(source: AttentionItem["source"]): string {
  return `source-badge source-${source.toLowerCase()}`;
}

function whatsappHref(phone: string, client: string, matter: string): string {
  const message = `Hola, ${client}. Se registró una novedad en ${matter}. El estudio ya la está revisando y le informaremos si requiere alguna acción de su parte.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function TodayDashboard({ data }: { data: DashboardData }) {
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set());
  const [completedAgenda, setCompletedAgenda] = useState<Set<string>>(
    () => new Set(data.agenda.filter((item) => item.completed).map((item) => item.id)),
  );

  const attention = useMemo(
    () => orderAttention(data.attention.filter((item) => !reviewed.has(item.id))),
    [data.attention, reviewed],
  );
  const integrationProblems = data.integrations.filter(
    (integration) => integration.status !== "HEALTHY",
  );

  function markReviewed(id: string) {
    setReviewed((current) => new Set(current).add(id));
  }

  function toggleAgenda(id: string) {
    setCompletedAgenda((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="today-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">{data.dateLabel}</p>
          <h1>Buenos días, {data.actorName}</h1>
          <p className="heading-copy">Esto es lo que necesita tu atención hoy.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" type="button">
            <RefreshCw size={16} />
            Sincronizar ahora
          </button>
          <details className="quick-action">
            <summary className="button button-primary">
              <Plus size={17} />
              Nueva acción
            </summary>
            <div className="quick-menu">
              {quickActions.map((action) => (
                <button type="button" key={action.label}>
                  <action.icon size={17} />
                  <span>{action.label}</span>
                  {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
                </button>
              ))}
            </div>
          </details>
        </div>
      </section>

      <section className="sync-line" aria-label="Estado de sincronización">
        <span className="live-dot" />
        <strong>Monitoreo activo</strong>
        {data.integrations
          .filter((integration) => integration.name.startsWith("PJN"))
          .map((integration) => (
            <span key={integration.id}>
              {integration.name}: {integration.lastSync}
            </span>
          ))}
        <button type="button">Ver salud</button>
      </section>

      <section className="summary-grid" aria-label="Resumen crítico">
        {summaryCards.map((card) => {
          const value = data.summary[card.key];
          return (
            <button
              className={cn("summary-card", `summary-${card.tone}`, value === 0 && "is-zero")}
              type="button"
              key={card.key}
            >
              <span className="summary-icon">
                <card.icon size={18} />
              </span>
              <span>
                <strong>{value}</strong>
                <small>{card.label}</small>
              </span>
              <ChevronRight size={16} className="summary-chevron" />
            </button>
          );
        })}
      </section>

      <div className="dashboard-grid">
        <section className="panel attention-panel">
          <header className="panel-header">
            <div>
              <h2>Qué necesita tu atención</h2>
              <p>Ordenado por urgencia e impacto.</p>
            </div>
            <button className="text-button" type="button">
              Ver todas <ArrowUpRight size={15} />
            </button>
          </header>

          <div className="attention-list">
            {attention.length === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={28} />
                <strong>Todo revisado por ahora</strong>
                <span>Las nuevas alertas aparecerán acá.</span>
              </div>
            ) : (
              attention.map((item) => {
                const Icon = typeIcons[item.type];
                return (
                  <article className={cn("attention-item", `priority-${item.priority.toLowerCase()}`)} key={item.id}>
                    <span className="attention-icon">
                      <Icon size={18} />
                    </span>
                    <div className="attention-body">
                      <div className="attention-title-row">
                        <h3>{item.title}</h3>
                        <span className={sourceClass(item.source)}>{item.source}</span>
                      </div>
                      <p className="attention-context">
                        {item.context} <span>· {item.relativeTime}</span>
                      </p>
                      <p className="attention-reason">{item.reason}</p>
                      <div className="attention-meta">
                        <span className="avatar avatar-small">
                          {item.owner === "Sin asignar"
                            ? "—"
                            : item.owner
                                .split(" ")
                                .map((part) => part[0])
                                .join("")
                                .slice(0, 2)}
                        </span>
                        <span>{item.owner}</span>
                      </div>
                      <div className="item-actions">
                        <button
                          className="button button-small button-primary"
                          type="button"
                          onClick={() => markReviewed(item.id)}
                        >
                          {item.primaryAction}
                        </button>
                        <button className="button button-small button-ghost" type="button">
                          Crear tarea
                        </button>
                        <button className="button button-small button-ghost" type="button">
                          Abrir fuente
                        </button>
                        <button className="icon-button subtle" type="button" aria-label="Más acciones">
                          <MoreHorizontal size={17} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <aside className="right-column">
          <section className="panel agenda-panel">
            <header className="panel-header compact">
              <div>
                <h2>Agenda de hoy</h2>
                <p>{data.agenda.length} actividades</p>
              </div>
              <button className="icon-button subtle" type="button" aria-label="Abrir calendario">
                <CalendarCheck size={18} />
              </button>
            </header>
            <div className="agenda-list">
              {data.agenda.map((item) => {
                const completed = completedAgenda.has(item.id);
                return (
                  <button
                    className={cn("agenda-item", completed && "completed")}
                    type="button"
                    key={item.id}
                    onClick={() => toggleAgenda(item.id)}
                  >
                    <span className="agenda-time">{item.time}</span>
                    <span className="agenda-line" />
                    <span className="agenda-copy">
                      <strong>{item.title}</strong>
                      <small>{item.context}</small>
                    </span>
                    <span className="agenda-check">{completed ? <Check size={14} /> : null}</span>
                  </button>
                );
              })}
            </div>
            <button className="panel-footer-action" type="button">
              Abrir agenda completa <ChevronRight size={15} />
            </button>
          </section>

          {integrationProblems.length > 0 ? (
            <section className="panel health-panel">
              <header className="panel-header compact">
                <div>
                  <h2>Salud de integraciones</h2>
                  <p>Se muestran sólo problemas.</p>
                </div>
                <AlertTriangle size={18} className="warning-icon" />
              </header>
              {integrationProblems.map((integration) => (
                <div className="health-item" key={integration.id}>
                  <span className={cn("status-dot", `status-${integration.status.toLowerCase()}`)} />
                  <div>
                    <strong>{integration.name}</strong>
                    <small>{integration.detail}</small>
                  </div>
                  <button type="button">Resolver</button>
                </div>
              ))}
            </section>
          ) : null}
        </aside>
      </div>

      <div className="lower-grid">
        <section className="panel communication-panel">
          <header className="panel-header">
            <div>
              <h2>Clientes que requieren comunicación</h2>
              <p>Novedades o compromisos pendientes.</p>
            </div>
            <button className="text-button" type="button">
              Ver clientes <ArrowUpRight size={15} />
            </button>
          </header>
          <div className="table-list">
            {data.communications.map((item) => (
              <article className="contact-row" key={item.id}>
                <span className="avatar">{item.client.slice(0, 2).toUpperCase()}</span>
                <div className="contact-copy">
                  <strong>{item.client}</strong>
                  <span>{item.matter}</span>
                  <small>{item.reason}</small>
                </div>
                <span className="waiting-chip">
                  <Clock3 size={13} />
                  {item.daysWaiting} d
                </span>
                <div className="contact-actions">
                  {item.whatsapp ? (
                    <a
                      className="icon-button whatsapp"
                      href={whatsappHref(item.whatsapp, item.client, item.matter)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Abrir WhatsApp para ${item.client}`}
                    >
                      <MessageCircle size={17} />
                    </a>
                  ) : null}
                  {item.email ? (
                    <a
                      className="icon-button subtle"
                      href={`mailto:${item.email}`}
                      aria-label={`Enviar email a ${item.client}`}
                    >
                      <Mail size={17} />
                    </a>
                  ) : null}
                  <button className="button button-small button-secondary" type="button">
                    Redactar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel leads-panel">
          <header className="panel-header">
            <div>
              <h2>Leads pendientes</h2>
              <p>Próximas acciones comerciales.</p>
            </div>
            <button className="icon-button subtle" type="button" aria-label="Buscar leads">
              <Search size={17} />
            </button>
          </header>
          <div className="lead-list">
            {data.leads.map((lead) => (
              <article className="lead-row" key={lead.id}>
                <span className="lead-avatar">
                  {lead.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div>
                  <strong>{lead.name}</strong>
                  <span>{lead.matter}</span>
                  <small className={lead.overdue ? "overdue" : ""}>
                    {lead.overdue ? <AlertTriangle size={12} /> : <Send size={12} />}
                    {lead.nextAction}
                  </small>
                </div>
                <span className="stage-chip">{lead.stage}</span>
                <button className="icon-button subtle" type="button" aria-label={`Abrir ${lead.name}`}>
                  <ChevronRight size={17} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>

      <p className="legal-disclaimer">
        Las fechas detectadas y clasificaciones automáticas requieren revisión profesional.
        Monitor Legal no presenta escritos ni resuelve captchas.
      </p>
    </div>
  );
}
