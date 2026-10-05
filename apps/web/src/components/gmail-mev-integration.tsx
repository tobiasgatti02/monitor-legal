"use client";
import { useEffect, useState } from "react";

type Connection = {
  mailboxEmail?: string;
  status: "CONNECTED" | "DEGRADED" | "DISCONNECTED";
  lastSyncAt?: string | null;
  lastErrorCode?: string | null;
};

export function GmailMevIntegration({ expectedEmail }: { expectedEmail: string }) {
  const [connection, setConnection] = useState<Connection>({ status: "DISCONNECTED" });
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch("/api/integrations/gmail-mev")
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json();
        if (body.data) {
          setConnection(body.data);
          setAvailable(true);
        }
      })
      .catch(() => setMessage("No se pudo consultar la conexión Gmail."));
  }, []);
  async function action(name: "sync" | "disconnect") {
    setBusy(true);
    setMessage("");
    try {
      const result = await fetch(`/api/integrations/gmail-mev/${name}`, { method: "POST" });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error?.message ?? "Falló la operación.");
      if (name === "disconnect") {
        setConnection({ status: "DISCONNECTED" });
        setMessage(body.data.revokedAtGoogle
          ? "Conexión revocada y eliminada."
          : "Conexión eliminada de la app. Revisá también los permisos de tu cuenta Google.");
      } else {
        const counts = body.data;
        setConnection((current) => ({ ...current, status: "CONNECTED", lastSyncAt: new Date().toISOString(), lastErrorCode: null }));
        setMessage(`Revisados ${counts.scanned} correos: ${counts.imported} incorporados, ${counts.duplicate} repetidos, ${counts.unmatched} sin causa coincidente y ${counts.unparsed} sin formato MEV reconocido.`);
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!available) return null;
  return (
    <section className="panel">
      <h2>Gmail · avisos MEV</h2>
      <p>
        Esta conexión lee mensajes del buzón autorizado para extraer avisos MEV.
        Google concede lectura del buzón completo; la app consulta sólo correos
        que coinciden con el remitente MEV. Un aviso sigue sujeto a revisión y
        no se considera notificación formal ni inicio de plazo.
      </p>
      <p role="status">
        Estado: {connection.status}
        {connection.mailboxEmail ? ` · ${connection.mailboxEmail}` : ""}
        {connection.lastSyncAt ? ` · Última lectura: ${new Date(connection.lastSyncAt).toLocaleString("es-AR")}` : ""}
        {connection.lastErrorCode ? ` · Error: ${connection.lastErrorCode}` : ""}
      </p>
      {message && <p role="status">{message}</p>}
      {connection.status === "DISCONNECTED" ? (
        expectedEmail ? (
          <a className="secondary-button" href={`/api/integrations/gmail-mev/start?email=${encodeURIComponent(expectedEmail)}`}>
            Conectar {expectedEmail} con Google
          </a>
        ) : <p>Falta configurar la casilla autorizada en el servidor.</p>
      ) : (
        <div className="actions">
          <button className="secondary-button" disabled={busy} onClick={() => void action("sync")}>
            Leer avisos ahora
          </button>
          <button className="secondary-button" disabled={busy} onClick={() => void action("disconnect")}>
            Desconectar Gmail
          </button>
        </div>
      )}
      <p>
        Sólo se asocian automáticamente avisos cuyo número de causa y tribunal
        coinciden exactamente con una causa del estudio. Los demás quedan en
        Gmail para su revisión y una nueva lectura.
      </p>
    </section>
  );
}
