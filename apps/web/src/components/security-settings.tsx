"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";
export function SecuritySettings() {
  const [enabled, setEnabled] = useState(false),
    [qr, setQr] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/auth/get-session")
      .then((r) => r.json())
      .then((v) => setEnabled(!!v?.user?.twoFactorEnabled));
  }, []);
  async function call(path: string, body: unknown) {
    const r = await fetch(`/api/auth/two-factor/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      v = await r.json();
    if (!r.ok)
      throw new Error(
        v.message ?? "No pudimos actualizar la seguridad de la cuenta.",
      );
    return v;
  }
  async function enable(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const v = await call("enable", { password: form.get("password") });
      const QR = await import("qrcode");
      setQr(await QR.toDataURL(v.totpURI));
      setCodes(v.backupCodes ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(form: FormData) {
    setBusy(true);
    try {
      await call("verify-totp", { code: form.get("code"), trustDevice: false });
      setEnabled(true);
      setQr("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <header className="page-heading">
        <div>
          <span className="section-eyebrow">TU CUENTA</span>
          <h1>Una capa más de protección.</h1>
          <p>
            Protegé el acceso al estudio con tu contraseña y un autenticador.
          </p>
        </div>
        <ShieldCheck size={28} />
      </header>
      <div className="security-grid">
        <section className="security-card">
          <h2>Verificación en dos pasos</h2>
          <p>
            {enabled
              ? "Tu cuenta tiene el segundo factor activado. Se pedirá un código al iniciar sesión."
              : "Activá un código temporal con una app como Google Authenticator, Microsoft Authenticator o un gestor de contraseñas."}
          </p>
          {!enabled && !qr ? (
            <form action={enable}>
              <label>
                Contraseña actual
                <input
                  name="password"
                  required
                  type="password"
                  autoComplete="current-password"
                  minLength={12}
                />
              </label>
              <button className="button button-primary" disabled={busy}>
                Configurar autenticador
              </button>
            </form>
          ) : null}
          {qr ? (
            <>
              <Image
                src={qr}
                width={200}
                height={200}
                alt="Código QR para configurar el autenticador"
                unoptimized
              />
              <form action={verify}>
                <label>
                  Código del autenticador
                  <input
                    name="code"
                    required
                    pattern="[0-9]{6}"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </label>
                <button className="button button-primary" disabled={busy}>
                  Confirmar activación
                </button>
              </form>
            </>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {codes.length ? (
            <>
              <p>
                Guardá estos códigos de recuperación en un lugar privado. Cada
                código se usa una vez.
              </p>
              <pre className="recovery-codes">{codes.join("\n")}</pre>
              <button
                className="button button-secondary"
                onClick={() => setCodes([])}
              >
                Ya los guardé
              </button>
            </>
          ) : null}
        </section>
        <section className="security-card">
          <h2>Tu información permanece privada</h2>
          <p>
            El acceso a expedientes y documentos se verifica en cada consulta.
            Las conversaciones son personales y las acciones del asistente
            necesitan tu aprobación.
          </p>
          <p>
            El estudio conserva documentos originales, referencias de página y
            un registro de las consultas y decisiones.
          </p>
          <a className="button button-secondary" href="/auditoria">
            Ver auditoría del estudio
          </a>
        </section>
      </div>
    </div>
  );
}
