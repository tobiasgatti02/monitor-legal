import { AppShell } from "@/components/app-shell";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { demoMode } from "@/lib/demo-mode";

export default function CasesPage() {
  return (
    <AppShell>
      <ResourceWorkspace
        title="Causas"
        description="Expedientes, próxima acción y responsable en una sola lista."
        endpoint="/api/cases"
        createLabel="Nueva causa"
        demo={demoMode()}
        detailHref="/causas"
        columns={[
          { key: "title", label: "Carátula" },
          { key: "docketNumber", label: "Número" },
          { key: "court", label: "Organismo" },
          { key: "priority", label: "Prioridad", kind: "status" },
          { key: "status", label: "Estado", kind: "status" },
          { key: "nextAction", label: "Próxima acción" },
        ]}
        fields={[
          { name: "title", label: "Carátula", required: true },
          { name: "docketNumber", label: "Número de expediente" },
          { name: "jurisdiction", label: "Fuero / jurisdicción" },
          { name: "court", label: "Organismo" },
          { name: "venue", label: "Departamento judicial" },
          {
            name: "priority",
            label: "Prioridad",
            type: "select",
            defaultValue: "MEDIUM",
            options: [
              { label: "Baja", value: "LOW" },
              { label: "Media", value: "MEDIUM" },
              { label: "Alta", value: "HIGH" },
              { label: "Crítica", value: "CRITICAL" },
            ],
          },
          { name: "nextAction", label: "Próxima acción" },
          { name: "nextActionAt", label: "Fecha de próxima acción", type: "datetime-local" },
        ]}
        demoRows={[
          {
            id: "8a0f61e7-932b-4cb7-8436-e048352fdca5",
            title: "Pérez Ejemplo c/ Empresa Demo S.A.",
            docketNumber: "FCR 42/2026",
            court: "Juzgado Federal N.º 1",
            priority: "HIGH",
            status: "ACTIVE",
            nextAction: "Revisar traslado detectado",
          },
        ]}
      />
    </AppShell>
  );
}
