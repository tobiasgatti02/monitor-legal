"use client";
import { useState, useEffect } from "react";
type Source = {
  id: string;
  title: string;
  url: string;
  source_kind: string;
  fragment: string;
  position: string;
  current_validity: string;
  access_origin: string;
  consulted_at: string;
};
export function CaseSupport({
  caseId,
  enabled,
  researchEnabled,
}: {
  caseId: string;
  enabled: boolean;
  researchEnabled: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [title, setTitle] = useState(""),
    [source, setSource] = useState("MEV_SCBA"),
    [text, setText] = useState(""),
    [url, setUrl] = useState(""),
    [date, setDate] = useState("");
  const [sources, setSources] = useState<Source[]>([]),
    [query, setQuery] = useState(""),
    [authorityTitle, setAuthorityTitle] = useState(""),
    [authorityUrl, setAuthorityUrl] = useState(""),
    [court, setCourt] = useState(""),
    [jurisdiction, setJurisdiction] = useState(""),
    [fragment, setFragment] = useState(""),
    [content, setContent] = useState(""),
    [sourceKind, setSourceKind] = useState("SUMMARY"),
    [position, setPosition] = useState("UNASSESSED");
  const [amounts, setAmounts] = useState(""),
    [rate, setRate] = useState("0"),
    [proposal, setProposal] = useState<{
      id: string;
      thread_id: string;
      body: string;
    }>();
  async function send(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/cases/${caseId}/${path}`, {
          method: body ? "POST" : "GET",
          ...(body
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        }),
        v = await r.json();
      if (!r.ok) throw Error(v.error?.message);
      return v.data;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (enabled && researchEnabled)
      void fetch(`/api/cases/${caseId}/research`)
        .then((r) => r.json())
        .then((v) => v.data && setSources(v.data));
  }, [enabled, researchEnabled, caseId]);
  if (!enabled) return null;
  return (
    <section className="panel live-folder">
      <h2>Novedades, fuentes y gestión</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <details>
        <summary>Importar novedad judicial manualmente</summary>
        <p>
          MEV y Presentaciones/Notificaciones son procedencias distintas. La
          importación no activa una conexión ni confirma el inicio de un plazo.
        </p>
        <form
          className="folder-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send("imports", {
              source,
              title,
              text,
              ...(url ? { sourceUrl: url } : {}),
              ...(date ? { sourceDate: new Date(date).toISOString() } : {}),
            }).then(
              (v) =>
                v &&
                setNotice(
                  v.duplicate
                    ? "Novedad ya registrada, sin duplicar."
                    : "Importación guardada para revisión en la línea judicial.",
                ),
            );
          }}
        >
          <label>
            Procedencia
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="MEV_SCBA">MEV SCBA</option>
              <option value="SCBA_NOTIFICACIONES">
                Presentaciones y Notificaciones SCBA
              </option>
              <option value="PJN">PJN</option>
            </select>
          </label>
          <label>
            Título
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            URL original
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            Fecha aportada
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Texto aportado
            <textarea
              required
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button disabled={busy} className="secondary-button">
            Guardar importación manual
          </button>
        </form>
      </details>
      <details>
        <summary>Autoridades jurídicas y antecedentes</summary>
        <p>
          <a
            href="https://www.scba.gov.ar/paginas.asp?id=46951"
            target="_blank"
            rel="noreferrer"
          >
            Abrir fuentes oficiales JUBA
          </a>
          . Búsqueda local en fuentes guardadas; no se envían hechos de la causa
          a buscadores públicos. Vigencia y pertinencia pendientes de revisión.
        </p>
        {researchEnabled ? (
          <>
            <form
              className="folder-form"
              onSubmit={(e) => {
                e.preventDefault();
                void send(`research?q=${encodeURIComponent(query)}`).then(
                  (v) => v && setSources(v),
                );
              }}
            >
              <label>
                Buscar en autoridades guardadas
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button disabled={busy} className="secondary-button">
                Buscar
              </button>
            </form>
            <form
              className="folder-form"
              onSubmit={(e) => {
                e.preventDefault();
                void send("research", {
                  url: authorityUrl,
                  title: authorityTitle,
                  court,
                  jurisdiction,
                  fragment,
                  sourceKind,
                  position,
                  ...(content ? { content } : {}),
                }).then(async (v) => {
                  if (v) {
                    setNotice(
                      "Fuente guardada con checksum; metadatos y vigencia pendientes de revisión.",
                    );
                    const saved = await send("research");
                    if (saved) setSources(saved);
                  }
                });
              }}
            >
              <label>
                Título
                <input
                  required
                  value={authorityTitle}
                  onChange={(e) => setAuthorityTitle(e.target.value)}
                />
              </label>
              <label>
                URL oficial
                <input
                  required
                  type="url"
                  value={authorityUrl}
                  onChange={(e) => setAuthorityUrl(e.target.value)}
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
                Jurisdicción de la causa
                <input
                  required
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                />
              </label>
              <label>
                Tipo
                <select
                  value={sourceKind}
                  onChange={(e) => setSourceKind(e.target.value)}
                >
                  <option value="SUMMARY">Sumario</option>
                  <option value="FULL_TEXT">Texto completo aportado</option>
                  <option value="NORM">Normativa aportada</option>
                </select>
              </label>
              <label>
                Posición para revisar
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                >
                  <option value="UNASSESSED">Sin evaluar</option>
                  <option value="FAVORABLE">Favorable</option>
                  <option value="ADVERSE">Adverso</option>
                </select>
              </label>
              <label>
                Pasaje exacto
                <textarea
                  required
                  value={fragment}
                  onChange={(e) => setFragment(e.target.value)}
                />
              </label>
              <label>
                Texto manual opcional
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Si está vacío, el servidor intentará leer la URL oficial; puede fallar."
                />
              </label>
              <button disabled={busy} className="secondary-button">
                Guardar fuente para revisar
              </button>
            </form>
            <div className="folder-grid">
              {sources.map((s) => (
                <article key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                  <blockquote>{s.fragment}</blockquote>
                  <small>
                    {s.source_kind} · {s.position} · {s.access_origin} ·
                    vigencia {s.current_validity} · consultado {s.consulted_at}
                  </small>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p>
            La lectura e investigación externa están deshabilitadas en este
            servidor. Acceso público a JUBA identificado; adaptador de búsqueda
            aún sin verificar.
          </p>
        )}
      </details>
      <details>
        <summary>Preparar actualización al cliente</summary>
        <p>
          Usa actividad revisada y pedidos pendientes. Se guarda una propuesta;
          la aprobación crea un borrador de comunicación.
        </p>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            void send("client-draft", {}).then((v) => v && setProposal(v))
          }
        >
          Preparar borrador
        </button>
        {proposal && (
          <>
            <pre className="folder-output">{proposal.body}</pre>
            <a
              className="text-button"
              href={`/agente?thread=${proposal.thread_id}`}
            >
              Ver propuestas en el asistente
            </a>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await fetch(`/api/agent/approvals/${proposal.id}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ decision: "APPROVE" }),
                    }),
                    v = await r.json();
                  if (!r.ok) throw Error(v.error?.message);
                  setNotice("Borrador creado en Comunicaciones; no se envió.");
                  setProposal(undefined);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Aprobar creación del borrador
            </button>
          </>
        )}
      </details>
      <details>
        <summary>Escenario aritmético</summary>
        <p>
          Precisión decimal, sin reglas jurídicas activadas. Honorarios y pagos
          siguen en sus módulos de gestión.
        </p>
        <form
          className="folder-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send("calculations", {
              amounts: amounts.split(/[\s;]+/).filter(Boolean),
              rateBasisPoints: Number(rate),
            }).then(
              (v) =>
                v &&
                setNotice(
                  `Escenario guardado. Suma ${v.total}; porcentaje ${v.rateAmount}. No es una liquidación jurídica.`,
                ),
            );
          }}
        >
          <label>
            Montos (punto decimal, separados por espacios)
            <input
              required
              value={amounts}
              onChange={(e) => setAmounts(e.target.value)}
              placeholder="100.10 25.20"
            />
          </label>
          <label>
            Porcentaje en puntos básicos (100 = 1%)
            <input
              required
              type="number"
              min="0"
              max="100000"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
          <button disabled={busy} className="secondary-button">
            Calcular y guardar supuestos
          </button>
        </form>
      </details>
      <p>
        Voz: deshabilitada, sin transcripción verificada ni política de
        retención de audio.
      </p>
    </section>
  );
}
