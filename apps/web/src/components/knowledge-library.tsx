"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  FileText,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
type Doc = {
  id: string;
  name: string;
  caseTitle: string | null;
  caseId: string | null;
  status: string;
  sizeBytes: number;
  pageCount: number;
  chunkCount: number;
  embeddedChunks: number;
  errorCode?: string;
  coveredPages?: number;
  extractionStatus?: string;
  job?: {
    id: string;
    status: string;
    stage?: string;
    offset?: number;
    errorCode?: string;
  };
};
const labels: Record<string, string> = {
  READY: "Disponible",
  PENDING: "Sin indexar",
  PROCESSING: "Procesando",
  NEEDS_OCR: "Necesita OCR",
  FAILED: "Revisar archivo",
  PARTIAL: "Cobertura parcial",
  STALE: "Desactualizado",
};
export function KnowledgeLibrary() {
  const [docs, setDocs] = useState<Doc[]>([]),
    [cases, setCases] = useState<{ id: string; title: string }[]>([]),
    [caseId, setCaseId] = useState(""),
    [filter, setFilter] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false),
    polls = useRef(0);
  async function load() {
    const r = await fetch("/api/knowledge"),
      v = await r.json();
    if (!r.ok) throw new Error(v.error?.message);
    setDocs(v.data);
  }
  useEffect(() => {
    void fetch("/api/knowledge")
      .then((r) => r.json())
      .then((v) => (v.error ? setError(v.error.message) : setDocs(v.data)));
    void fetch("/api/cases?limit=100")
      .then((r) => r.json())
      .then((v) => v.data && setCases(v.data));
  }, []);
  const pending = docs.some(
    (d) => d.job && ["QUEUED", "RUNNING"].includes(d.job.status),
  );
  useEffect(() => {
    if (!pending || polls.current >= 20) return;
    const timer = setTimeout(
      () => {
        polls.current++;
        void load().catch((e) => setError(e.message));
      },
      Math.min(30000, 1500 * 2 ** Math.min(polls.current, 5)),
    );
    return () => clearTimeout(timer);
  }, [pending, docs]);
  async function jobAction(id: string, action: string) {
    setBusy(id);
    setError("");
    try {
      const r = await fetch(`/api/knowledge/jobs/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error?.message);
      polls.current = 0;
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function executeStep() {
    setBusy("step");
    setError("");
    try {
      const r = await fetch("/api/knowledge/jobs", { method: "POST" }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error?.message);
      if (v.data.disabled)
        throw new Error(
          "El ejecutor durable está deshabilitado en el servidor.",
        );
      polls.current = 0;
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function upload(file: File) {
    polls.current = 0;
    setBusy("upload");
    setError("");
    try {
      const ticketResponse = await fetch("/api/knowledge/upload-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          mime: file.type,
          size: file.size,
          caseId: caseId || undefined,
        }),
      });
      const ticket = await ticketResponse.json();
      if (!ticketResponse.ok)
        throw new Error(
          ticket.error?.message ?? "No se pudo autorizar la carga.",
        );
      const stored = await fetch(ticket.data.url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!stored.ok)
        throw new Error(
          "No se pudo guardar el archivo original. Volvé a intentar.",
        );
      const r = await fetch("/api/knowledge/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: ticket.data.id }),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error?.message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function reindex(id: string, pages?: { page: number; text: string }[]) {
    setBusy(id);
    setError("");
    try {
      const r = await fetch(`/api/knowledge/${id}/index`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages }),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error?.message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function ocr(doc: Doc) {
    setBusy(doc.id);
    setError("");
    cancelled.current = false;
    setProgress("Preparando reconocimiento local…");
    try {
      const r = await fetch(`/api/knowledge/${doc.id}/source`);
      if (!r.ok) throw new Error("No pudimos abrir el documento.");
      const buffer = await r.arrayBuffer();
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("spa+eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        logger: (m) => {
          if (m.status === "recognizing text")
            setProgress(`Reconociendo texto: ${Math.round(m.progress * 100)}%`);
        },
      });
      const pages: { page: number; text: string }[] = [];
      try {
        if (/\.pdf$/i.test(doc.name)) {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
          const pdf = await pdfjs.getDocument({ data: buffer }).promise;
          try {
            if (pdf.numPages > 30)
              throw new Error(
                "El OCR local admite hasta 30 páginas por archivo. Dividí el PDF.",
              );
            for (let i = 1; i <= pdf.numPages; i++) {
              if (cancelled.current)
                throw new Error("OCR cancelado; original conservado.");
              setProgress(`Reconociendo página ${i} de ${pdf.numPages}…`);
              const page = await pdf.getPage(i),
                canvas = document.createElement("canvas");
              try {
                const content = await page.getTextContent();
                const text = content.items
                  .map((item) => ("str" in item ? item.str : ""))
                  .join(" ");
                if (text.trim().length >= 20) {
                  pages.push({ page: i, text });
                  continue;
                }
                const viewport = page.getViewport({ scale: 1.6 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({
                  canvas,
                  canvasContext: canvas.getContext("2d")!,
                  viewport,
                }).promise;
                const result = await worker.recognize(canvas);
                pages.push({ page: i, text: result.data.text });
              } finally {
                canvas.width = 0;
                canvas.height = 0;
                page.cleanup();
              }
            }
          } finally {
            await pdf.loadingTask.destroy();
          }
        } else {
          const result = await worker.recognize(new Blob([buffer]));
          pages.push({ page: 1, text: result.data.text });
        }
      } finally {
        await worker.terminate();
      }
      if (cancelled.current)
        throw new Error("OCR cancelado; original conservado.");
      setProgress("Guardando texto reconocido…");
      await reindex(doc.id, pages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
      setProgress("");
    }
  }
  async function remove(doc: Doc) {
    if (!window.confirm(`¿Eliminar «${doc.name}» de la biblioteca?`)) return;
    try {
      const r = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("No se pudo eliminar.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const visible = docs.filter(
    (d) =>
      (!filter || d.caseId === filter) &&
      d.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="knowledge-page">
      <header className="page-heading">
        <div>
          <span className="section-eyebrow">CONOCIMIENTO DEL ESTUDIO</span>
          <h1>Los documentos, en contexto.</h1>
          <p>
            Una biblioteca privada para investigar con fuentes y volver siempre
            al original.
          </p>
        </div>
        <a className="button button-secondary" href="/agente">
          <BookOpen size={16} />
          Consultar al asistente
        </a>
      </header>
      <div className="knowledge-summary">
        <div>
          <FileText size={19} />
          <strong>{docs.length}</strong>
          <span>documentos</span>
        </div>
        <div>
          <CheckCircle2 size={19} />
          <strong>{docs.filter((d) => d.status === "READY").length}</strong>
          <span>disponibles para consulta</span>
        </div>
        <div>
          <FolderOpen size={19} />
          <strong>
            {new Set(docs.map((d) => d.caseId).filter(Boolean)).size}
          </strong>
          <span>causas con documentos</span>
        </div>
      </div>
      <section className="upload-panel">
        <div className="upload-context">
          <span className="section-eyebrow">INCORPORAR EVIDENCIA</span>
          <h2>Agregá documentos a una causa</h2>
          <p>PDF, DOCX, TXT y Markdown · Hasta 5 MB por archivo</p>
          <label>
            Causa de destino
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">Biblioteca personal (sin causa)</option>
              {cases.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && !busy) void upload(file);
          }}
        >
          <UploadCloud size={30} strokeWidth={1.3} />
          <strong>Arrastrá tu documento acá</strong>
          <span>o elegilo desde tu computadora</span>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <button
            className="button button-primary"
            disabled={!!busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy === "upload" ? (
              <LoaderCircle size={16} className="spin" />
            ) : null}
            {busy === "upload" ? "Procesando…" : "Seleccionar archivo"}
          </button>
        </div>
      </section>
      {error ? (
        <p className="agent-error" role="alert">
          {error}
        </p>
      ) : null}
      {progress ? (
        <p className="ocr-progress" role="status">
          <LoaderCircle size={16} className="spin" />
          {progress} · El reconocimiento se ejecuta en tu dispositivo.
          <button
            className="text-button"
            onClick={() => {
              cancelled.current = true;
            }}
          >
            Cancelar después de la página actual
          </button>
        </p>
      ) : null}
      {pending && (
        <p role="status">
          Trabajo guardado en cola durable. Podés cerrar esta página.{" "}
          <button
            disabled={!!busy}
            className="text-button"
            onClick={() => void executeStep()}
          >
            Ejecutar un paso
          </button>
        </p>
      )}
      <section className="panel knowledge-list">
        <div className="knowledge-toolbar">
          <div className="library-search">
            <Search size={16} />
            <input
              aria-label="Buscar documento"
              placeholder="Buscar documento…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filtrar por causa"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Todas las causas</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        {!visible.length ? (
          <div className="knowledge-empty">
            <FolderOpen size={32} strokeWidth={1.1} />
            <h3>
              {search || filter
                ? "No hay documentos para este filtro"
                : "La biblioteca está lista para tus documentos"}
            </h3>
            <p>
              Subí el primer archivo para comenzar a investigar con evidencia.
            </p>
          </div>
        ) : (
          <div className="document-grid">
            {visible.map((d) => (
              <article className="document-card" key={d.id}>
                {d.job && (
                  <div>
                    <small>
                      Trabajo: {d.job.status} · {d.job.stage ?? "en cola"} ·
                      lote {d.job.offset ?? 0}
                    </small>
                    <p>
                      Cobertura de texto: {d.coveredPages ?? 0}/
                      {d.pageCount || "?"} · extracción:{" "}
                      {d.extractionStatus ?? "PENDING"}
                    </p>
                    {d.job.errorCode && (
                      <p role="status">
                        {d.job.errorCode} · El avance se conserva.
                      </p>
                    )}
                    {d.job.status === "FAILED" &&
                      [
                        "DOCUMENT_EXTRACTION_BUDGET",
                        "EXTRACTION_CONTINUE_REQUIRED",
                      ].includes(d.job.errorCode ?? "") && (
                        <button
                          disabled={!!busy}
                          className="text-button"
                          onClick={() => void jobAction(d.job!.id, "CONTINUE")}
                        >
                          Continuar hasta seis unidades
                        </button>
                      )}
                    {["FAILED", "CANCELLED"].includes(d.job.status) && (
                      <button
                        disabled={!!busy}
                        className="text-button"
                        onClick={() => void jobAction(d.job!.id, "RETRY")}
                      >
                        Reintentar desde avance
                      </button>
                    )}
                    {["QUEUED", "RUNNING"].includes(d.job.status) && (
                      <button
                        disabled={!!busy}
                        className="text-button"
                        onClick={() => void jobAction(d.job!.id, "CANCEL")}
                      >
                        Cancelar trabajo
                      </button>
                    )}
                  </div>
                )}
                <div className="document-icon">
                  <FileText size={23} strokeWidth={1.3} />
                </div>
                <div className="document-info">
                  <a
                    href={`/api/knowledge/${d.id}/source`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <h3>{d.name}</h3>
                  </a>
                  <p>{d.caseTitle ?? "Biblioteca personal"}</p>
                  <span>
                    {(Number(d.sizeBytes) / 1024).toFixed(0)} KB
                    {d.pageCount
                      ? ` · ${d.pageCount} ${/\.docx$/i.test(d.name) ? "sección" : "páginas"}`
                      : ""}
                    {d.chunkCount ? ` · ${d.chunkCount} fragmentos` : ""}
                  </span>
                </div>
                <div className="document-state">
                  <span className={`doc-status ${d.status.toLowerCase()}`}>
                    {labels[d.status] ?? d.status}
                  </span>
                  {d.status === "READY" ? (
                    <small>
                      {d.embeddedChunks === d.chunkCount
                        ? "Texto + búsqueda semántica"
                        : "Búsqueda por texto"}
                    </small>
                  ) : null}
                </div>
                <div className="document-actions">
                  {d.status === "NEEDS_OCR" ||
                  /\.(png|jpe?g)$/i.test(d.name) ? (
                    <button
                      className="button button-secondary"
                      disabled={!!busy}
                      onClick={() => void ocr(d)}
                    >
                      Reconocer texto
                    </button>
                  ) : (
                    <button
                      className="icon-button"
                      disabled={!!busy}
                      aria-label={`Reindexar ${d.name}`}
                      title="Reindexar"
                      onClick={() => void reindex(d.id)}
                    >
                      {busy === d.id ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <RefreshCw size={16} />
                      )}
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Eliminar ${d.name}`}
                    onClick={() => void remove(d)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="library-note">
        Los documentos conservan su original. El asistente sólo consulta
        archivos que tu cuenta puede abrir.
      </p>
    </div>
  );
}
