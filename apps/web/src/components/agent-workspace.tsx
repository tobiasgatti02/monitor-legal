"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  FileText,
  LoaderCircle,
  MessageSquare,
  Mic,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
  Square,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Citation } from "@/lib/agent/contracts";
import { useAgentAudio } from "./use-agent-audio";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  metadata?: { latencyMs?: number };
};
type Approval = {
  id: string;
  action: string;
  payload: { title: string; body: string; dueAt?: string; repeatFrequency?: string };
  threadId: string;
};
type State = {
  threads: { id: string; title: string; caseId?: string }[];
  cases: { id: string; title: string }[];
  approvals: Approval[];
  memories: { id: string; value: string }[];
  modelConfigured: boolean;
  stats: { queries: number; tokens: number };
};
const starters = [
  {
    title: "Preparar mi día",
    detail: "Plazos, pendientes y novedades",
    prompt: "/plazos",
    icon: Clock,
  },
  {
    title: "Investigar una causa",
    detail: "Respuestas con evidencia documental",
    prompt:
      "Resumí los hechos acreditados en los documentos de esta causa y citá las fuentes.",
    icon: BookOpen,
  },
  {
    title: "Redactar un escrito",
    detail: "Un borrador para tu revisión",
    prompt:
      "Prepará un borrador de escrito con los hechos respaldados por documentos. Indicá qué información falta completar.",
    icon: FileText,
  },
];

