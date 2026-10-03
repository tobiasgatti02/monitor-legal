"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Bell,
  CalendarClock,
  Check,
  Clock,
  Plus,
  Settings2,
  X,
} from "lucide-react";
type Alert = {
  id: string;
  title: string;
  body: string;
  priority: string;
  kind: string;
  sourceUrl: string | null;
  readAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
};
type Reminder = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  repeatFrequency: string;
  priority: string;
};
const labels: Record<string, string> = {
  DEADLINE: "Vencimientos",
  TASK: "Tareas",
  EVENT: "Novedades importantes",
  AGENDA: "Audiencias y agenda",
  CLIENT: "Seguimiento de clientes",
  LEAD: "Consultas por retomar",
  CONNECTOR: "Fallos de conexión",
  DOCUMENT: "Documentos para revisar",
};
export function AlertsWorkspace() {
  const [now, setNow] = useState(() => Date.now()),
    [alerts, setAlerts] = useState<Alert[]>([]),
    [reminders, setReminders] = useState<Reminder[]>([]),
    [cases, setCases] = useState<{ id: string; title: string }[]>([]),
    [settings, setSettings] = useState<{
      enabledKinds: string[];
      quietStart: number | null;
      quietEnd: number | null;
    }>({ enabledKinds: Object.keys(labels), quietStart: null, quietEnd: null }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [unread, setUnread] = useState(true),
    [status, setStatus] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/alerts?limit=100"),
      v = await r.json();
    if (!r.ok) throw new Error(v.error?.message);
    setAlerts(v.data);
    setNow(Date.now());
    const reminders = await fetch("/api/reminders");
    const rv = await reminders.json();
    if (reminders.ok) setReminders(rv.data);
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message));
    void fetch("/api/cases?limit=100")
      .then((r) => r.json())
      .then((v) => v.data && setCases(v.data));
    void fetch("/api/alert-settings")
      .then((r) => r.json())
      .then((v) => v.data && setSettings(v.data));
    const timer = setInterval(() => {
      void load().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [load]);
  async function call(path: string, body: unknown, method = "POST") {
    const r = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error?.message ?? "No se pudo guardar.");
    return v;
  }
  async function create(form: FormData) {
    setBusy(true);
    setError("");
    try {
      await call("/api/reminders", {
        title: form.get("title"),
        body: form.get("body"),
        dueAt: new Date(String(form.get("dueAt"))).toISOString(),
        caseId: form.get("caseId") || undefined,
        repeatFrequency: form.get("repeatFrequency"),
        priority: form.get("priority"),
      });
      setStatus("Recordatorio programado.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function alertAction(id: string, action: "READ" | "UNREAD" | "SNOOZE") {
    try {
      await call(
        "/api/alerts",
        {
          id,
          action,
          ...(action === "SNOOZE"
            ? { snoozedUntil: new Date(now + 3600000).toISOString() }
            : {}),
        },
        "PATCH",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function cancel(id: string) {
    try {
      await call("/api/reminders", { id, status: "CANCELLED" }, "PATCH");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveSettings() {
    try {
      await call("/api/alert-settings", settings, "PUT");
      setStatus("Preferencias guardadas.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function push() {
    setError("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error(
          "Este navegador no admite avisos push. Las alertas siguen disponibles acá.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Habilitá las notificaciones en tu navegador para recibir avisos.",
        );
      const key = await fetch("/api/push").then((r) => r.json());
      if (!key.data?.publicKey)
        throw new Error("Los avisos push todavía no están conectados.");
      const reg = await navigator.serviceWorker.register(
        "/notifications-sw.js",
      );
      await navigator.serviceWorker.ready;
      const raw = atob(
          key.data.publicKey.replace(/-/g, "+").replace(/_/g, "/"),
        ),
        bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }));
      await call("/api/push", sub.toJSON());
      setStatus(
        "Avisos activados en este dispositivo, incluso con el dashboard cerrado.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function unpush() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await call("/api/push", { endpoint: sub.endpoint }, "DELETE");
        await sub.unsubscribe();
      }
      setStatus("Avisos desactivados en este dispositivo.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const visible = alerts.filter(
    (a) =>
      (!unread || !a.readAt) &&
      (!a.snoozedUntil || Date.parse(a.snoozedUntil) <= now),
  );
  return (
    <div className="alerts-page">
      <header className="page-heading">
        <div>
          <span className="section-eyebrow">ANTICIPATE A LO IMPORTANTE</span>
          <h1>Un estudio que te avisa.</h1>
          <p>
            Recordatorios personales y alertas basadas en fechas, estados y
            fuentes de tus causas.
          </p>
        </div>
        <button className="button button-secondary" onClick={() => void push()}>
          <Bell size={16} />
          Activar avisos en este dispositivo
        </button>
      </header>
      <button className="text-button" onClick={() => void unpush()}>
        Desactivar avisos de este dispositivo
      </button>
      {error ? (
        <p className="agent-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="ocr-progress" role="status">
          {status}
        </p>
      ) : null}
      <div className="alerts-columns">
        <section className="panel">
          <div className="alerts-heading">
            <h2>
              <Bell size={19} />
              Centro de alertas
            </h2>
            <label>
              <input
                type="checkbox"
                checked={unread}
                onChange={(e) => setUnread(e.target.checked)}
              />
              Sólo pendientes
            </label>
          </div>
          {!visible.length ? (
            <div className="knowledge-empty">
              <Check size={30} />
              <h3>No hay alertas pendientes</h3>
              <p>
                Se revisan automáticamente cada cinco minutos. También podés
                crear un recordatorio personal.
              </p>
            </div>
          ) : (
            visible.map((a) => (
              <article
                className={`alert-item priority-${a.priority.toLowerCase()}`}
                key={a.id}
              >
                <span className="section-eyebrow">
                  {labels[a.kind] ?? "Recordatorio"} ·{" "}
                  {new Date(a.createdAt).toLocaleString("es-AR", {
                    timeZone: "America/Argentina/Buenos_Aires",
                  })}
                </span>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
                <div className="alert-actions">
                  {a.sourceUrl ? (
                    <a className="button button-secondary" href={a.sourceUrl}>
                      Abrir contexto
                    </a>
                  ) : null}
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      void alertAction(a.id, a.readAt ? "UNREAD" : "READ")
                    }
                  >
                    <Check size={14} />
                    {a.readAt ? "Marcar pendiente" : "Marcar vista"}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Posponer una hora"
                    title="Posponer una hora"
                    onClick={() => void alertAction(a.id, "SNOOZE")}
                  >
                    <Clock size={17} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
        <div>
          <section className="security-card">
            <h2>
              <CalendarClock size={20} />
              Programar un recordatorio
            </h2>
            <form action={create} className="reminder-form">
              <label>
                Qué querés recordar
                <input
                  name="title"
                  required
                  maxLength={200}
                  placeholder="Revisar el escrito antes de presentarlo"
                />
              </label>
              <label>
                Fecha y hora de tu dispositivo
                <input type="datetime-local" name="dueAt" required />
              </label>
              <label>
                Detalle
                <textarea name="body" maxLength={2000} />
              </label>
              <label>
                Causa
                <select name="caseId">
                  <option value="">Personal, sin causa</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-pair">
                <label>
                  Repetir
                  <select name="repeatFrequency">
                    <option value="NONE">Una sola vez</option>
                    <option value="DAILY">Todos los días</option>
                    <option value="WEEKLY">Cada semana</option>
                  </select>
                </label>
                <label>
                  Importancia
                  <select name="priority" defaultValue="MEDIUM">
                    <option value="LOW">Baja</option>
                    <option value="MEDIUM">Normal</option>
                    <option value="HIGH">Alta</option>
                    <option value="CRITICAL">Crítica</option>
                  </select>
                </label>
              </div>
              <button className="button button-primary" disabled={busy}>
                <Plus size={16} />
                {busy ? "Programando…" : "Crear recordatorio"}
              </button>
            </form>
          </section>
          <section className="security-card" style={{ marginTop: 20 }}>
            <h2>Próximos recordatorios</h2>
            {reminders
              .filter((r) => r.status === "ACTIVE")
              .map((r) => (
                <div className="reminder-row" key={r.id}>
                  <div>
                    <strong>{r.title}</strong>
                    <p>
                      {new Date(r.dueAt).toLocaleString("es-AR", {
                        timeZone: "America/Argentina/Buenos_Aires",
                      })}{" "}
                      ·{" "}
                      {r.repeatFrequency === "DAILY"
                        ? "Diario"
                        : r.repeatFrequency === "WEEKLY"
                          ? "Semanal"
                          : "Único"}
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Cancelar ${r.title}`}
                    onClick={() => void cancel(r.id)}
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            {!reminders.some((r) => r.status === "ACTIVE") ? (
              <p>No tenés recordatorios programados.</p>
            ) : null}
          </section>
        </div>
      </div>
      <details className="security-card" style={{ marginTop: 24 }}>
        <summary>
          <Settings2 size={18} />
          Personalizar alertas inteligentes
        </summary>
        <p>
          Vencimientos: anticipación de siete días, un día y dos horas; aviso al
          superar la fecha registrada. Los plazos posibles se identifican para
          revisión y no se confirman automáticamente.
        </p>
        <div className="access-members">
          {Object.entries(labels).map(([kind, label]) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={settings.enabledKinds.includes(kind)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    enabledKinds: e.target.checked
                      ? [...settings.enabledKinds, kind]
                      : settings.enabledKinds.filter((k) => k !== kind),
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className="form-pair">
          <label>
            Silencio desde
            <select
              value={settings.quietStart ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  quietStart:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Sin horario de silencio</option>
              {Array.from({ length: 24 }, (_, i) => (
                <option value={i} key={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          <label>
            Hasta
            <select
              value={settings.quietEnd ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  quietEnd:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Sin horario de silencio</option>
              {Array.from({ length: 24 }, (_, i) => (
                <option value={i} key={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          Horario de Buenos Aires. Los avisos se retoman al terminar el período
          de silencio, sin duplicar el mismo evento.
        </p>
        <button
          className="button button-primary"
          onClick={() => void saveSettings()}
        >
          Guardar preferencias
        </button>
      </details>
    </div>
  );
}
