"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="full-state">
      <AlertTriangle size={30} />
      <h1>No pudimos cargar el dashboard</h1>
      <p>La información no fue modificada. Podés volver a intentar.</p>
      <button className="button button-primary" type="button" onClick={reset}>
        <RefreshCw size={16} />
        Reintentar
      </button>
    </main>
  );
}
