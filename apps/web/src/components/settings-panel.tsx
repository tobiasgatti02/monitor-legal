"use client";

import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

type Settings = {
  name: string;
  cuit: string;
  locality: string;
  email: string;
  phone: string;
  whatsapp: string;
  emailEnabled: boolean;
  dashboardEnabled: boolean;
  morningDigest: boolean;
  eveningDigest: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

const demoSettings: Settings = {
  name: "Gatti Legales",
  cuit: "",
  locality: "Bahía Blanca",
  email: "gattilegales@example.com",
  phone: "",
  whatsapp: "",
  emailEnabled: true,
  dashboardEnabled: true,
  morningDigest: true,
  eveningDigest: false,
  quietHoursStart: "20:00",
  quietHoursEnd: "08:00",
};

export function SettingsPanel({ demo }: { demo: boolean }) {
  const [settings, setSettings] = useState<Settings>(demoSettings);
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    fetch("/api/settings")
      .then(async (result) => {
        const payload = (await result.json()) as {
          data?: Partial<Settings>;
          error?: { message?: string };
        };
        if (!result.ok) throw new Error(payload.error?.message ?? "No se pudo cargar.");
        setSettings((current) => ({ ...current, ...payload.data }));
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : "No se pudo cargar."),
      )
      .finally(() => setLoading(false));
  }, [demo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") ?? ""),
      cuit: String(data.get("cuit") ?? ""),
      locality: String(data.get("locality") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? ""),
      whatsapp: String(data.get("whatsapp") ?? ""),
      emailEnabled: data.get("emailEnabled") === "on",
      dashboardEnabled: data.get("dashboardEnabled") === "on",
      morningDigest: data.get("morningDigest") === "on",
      eveningDigest: data.get("eveningDigest") === "on",
      quietHoursStart: String(data.get("quietHoursStart") ?? ""),
      quietHoursEnd: String(data.get("quietHoursEnd") ?? ""),
    };
    try {
      if (!demo) {
        const result = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await result.json()) as { error?: { message?: string } };
        if (!result.ok) throw new Error(body.error?.message ?? "No se pudo guardar.");
      }
      setSettings(payload);
      setMessage(demo ? "Preferencias guardadas en modo demo." : "Preferencias guardadas.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="resource-empty">
        <LoaderCircle className="spin" size={22} /> Cargando configuración…
      </div>
    );
  }

  return (
    <div className="resource-page">
      <header className="resource-heading">
        <div>
          <p className="eyebrow">Administración</p>
          <h1>Configuración</h1>
          <p>Datos del estudio y preferencias personales de notificación.</p>
        </div>
        <span className="security-chip">
          <ShieldCheck size={16} /> Sin OAuth habilitado
        </span>
      </header>
      <form className="settings-grid" onSubmit={submit}>
        <section className="panel settings-card">
          <h2>Estudio</h2>
          <label>
            <span>Nombre</span>
            <input name="name" required defaultValue={settings.name} />
          </label>
          <label>
            <span>CUIT</span>
            <input name="cuit" defaultValue={settings.cuit} />
          </label>
          <label>
            <span>Localidad</span>
            <input name="locality" defaultValue={settings.locality} />
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" defaultValue={settings.email} />
          </label>
          <label>
            <span>Teléfono</span>
            <input name="phone" defaultValue={settings.phone} />
          </label>
          <label>
            <span>WhatsApp</span>
            <input name="whatsapp" defaultValue={settings.whatsapp} />
          </label>
        </section>
        <section className="panel settings-card">
          <h2>Notificaciones</h2>
          {[
            ["emailEnabled", "Email habilitado"],
            ["dashboardEnabled", "Alertas dentro del dashboard"],
            ["morningDigest", "Resumen matutino"],
            ["eveningDigest", "Resumen vespertino"],
          ].map(([name, label]) => (
            <label className="toggle-row" key={name}>
              <span>{label}</span>
              <input
                name={name}
                type="checkbox"
                defaultChecked={Boolean(settings[name as keyof Settings])}
              />
            </label>
          ))}
          <div className="two-fields">
            <label>
              <span>Silencio desde</span>
              <input name="quietHoursStart" type="time" defaultValue={settings.quietHoursStart} />
            </label>
            <label>
              <span>Hasta</span>
              <input name="quietHoursEnd" type="time" defaultValue={settings.quietHoursEnd} />
            </label>
          </div>
          <p className="legal-disclaimer">
            Los mensajes judiciales destinados a clientes siempre requieren aprobación.
          </p>
        </section>
        <div className="settings-actions">
          <button className="button button-primary" disabled={saving} type="submit">
            {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
            Guardar cambios
          </button>
          {message ? <span>{message}</span> : null}
        </div>
      </form>
    </div>
  );
}
