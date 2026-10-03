"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function SetupForm() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const token =
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      const r = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: form.get("name"),
          username: form.get("username"),
          studio: form.get("studio"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error?.message);
      window.history.replaceState(null, "", "/setup");
      router.push("/auth/sign-in");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form action={submit} className="auth-form">
      <label>
        Tu nombre
        <input required name="name" autoComplete="name" defaultValue="Tobias" />
      </label>
      <label>
        Usuario administrador
        <input
          required
          name="username"
          defaultValue="tobias"
          autoComplete="username"
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9_]+"
        />
      </label>
      <label>
        Nombre del estudio
        <input required name="studio" defaultValue="Estudio Jurídico" />
      </label>
      <label>
        Correo administrador
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          defaultValue="tobiasgatti02@gmail.com"
        />
      </label>
      <label>
        Creá una contraseña
        <input
          required
          type="password"
          name="password"
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
      <button className="button button-primary auth-submit" disabled={busy}>
        {busy ? "Creando tu estudio…" : "Crear mi estudio privado"}
      </button>
      <p className="demo-hint">
        Este enlace se utiliza una sola vez. Después, el registro queda cerrado.
      </p>
    </form>
  );
}