async function apiCall(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  const v = await r.json();
  if (!r.ok)
    throw Object.assign(
      new Error(v.error?.message ?? "No pudimos completar la operación."),
      { details: v.error?.details },
    );
  return v.data;
}
export function AgentWorkspace() {
  const [data, setData] = useState<State | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [threadId, setThreadId] = useState<string>(),
    [caseId, setCaseId] = useState(""),
    [mode, setMode] = useState("research"),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [source, setSource] = useState<Citation>(),
    [memory, setMemory] = useState("");
  const end = useRef<HTMLDivElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null);
  const audio = useAgentAudio(setText, (value) => void send(value));
  async function refresh() {
    try {
      setData(await apiCall("/api/agent"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void apiCall("/api/agent")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  async function openThread(id: string) {
    if (busy) return;
    audio.cancelListening();
    audio.stopSpeaking();
    try {
      const v = await apiCall(`/api/agent/threads/${id}`);
      setThreadId(id);
      setCaseId(v.thread.caseId ?? "");
      setMessages(v.messages);
      setSource(undefined);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function reset() {
    if (busy) return;
    audio.cancelListening();
    audio.stopSpeaking();
    setThreadId(undefined);
    setMessages([]);
    setSource(undefined);
    setError("");
    textarea.current?.focus();
  }
  async function send(value = text) {
    if (!value.trim() || busy) return;
    audio.cancelListening();
    audio.stopSpeaking();
    setBusy(true);
    setError("");
    setText("");
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", content: value },
    ]);
    try {
      const answer = await apiCall("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: value,
          threadId,
          caseId: caseId || undefined,
          mode,
        }),
      });
      setThreadId(answer.threadId);
      setMessages((m) => [...m, answer]);
      if (audio.readReplies) audio.speak(answer.id, answer.content);
      await refresh();
    } catch (e) {
      const failure = e as Error & { details?: { threadId: string } };
      setError(failure.message);
      if (failure.details?.threadId) setThreadId(failure.details.threadId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function decide(id: string, decision: string) {
    try {
      await apiCall(`/api/agent/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addMemory() {
    if (!memory.trim()) return;
    try {
      await apiCall("/api/agent/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: memory }),
      });
      setMemory("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="agent-layout">
      <aside className="agent-history">
        <div className="section-eyebrow">TU ESPACIO DE TRABAJO</div>
        <button
          className="button button-primary"
          onClick={reset}
          disabled={busy}
        >
          <Plus size={16} />
          Nueva consulta
        </button>
        <div className="history-label">Conversaciones</div>
        {data?.threads.length ? (
          data.threads.map((t) => (
            <button
              key={t.id}
              className={`history-item ${threadId === t.id ? "selected" : ""}`}
              onClick={() => void openThread(t.id)}
            >
              <MessageSquare size={15} />
              <span>{t.title}</span>
            </button>
          ))
        ) : (
          <p className="muted">Tus consultas se guardarán acá.</p>
        )}
        <details className="memory-settings">
          <summary>Preferencias del asistente</summary>
          <p>Información que vos elegís recordar.</p>
          {data?.memories.map((m) => (
            <div className="memory-item" key={m.id}>
              <span>{m.value}</span>
              <button
                aria-label="Eliminar preferencia"
                onClick={() =>
                  void apiCall("/api/agent/memories", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: m.id }),
                  })
                    .then(refresh)
                    .catch((e) => setError(e.message))
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <input
            aria-label="Nueva preferencia"
            value={memory}
            onChange={(e) => setMemory(e.target.value)}
            maxLength={1000}
            placeholder="Ej.: prefiero respuestas breves"
          />
          <button
            className="button button-secondary"
            onClick={() => void addMemory()}
          >
            Guardar preferencia
          </button>
        </details>
        <div className="agent-usage">
          <ShieldCheck size={16} />
          <span>
            Acceso privado por causa
            <br />
            {data?.stats.queries ?? 0} consultas hoy
          </span>
        </div>
      </aside>
      <section className="agent-conversation">
        <header className="agent-header">
          <div>
            <span className="section-eyebrow">ASISTENTE DEL ESTUDIO</span>
            <h1>Claridad para cada caso.</h1>
          </div>
          <span
            className={`agent-status ${data?.modelConfigured ? "connected" : ""}`}
          >
            <span />
            {data?.modelConfigured ? "IA conectada" : "Consultas del estudio"}
          </span>
        </header>
        <div className="agent-scope">
          <label>
            Causa
            <select
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              disabled={!!threadId || busy}
            >
              <option value="">Todas mis causas autorizadas</option>
              {data?.cases.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trabajo
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="research">Investigar</option>
              <option value="draft">Redactar</option>
              <option value="operations">Organizar</option>
            </select>
          </label>
        </div>
        <div className="message-list">
          {!messages.length ? (
            <div className="agent-welcome">
              <span className="welcome-symbol">
                <Sparkles size={28} strokeWidth={1.3} />
              </span>
              <h2>Tu criterio, con mejor contexto.</h2>
              <p>
                Contame qué necesitás. Podés conversar, consultar tus
                pendientes, investigar documentos o preparar un borrador.
              </p>
              <div className="starter-grid">
                {starters.map((s) => (
                  <button key={s.title} onClick={() => void send(s.prompt)}>
                    <s.icon size={20} />
                    <strong>{s.title}</strong>
                    <span>{s.detail}</span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
              {data && !data.modelConfigured ? (
                <div className="agent-notice">
                  La investigación y redacción con IA se activarán al conectar
                  el proveedor. Ya podés consultar datos reales con{" "}
                  <button onClick={() => void send("/tareas")}>/tareas</button>,{" "}
                  <button onClick={() => void send("/causas")}>/causas</button>{" "}
                  y <button onClick={() => setText("/buscar ")}>/buscar</button>
                  .
                </div>
              ) : null}
            </div>
          ) : (
            messages.map((m) => (
              <article className={`agent-message ${m.role}`} key={m.id}>
                <div className="message-avatar">
                  {m.role === "assistant" ? <Sparkles size={17} /> : "Vos"}
                </div>
                <div className="message-body">
                  <span className="message-author">
                    {m.role === "assistant" ? "Asistente del estudio" : "Vos"}
                  </span>
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => {
                        const found = m.citations?.find(
                          (c) => `#source-${c.id}` === href,
                        );
                        return found ? (
                          <button
                            className="inline-citation"
                            onClick={() => setSource(found)}
                          >
                            {children}
                          </button>
                        ) : (
                          <span>{children}</span>
                        );
                      },
                    }}
                  >
                    {m.content.replace(
                      /\[([SR]\d+)\]/g,
                      (_, id) => `[${id}](#source-${id})`,
                    )}
                  </ReactMarkdown>
                  {m.role === "assistant" && audio.supported.output ? (
                    <button
                      className="audio-response"
                      aria-label={audio.speakingId === m.id ? "Detener lectura de respuesta" : "Escuchar respuesta"}
                      onClick={() => audio.speakingId === m.id ? audio.stopSpeaking() : audio.speak(m.id, m.content)}
                    >
                      {audio.speakingId === m.id ? <Square size={13} /> : <Volume2 size={14} />}
                      {audio.speakingId === m.id ? "Detener audio" : "Escuchar"}
                    </button>
                  ) : null}
                  {m.citations?.length ? (
                    <div className="citation-list">
                      {m.citations.map((c) => (
                        <button key={c.id} onClick={() => setSource(c)}>
                          <FileText size={13} />
                          <strong>{c.id}</strong>
                          <span>{c.title}</span>
                          {c.pageStart && !/\.docx$/i.test(c.title) ? (
                            <small>p. {c.pageStart}</small>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {m.role === "assistant" &&
                  typeof m.metadata?.latencyMs === "number" &&
                  Number.isFinite(m.metadata.latencyMs) &&
                  m.metadata.latencyMs >= 0 ? (
                    <small className="message-meta">
                      Respondió en {(m.metadata.latencyMs / 1000).toFixed(1)} s
                    </small>
                  ) : null}
                </div>
              </article>
            ))
          )}
          {busy ? (
            <div className="thinking" role="status">
              <LoaderCircle size={17} className="spin" />
              Preparando tu respuesta…
            </div>
          ) : null}
          <div ref={end} />
        </div>
        {data?.approvals
          .filter((a) => a.threadId === threadId)
          .map((a) => (
            <div className="approval-card" key={a.id}>
              <div>
                <span className="section-eyebrow">REQUIERE TU APROBACIÓN</span>
                <h3>{a.payload.title}</h3>
                <p>{a.payload.body}</p>
                {a.payload.dueAt ? (
                  <small>
                    Fecha propuesta:{" "}
                    {new Date(a.payload.dueAt).toLocaleString("es-AR")}
                  </small>
                ) : null}
                <small>
                  {a.action === "CREATE_REMINDER" ? `Se programará un recordatorio ${a.payload.repeatFrequency === "DAILY" ? "diario" : a.payload.repeatFrequency === "WEEKLY" ? "semanal" : "de una sola vez"}, pendiente de tu aprobación.` : a.action === "CREATE_DEADLINE"
                    ? "Se registrará como plazo posible; requiere confirmación jurídica."
                    : a.action === "DRAFT_COMMUNICATION"
                      ? "Se guardará un borrador. El envío requiere otra aprobación."
                      : "Se creará una tarea en esta causa."}
                </small>
              </div>
              <div className="approval-buttons">
                <button
                  className="button button-secondary"
                  onClick={() => void decide(a.id, "REJECT")}
                >
                  <X size={14} />
                  Rechazar
                </button>
                <button
                  className="button button-primary"
                  onClick={() => void decide(a.id, "APPROVE")}
                >
                  <Check size={14} />
                  Aprobar
                </button>
              </div>
            </div>
          ))}
        {error ? (
          <div className="agent-error" role="alert">
            {error}
          </div>
        ) : null}
        {audio.audioError ? <div className="agent-error" role="alert">{audio.audioError}</div> : null}
        <form
          className="agent-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (audio.listening) audio.finishListening(true);
            else void send();
          }}
        >
          <textarea
            ref={textarea}
            aria-label="Consulta al asistente"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Contame qué necesitás o preguntá sobre tus causas…"
            rows={2}
            maxLength={4000}
            disabled={busy || audio.listening}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="agent-audio-controls">
            <button
              type="button"
              className={`audio-control ${audio.listening ? "active" : ""}`}
              disabled={busy || !audio.supported.input}
              aria-pressed={audio.listening}
              onClick={() => audio.listening ? audio.finishListening() : audio.startListening(text)}
            >
              {audio.listening ? <Square size={14} /> : <Mic size={16} />}
              {audio.listening ? "Terminar dictado" : "Hablar"}
            </button>
            {audio.supported.output ? <label>
              <input type="checkbox" checked={audio.readReplies} onChange={(e) => {
                audio.setReadReplies(e.target.checked);
                if (!e.target.checked) audio.stopSpeaking();
              }} />
              Leer respuestas en voz alta
            </label> : null}
            {audio.speakingId ? <button type="button" className="audio-control" onClick={audio.stopSpeaking}><Square size={13} />Detener audio</button> : null}
          </div>
          <p className="audio-help" role="status">
            {audio.listening
              ? "Escuchando… Al terminar, presioná la flecha para enviar o usá Terminar dictado para revisar el texto."
              : audio.supported.input
                ? "Podés dictar y enviar tu consulta. El navegador puede procesar el audio mediante su servicio de voz."
                : "Dictado no disponible en este navegador. Podés seguir escribiendo tu consulta."}
          </p>
          <div className="composer-bottom">
            <span>
              <ShieldCheck size={13} />
              Fuentes verificables · acciones con aprobación
            </span>
            <button
              type="submit"
              disabled={busy || (!text.trim() && !audio.listening)}
              aria-label={audio.listening ? "Terminar y enviar consulta hablada" : "Enviar consulta"}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <ArrowUp size={20} />
              )}
            </button>
          </div>
        </form>
        <p className="composer-note">
          Revisá los borradores y confirmá los plazos con las fuentes
          originales.
        </p>
      </section>
      {source ? (
        <aside className="source-panel">
          <header>
            <span className="section-eyebrow">FUENTE {source.id}</span>
            <button
              onClick={() => setSource(undefined)}
              aria-label="Cerrar fuente"
            >
              <X size={18} />
            </button>
          </header>
          <h3>{source.title}</h3>
          {source.pageStart && !/\.docx$/i.test(source.title) ? (
            <p>Página {source.pageStart}</p>
          ) : null}
          <blockquote>{source.excerpt}</blockquote>
          <a
            className="button button-primary"
            href={`${source.url}${source.pageStart ? `#page=${source.pageStart}` : ""}`}
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={15} />
            Abrir fuente original
          </a>
        </aside>
      ) : null}
    </div>
  );
}
