"use client";
import { useEffect, useState } from "react";
import { specialties, type Specialty } from "@/lib/agent/procedures";
type Template = {
  id: string;
  title: string;
  jurisdiction: string;
  specialty: Specialty;
  approved_at: string | null;
  source_kind: string;
  version: number;
  sections: { key: string; title: string }[];
};
type Draft = {
  id: string;
  title: string;
  kind: string;
  body: string;
  stale: boolean;
  revision: number;
  metadata: { templateId?: string };
};
export function DraftWorkspace({
  caseId,
  enabled,
}: {
  caseId: string;
  enabled: boolean;
}) {
  const [templates, setTemplates] = useState<Template[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [section, setSection] = useState(""),
    [parent, setParent] = useState(""),
    [edited, setEdited] = useState(""),
    [editing, setEditing] = useState("");
  const [title, setTitle] = useState(""),
    [specialty, setSpecialty] = useState<Specialty>("WORK_ACCIDENT"),
    [jurisdiction, setJurisdiction] = useState(""),
    [purpose, setPurpose] = useState(""),
    [body, setBody] = useState(""),
    [sourceKind, setSourceKind] = useState("LAWYER_MODEL");
  async function load() {
    const [t, f] = await Promise.all([
      fetch("/api/agent/templates").then((r) => r.json()),
      fetch(`/api/cases/${caseId}/folder`).then((r) => r.json()),
    ]);
    if (t.error || f.error) throw Error(t.error?.message ?? f.error?.message);
    setTemplates(t.data);
    setDrafts(f.data.outputs.filter((o: Draft) => o.kind === "DRAFT"));
  }
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.all([
      fetch("/api/agent/templates").then((r) => r.json()),
      fetch(`/api/cases/${caseId}/folder`).then((r) => r.json()),
    ])
      .then(([t, f]) => {
        if (!active) return;
        if (t.error || f.error)
          throw Error(t.error?.message ?? f.error?.message);
        setTemplates(t.data);
        setDrafts(f.data.outputs.filter((o: Draft) => o.kind === "DRAFT"));
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [enabled, caseId]);
  async function send(url: string, payload?: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
          method: "POST",
          ...(payload
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              }
            : {}),
        }),
        v = await r.json();
      if (!r.ok) throw Error(v.error?.message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return null;
  const template = templates.find((t) => t.id === selected);
  return (
    <section className="panel live-folder">
      <h2>Plantillas y escritos</h2>
      <p>
        Modelos versionados, aprobados por el abogado. Cada sección utiliza
        hechos confirmados y fuentes comprobables.
      </p>
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>Incorporar modelo del estudio</summary>
        <form
          className="folder-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send("/api/agent/templates", {
              title,
              specialty,
              jurisdiction,
              purpose,
              body,
              sourceKind,
              sections: [
                { key: "HECHOS", title: "Hechos" },
                { key: "PETICION", title: "Petición para revisión" },
              ],
            });
          }}
        >
          <label>
            Título
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Especialidad
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value as Specialty)}
            >
              {Object.entries(specialties).map(([k, p]) => (
                <option key={k} value={k}>
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
            />
          </label>
          <label>
            Finalidad
            <input
              required
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </label>
          <label>
            Procedencia
            <select
              value={sourceKind}
              onChange={(e) => setSourceKind(e.target.value)}
            >
              <option value="LAWYER_MODEL">
                Modelo aportado por el abogado
              </option>
              <option value="SYNTHETIC">Plantilla sintética</option>
            </select>
          </label>
          <label>
            Texto del modelo
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
            />
          </label>
          <button disabled={busy} className="secondary-button">
            Guardar versión sin aprobar
          </button>
        </form>
      </details>
      <div className="folder-grid">
        {templates.map((t) => (
          <article key={t.id}>
            <strong>
              {t.title} · v{t.version}
            </strong>
            <p>
              {t.jurisdiction} ·{" "}
              {t.source_kind === "SYNTHETIC"
                ? "Sintética"
                : "Aportada por el abogado"}{" "}
              · {t.approved_at ? "Aprobada" : "Pendiente de aprobación"}
            </p>
            {!t.approved_at && (
              <button
                disabled={busy}
                className="text-button"
                onClick={() => void send(`/api/agent/templates/${t.id}`)}
              >
                Aprobar esta versión
              </button>
            )}
          </article>
        ))}
      </div>
      <form
        className="folder-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(`/api/cases/${caseId}/drafts`, {
            action: "GENERATE_SECTION",
            templateId: selected,
            section,
            ...(parent ? { parentId: parent } : {}),
          });
        }}
      >
        <label>
          Plantilla aprobada
          <select
            required
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setSection("");
              setParent("");
            }}
          >
            <option value="">Seleccionar</option>
            {templates
              .filter((t) => t.approved_at)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {t.jurisdiction}
                </option>
              ))}
          </select>
        </label>
        <label>
          Sección
          <select
            required
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            <option value="">Seleccionar</option>
            {template?.sections.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Continuar versión
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Nuevo borrador</option>
            {drafts
              .filter((d) => d.metadata.templateId === selected)
              .map((d) => (
                <option value={d.id} key={d.id}>
                  {d.title} · v{d.revision}
                </option>
              ))}
          </select>
        </label>
        <button disabled={busy || !selected} className="primary-button">
          Generar sólo esta sección
        </button>
      </form>
      {drafts.map((d) => (
        <article className="folder-output" key={d.id}>
          <h3>
            {d.title} · v{d.revision}
          </h3>
          <p>
            {d.stale
              ? "Fuentes o datos cambiaron; revisar y regenerar"
              : "Borrador editable para revisión"}
          </p>
          {editing === d.id ? (
            <>
              <textarea
                rows={16}
                value={edited}
                onChange={(e) => setEdited(e.target.value)}
                aria-label="Texto del borrador"
              />
              <button
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt(
                    "Motivo de la edición de esta causa (no cambia la plantilla):",
                  );
                  if (reason)
                    void send(`/api/cases/${caseId}/drafts`, {
                      action: "SAVE_EDIT",
                      id: d.id,
                      body: edited,
                      reason,
                    }).then(() => setEditing(""));
                }}
                className="secondary-button"
              >
                Guardar nueva versión
              </button>
            </>
          ) : (
            <>
              <pre>{d.body}</pre>
              <button
                className="text-button"
                onClick={() => {
                  setEditing(d.id);
                  setEdited(d.body);
                }}
              >
                Editar esta causa
              </button>
            </>
          )}
          {!d.stale && (
            <a
              className="text-button"
              href={`/api/cases/${caseId}/outputs/${d.id}`}
            >
              Exportar DOCX para revisión
            </a>
          )}
        </article>
      ))}
    </section>
  );
}
