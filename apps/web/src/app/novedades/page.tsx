import { AppShell } from "@/components/app-shell";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { demoMode } from "@/lib/demo-mode";

export default function EventsPage() {
  return (
    <AppShell>
      <ResourceWorkspace
        title="Novedades"
        description="Evidencia judicial detectada por los conectores, sin ocultar su origen."
        endpoint="/api/events"
        createLabel=""
        fields={[]}
        demo={demoMode()}
        readOnly
        allowDelete={false}
        columns={[
          { key: "title", label: "Novedad" },
          { key: "caseTitle", label: "Causa" },
          { key: "source", label: "Fuente", kind: "status" },
          { key: "severity", label: "Prioridad", kind: "status" },
          { key: "reviewStatus", label: "Revisión", kind: "status" },
          { key: "detectedAt", label: "Detectado", kind: "date" },
        ]}
        demoRows={[
          {
            id: "6c9ae5b0-4e61-44d7-b462-73aedf7f155b",
            title: "Posible traslado detectado",
            caseTitle: "Pérez Ejemplo c/ Empresa Demo S.A.",
            source: "PJN",
            severity: "CRITICAL",
            reviewStatus: "UNREVIEWED",
            detectedAt: "2026-07-27T18:24:00-03:00",
          },
        ]}
      />
    </AppShell>
  );
}
