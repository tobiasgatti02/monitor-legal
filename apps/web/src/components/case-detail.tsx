"use client";

import { ArrowLeft, ExternalLink, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type CaseItem = {
  id: string;
  title: string;
  docketNumber: string | null;
  court: string | null;
  status: string;
  priority: string;
  nextAction: string | null;
  nextActionAt: string | null;
};

type EventItem = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string | null;
  severity: string;
  reviewStatus: string;
  detectedAt: string;
  originalText: string;
};

type TaskItem = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
};

const demoCase: CaseItem = {
  id: "demo",
  title: "Pérez Ejemplo c/ Empresa Demo S.A.",
  docketNumber: "FCR 42/2026",
  court: "Juzgado Federal N.º 1",
  status: "ACTIVE",
  priority: "HIGH",
  nextAction: "Revisar traslado detectado",
  nextActionAt: "2026-07-28T10:00:00-03:00",
};

export function CaseDetail({ id, demo }: { id: string; demo: boolean }) {
  const [caseItem, setCaseItem] = useState<CaseItem | null>(demo ? demoCase : null);
  const [events, setEvents] = useState<EventItem[]>(
    demo
      ? [
          {
            id: "demo-event",
            title: "Posible traslado detectado",
            source: "PJN",
            sourceUrl: "https://scw.pjn.gov.ar/",
            severity: "CRITICAL",
            reviewStatus: "UNREVIEWED",
            detectedAt: "2026-07-27T18:24:00-03:00",
            originalText: "Fixture sanitizado para revisión profesional.",
          },
        ]
      : [],
  );
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    Promise.all([
      fetch(`/api/cases/${id}`).then((result) => result.json()),
      fetch(`/api/cases/${id}/events?limit=20`).then((result) => result.json()),
      fetch(`/api/cases/${id}/tasks?limit=20`).then((result) => result.json()),
    ])
      .then(([casePayload, eventPayload, taskPayload]) => {
        if (casePayload.error) throw new Error(String(casePayload.error.message));
        setCaseItem(casePayload.data as CaseItem);
        setEvents((eventPayload.data ?? []) as EventItem[]);
        setTasks((taskPayload.data ?? []) as TaskItem[]);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "No se pudo cargar la causa."),
      );
  }, [demo, id]);

  if (error) return <div className="panel resource-empty">{error}</div>;
  if (!caseItem) {
    return (
      <div className="panel resource-empty">
        <LoaderCircle className="spin" size={22} /> Cargando causa…
      </div>
    );
  }

  return (
    <div className="case-detail-page">
      <Link className="text-button" href="/causas">
        <ArrowLeft size={16} /> Volver a causas
      </Link>
      <header className="case-detail-header">
        <div>
          <p className="eyebrow">{caseItem.docketNumber ?? "Sin número asociado"}</p>
          <h1>{caseItem.title}</h1>
          <p>{caseItem.court ?? "Organismo pendiente"}</p>
        </div>
        <div className="case-chips">
          <span className="stage-chip">{caseItem.status}</span>
          <span className="stage-chip">{caseItem.priority}</span>
        </div>
      </header>
      <section className="case-summary-grid">
        <article className="panel settings-card">
          <h2>Próxima acción</h2>
          <strong>{caseItem.nextAction ?? "Sin próxima acción cargada"}</strong>
          <span>
            {caseItem.nextActionAt
              ? new Intl.DateTimeFormat("es-AR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(caseItem.nextActionAt))
              : "Sin fecha"}
          </span>
        </article>
        <article className="panel settings-card">
          <h2>Tareas abiertas</h2>
          <strong>{tasks.filter((task) => task.status !== "DONE").length}</strong>
          <span>Vinculadas a esta causa</span>
        </article>
        <article className="panel settings-card">
          <h2>Novedades</h2>
          <strong>{events.length}</strong>
          <span>{events.filter((event) => event.reviewStatus === "UNREVIEWED").length} sin revisar</span>
        </article>
      </section>
      <section className="panel timeline-panel">
        <header className="panel-header">
          <div>
            <h2>Línea de tiempo judicial</h2>
            <p>Texto original y portal de origen preservados.</p>
          </div>
        </header>
        {events.length === 0 ? (
          <div className="resource-empty">No hay eventos asociados.</div>
        ) : (
          events.map((event) => (
            <article className="timeline-item" key={event.id}>
              <span className="status-dot status-connected" />
              <div>
                <div className="attention-title-row">
                  <h3>{event.title}</h3>
                  <span className="source-badge source-pjn">{event.source}</span>
                </div>
                <p>{event.originalText}</p>
                <small>
                  {new Intl.DateTimeFormat("es-AR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.detectedAt))}
                  {" · "}
                  {event.severity.replaceAll("_", " ")}
                </small>
                {event.sourceUrl ? (
                  <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                    Abrir fuente <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
