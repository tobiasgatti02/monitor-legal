"use client";
import { useEffect, useState } from "react";
export function TeamInvitations() {
  const [allowed, setAllowed] = useState(false),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/me")
      .then((r) => r.json())
      .then((v) => setAllowed(["OWNER", "ADMIN"].includes(v.data?.role)));
  }, []);
  async function invite(form: FormData) {
    setBusy(true);
    setError("");
    setUrl("");
    try {
      const r = await fetch("/api/team/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.get("email"),
            role: form.get("role"),
          }),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error?.message);
      setUrl(v.data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return null;
  return (
    <section className="security-card" style={{ marginBottom: 24 }}>
      <h2>Invitar al estudio</h2>
      <p>
        Creá un enlace privado para que cada persona elija su contraseña. Vence
        en siete días y se utiliza una sola vez.
      </p>
      <form action={invite} className="invitation-form">
        <label>
          Correo
          <input
            required
            type="email"
            name="email"
            placeholder="abogado@estudio.com"
          />
        </label>
        <label>
          Permiso
          <select name="role">
            <option value="LAWYER">Abogado</option>
            <option value="ASSISTANT">Asistente</option>
            <option value="READ_ONLY">Sólo lectura</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </label>
        <button className="button button-primary" disabled={busy}>
          {busy ? "Creando…" : "Crear invitación"}
        </button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {url ? (
        <div>
          <label>
            Enlace privado
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <button
            className="button button-secondary"
            onClick={() => void navigator.clipboard.writeText(url)}
          >
            Copiar enlace
          </button>
          <p>Compartilo personalmente con el destinatario.</p>
        </div>
      ) : null}
    </section>
  );
}
