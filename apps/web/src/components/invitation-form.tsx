"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function InvitationForm() {
  const router = useRouter(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const token = new URLSearchParams(location.hash.slice(1)).get("token");
      const r = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            name: form.get("name"),
            username: form.get("username"),
            password: form.get("password"),
          }),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error?.message);
      history.replaceState(null, "", "/invitacion");
      router.push("/auth/sign-in");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="auth-form" action={submit}>
      <label>
        Tu nombre
        <input name="name" required minLength={2} autoComplete="name" />
      </label>
      <label>
        Elegí tu usuario
        <input
          name="username"
          required
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9_]+"
          autoComplete="username"
        />
      </label>
      <label>
        Creá tu contraseña
        <input
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button button-primary" disabled={busy}>
        {busy ? "Creando cuenta…" : "Aceptar invitación"}
      </button>
    </form>
  );
}
