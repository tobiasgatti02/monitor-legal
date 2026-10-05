"use client";
import { useEffect, useState } from "react";
import {
  specialties,
  type Specialty,
  type FolderFact,
} from "@/lib/agent/procedures";
type Item = {
  id: string;
  label: string;
  description: string;
  status: string;
  depends_on: string | null;
  dependency_status: string | null;
  responsible_name: string | null;
  responsible_user_id: string | null;
  due_at: string | null;
};
type Output = {
  id: string;
  title: string;
  body: string;
  stale: boolean;
  reviewed_at: string | null;
};
type Folder = {
  members: { user_id: string; full_name: string }[];
  obligations: {
    id: string;
    title: string;
    status: string;
    due_at: string | null;
  }[];
  cause: {
    specialty: Specialty | null;
    jurisdiction: string | null;
    forum: string | null;
    court: string | null;
    legal_stage: string | null;
  };
  facts: FolderFact[];
  checklist: Item[];
  documents: {
    id: string;
    name: string;
    status: string;
    page_count: number;
    covered_pages: number;
    extraction_status: string;
    extraction_total: number;
    extraction_covered: number;
  }[];
  outputs: Output[];
  partial: boolean;
  discrepancies: { label: string; values: string[] }[];
};
const states: Record<string, string> = {
  REPORTED: "Relatado",
  EXTRACTED: "Extraído · revisar",
  CONFIRMED: "Confirmado",
  REJECTED: "Rechazado",
  PENDING: "Pendiente",
  REQUESTED: "Solicitado",
  RECEIVED: "Recibido",
  WAIVED: "Dispensado",
};
export function LiveFolder({ id, enabled }: { id: string; enabled: boolean }) {
  const [folder, setFolder] = useState<Folder>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [specialty, setSpecialty] = useState<Specialty>("WORK_ACCIDENT"),
    [jurisdiction, setJurisdiction] = useState(""),
    [forum, setForum] = useState(""),
    [court, setCourt] = useState(""),
    [stage, setStage] = useState("");
  const [obligationFact, setObligationFact] = useState(""),
    [obligationTitle, setObligationTitle] = useState(""),
    [obligationDate, setObligationDate] = useState(""),
    [itemResponsible, setItemResponsible] = useState(""),
    [itemDue, setItemDue] = useState("");
  const [factLabel, setFactLabel] = useState(""),
    [factValue, setFactValue] = useState(""),
    [kind, setKind] = useState("FACT"),
    [itemLabel, setItemLabel] = useState(""),
    [dependency, setDependency] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch(`/api/cases/${id}/folder`)
      .then((r) => r.json())
      .then((v) => {
        if (!active) return;
        if (v.error) throw new Error(v.error.message);
        setFolder(v.data);
        const c = v.data.cause;
        setSpecialty(c.specialty ?? "WORK_ACCIDENT");
        setJurisdiction(c.jurisdiction ?? "");
        setForum(c.forum ?? "");
        setCourt(c.court ?? "");
        setStage(c.legal_stage ?? "");
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [id, enabled]);
  async function mutate(input: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/cases/${id}/folder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error?.message ?? "No se pudo guardar.");
      setFolder(v.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reviewFact(f: FolderFact, status: string) {
    const value =
      status === "CONFIRMED"
        ? window.prompt(
            "Valor revisado (se conserva el original):",
            f.normalized_value ?? f.original_value,
          )
        : f.original_value;
    if (!value) return;
    const reason = window.prompt("Motivo de la revisión:");
    if (!reason) return;
    await mutate({ action: "REVIEW_FACT", id: f.id, status, value, reason });
  }
  if (!enabled)
    return (
      <section className="panel settings-card">
        <h2>Carpeta viva</h2>
        <p>
          Ampliación preparada. El servidor debe habilitarla después de aplicar
          y validar las migraciones aisladas.
        </p>
      </section>
    );
  return (
    <section className="panel live-folder">
      <header className="panel-header">
        <div>
          <h2>Carpeta viva</h2>
          <p>Hechos, fuentes y documentación para revisión profesional.</p>
        </div>
      </header>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!folder ? (
        <p>Cargando carpeta…</p>
      ) : (
        <>
          <form
            className="folder-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate({
                action: "CONFIGURE",
                specialty,
                jurisdiction,
                forum,
                court,
                stage,
              });
            }}
          >
            <label>
              Especialidad
              <select
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value as Specialty)}
              >
                {Object.entries(specialties).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jurisdicción
              <input
                required
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="Registrar jurisdicción"
              />
            </label>
            <label>
              Fuero
              <input
                required
                value={forum}
                onChange={(e) => setForum(e.target.value)}
              />
            </label>
            <label>
              Tribunal
              <input
                required
                value={court}
                onChange={(e) => setCourt(e.target.value)}
              />
            </label>
            <label>
              Etapa
              <input value={stage} onChange={(e) => setStage(e.target.value)} />
            </label>
            <button disabled={busy} className="secondary-button">
              Guardar contexto
            </button>
          </form>
          <p className="folder-notice">
            {folder.partial
              ? "Cobertura parcial: faltan páginas, extracción o hay resultados paginados. La cronología no es exhaustiva."
              : "Cobertura registrada de fuentes. Confirmá los hechos y contrastá los originales."}{" "}
            {specialties[specialty].limit}
          </p>
          <h3>Fuentes y cobertura</h3>
          <div className="folder-grid">
            {folder.documents.map((d) => (
              <article key={d.id}>
                <a
                  href={`/api/knowledge/${d.id}/source`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {d.name}
                </a>
                <p>
                  {d.status ?? "Sin procesar"} · páginas con texto:{" "}
                  {d.covered_pages ?? 0}/{d.page_count || "?"} · extracción:{" "}
                  {d.extraction_covered ?? 0}/{d.extraction_total || "?"} (
                  {d.extraction_status ?? "PENDING"})
                </p>
              </article>
            ))}
          </div>
          <h3>Hechos y cronología documentada</h3>
          <form
            className="folder-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate({
                action: "ADD_FACT",
                kind,
                label: factLabel,
                value: factValue,
              });
              setFactLabel("");
              setFactValue("");
            }}
          >
            <label>
              Tipo
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="FACT">Hecho</option>
                <option value="EVENT">Evento relatado</option>
                <option value="PERSON">Persona/vínculo relatado</option>
                <option value="ASSET">Bien informado</option>
              </select>
            </label>
            <label>
              Etiqueta
              <input
                required
                value={factLabel}
                onChange={(e) => setFactLabel(e.target.value)}
              />
            </label>
            <label>
              Relato
              <input
                required
                value={factValue}
                onChange={(e) => setFactValue(e.target.value)}
              />
            </label>
            <button disabled={busy} className="secondary-button">
              Agregar relato
            </button>
          </form>
          <div className="folder-grid">
            {folder.facts.map((f) => (
              <article key={f.id}>
                <strong>
                  {f.event_date && `${f.event_date} · `}
                  {f.label}
                </strong>
                <p>{f.normalized_value ?? f.original_value}</p>
                {f.normalized_value &&
                  f.normalized_value !== f.original_value && (
                    <small>Original: {f.original_value}</small>
                  )}
                <p>
                  {states[f.status]}
                  {f.stale && " · Fuente desactualizada"}
                </p>
                {f.document_id ? (
                  <>
                    <blockquote>{f.passage}</blockquote>
                    <a
                      href={`/api/knowledge/${f.document_id}/source#page=${f.page ?? 1}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver original · versión {f.source_version} · página/sección{" "}
                      {f.page}
                    </a>
                  </>
                ) : (
                  <small>Relatado; sin prueba documental.</small>
                )}
                <div className="case-chips">
                  <button
                    disabled={busy || f.stale}
                    onClick={() => void reviewFact(f, "CONFIRMED")}
                    className="text-button"
                  >
                    Confirmar/corregir
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void reviewFact(f, "REJECTED")}
                    className="text-button"
                  >
                    Rechazar
                  </button>
                </div>
              </article>
            ))}
          </div>
          {folder.discrepancies.length > 0 && (
            <div role="status">
              <h3>Discrepancias para revisar</h3>
              {folder.discrepancies.map((d) => (
                <p key={d.label}>
                  {d.label}: {d.values.join(" / ")}
                </p>
              ))}
            </div>
          )}
          <h3>Documentación pendiente</h3>
          <p>
            Lista inicial sintética, configurable; el abogado revisa su
            pertinencia.
          </p>
          <button
            disabled={busy || !folder.cause.specialty}
            onClick={() => void mutate({ action: "INIT_CHECKLIST" })}
            className="secondary-button"
          >
            Agregar lista inicial
          </button>
          <form
            className="folder-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate({
                action: "ADD_ITEM",
                label: itemLabel,
                ...(itemResponsible
                  ? { responsibleUserId: itemResponsible }
                  : {}),
                ...(itemDue ? { dueAt: `${itemDue}T12:00:00-03:00` } : {}),
                ...(dependency ? { dependsOn: dependency } : {}),
              });
              setItemLabel("");
            }}
          >
            <label>
              Pedido documental
              <input
                required
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
              />
            </label>
            <label>
              Depende de
              <select
                value={dependency}
                onChange={(e) => setDependency(e.target.value)}
              >
                <option value="">Sin dependencia</option>
                {folder.checklist.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Responsable
              <select
                value={itemResponsible}
                onChange={(e) => setItemResponsible(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {folder.members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha de gestión
              <input
                type="date"
                value={itemDue}
                onChange={(e) => setItemDue(e.target.value)}
              />
            </label>
            <button disabled={busy} className="secondary-button">
              Agregar pedido
            </button>
          </form>
          <div className="folder-grid">
            {folder.checklist.map((i) => (
              <article key={i.id}>
                <strong>{i.label}</strong>
                <p>{i.description}</p>
                <p>
                  {i.responsible_name ?? "Sin responsable"} ·{" "}
                  {i.due_at
                    ? new Date(i.due_at).toLocaleDateString("es-AR", {
                        timeZone: "America/Argentina/Buenos_Aires",
                      })
                    : "Sin fecha de gestión"}
                  {i.depends_on &&
                    ` · Dependencia: ${states[i.dependency_status ?? "PENDING"]}`}
                </p>
                <label>
                  Estado
                  <select
                    aria-label={`Estado de ${i.label}`}
                    disabled={busy}
                    value={i.status}
                    onChange={(e) =>
                      void mutate({
                        action: "UPDATE_ITEM",
                        id: i.id,
                        status: e.target.value,
                      })
                    }
                  >
                    {["PENDING", "REQUESTED", "RECEIVED", "WAIVED"].map((s) => (
                      <option key={s} value={s}>
                        {states[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Responsable
                  <select
                    disabled={busy}
                    value={i.responsible_user_id ?? ""}
                    onChange={(e) =>
                      e.target.value &&
                      void mutate({
                        action: "UPDATE_ITEM",
                        id: i.id,
                        status: i.status,
                        responsibleUserId: e.target.value,
                      })
                    }
                  >
                    <option value="">Sin asignar</option>
                    {folder.members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    const label = window.prompt("Etiqueta", i.label),
                      description = window.prompt(
                        "Pedido / próximo paso",
                        i.description,
                      );
                    if (label && description !== null)
                      void mutate({
                        action: "UPDATE_ITEM",
                        id: i.id,
                        status: i.status,
                        label,
                        description,
                      });
                  }}
                >
                  Editar pedido
                </button>
              </article>
            ))}
          </div>
          {folder.cause.specialty === "HEALTH" && (
            <>
              <h3>Obligaciones documentadas</h3>
              <p>
                El abogado confirma la fuente y registra la fecha; no se infiere
                un plazo de una prescripción médica.
              </p>
              <form
                className="folder-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate({
                    action: "REGISTER_OBLIGATION",
                    factId: obligationFact,
                    title: obligationTitle,
                    ...(obligationDate
                      ? { dueAt: `${obligationDate}T12:00:00-03:00` }
                      : {}),
                  });
                }}
              >
                <label>
                  Fuente confirmada
                  <select
                    required
                    value={obligationFact}
                    onChange={(e) => setObligationFact(e.target.value)}
                  >
                    <option value="">Seleccionar fuente revisada</option>
                    {folder.facts
                      .filter(
                        (f) =>
                          f.status === "CONFIRMED" && !f.stale && f.document_id,
                      )
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label} · {f.normalized_value ?? f.original_value}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Obligación revisada
                  <input
                    required
                    value={obligationTitle}
                    onChange={(e) => setObligationTitle(e.target.value)}
                  />
                </label>
                <label>
                  Fecha de seguimiento
                  <input
                    type="date"
                    value={obligationDate}
                    onChange={(e) => setObligationDate(e.target.value)}
                  />
                </label>
                <button disabled={busy} className="secondary-button">
                  Registrar obligación revisada
                </button>
              </form>
              {folder.obligations.map((t) => (
                <p key={t.id}>
                  <a href="/tareas">{t.title}</a> · {t.status} ·{" "}
                  {t.due_at
                    ? new Date(t.due_at).toLocaleDateString("es-AR")
                    : "Sin fecha ingresada"}
                </p>
              ))}
            </>
          )}
          <h3>Procedimiento y resultados</h3>
          <button
            disabled={busy || !folder.cause.specialty}
            onClick={() => void mutate({ action: "PROCEDURE" })}
            className="primary-button"
          >
            Preparar cronología, matriz e índice
          </button>
          <p>
            Se calcula con datos registrados y conserva el resultado en la
            causa. No requiere IA.
          </p>
          {folder.outputs.map((o) => (
            <article className="folder-output" key={o.id}>
              <h3>{o.title}</h3>
              <p>
                {o.stale
                  ? "Desactualizado: regenerar"
                  : o.reviewed_at
                    ? "Revisado por el abogado"
                    : "Pendiente de revisión"}
              </p>
              <pre>{o.body}</pre>
              <button
                disabled={busy || o.stale}
                onClick={() =>
                  void mutate({ action: "REVIEW_OUTPUT", id: o.id })
                }
                className="secondary-button"
              >
                Registrar revisión
              </button>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
