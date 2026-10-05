"use client";
import { useEffect, useState } from "react";
export function AgentMetrics() {
  const [metrics, setMetrics] = useState<Record<string, number>>();
  useEffect(() => {
    void fetch("/api/agent/metrics")
      .then((r) => r.json())
      .then((v) => v.data && setMetrics(v.data));
  }, []);
  if (!metrics) return null;
  return (
    <div className="knowledge-summary">
      <div>
        <strong>{metrics.queries}</strong>
        <span>tus consultas en 7 días</span>
      </div>
      <div>
        <strong>{metrics.errors}</strong>
        <span>errores</span>
      </div>
      <div>
        <strong>{metrics.abstentions}</strong>
        <span>sin evidencia suficiente</span>
      </div>
      <div>
        <strong>
          {metrics.p95Ms ? `${(metrics.p95Ms / 1000).toFixed(1)} s` : "—"}
        </strong>
        <span>latencia P95</span>
      </div>
      <div>
        <strong>{Number(metrics.neurons ?? 0).toFixed(2)}</strong>
        <span>
          neurons estimados · {metrics.estimated ?? 0} intentos sin usage
        </span>
      </div>
      <div>
        <strong>USD {Number(metrics.usd ?? 0).toFixed(6)}</strong>
        <span>estimación marginal · {metrics.uncertain ?? 0} inciertos</span>
      </div>
    </div>
  );
}
