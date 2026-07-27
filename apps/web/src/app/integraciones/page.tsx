import { AppShell } from "@/components/app-shell";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { demoMode } from "@/lib/demo-mode";

export default function IntegrationsPage() {
  return (
    <AppShell>
      <ResourceWorkspace
        title="Integraciones"
        description="Estado de conexiones judiciales. Los errores nunca se ocultan."
        endpoint="/api/integrations"
        createLabel="Nueva integración"
        demo={demoMode()}
        allowDelete={false}
        columns={[
          { key: "accountLabel", label: "Cuenta" },
          { key: "source", label: "Portal", kind: "status" },
          { key: "status", label: "Estado", kind: "status" },
          { key: "lastSuccessAt", label: "Último éxito", kind: "date" },
          { key: "lastErrorCode", label: "Último error" },
          { key: "schedule", label: "Frecuencia" },
        ]}
        fields={[
          {
            name: "source",
            label: "Portal",
            type: "select",
            required: true,
            options: [
              { label: "PJN", value: "PJN" },
              { label: "MEV SCBA", value: "MEV_SCBA" },
              { label: "SCBA Notificaciones", value: "SCBA_NOTIFICACIONES" },
            ],
          },
          { name: "accountLabel", label: "Nombre de la cuenta", required: true },
          { name: "schedule", label: "Cron", defaultValue: "0 * * * *" },
        ]}
        demoRows={[
          {
            id: "ec4ef143-6b7f-4e77-bd4e-76b82eb63309",
            accountLabel: "Gatti",
            source: "PJN",
            status: "CONNECTED",
            lastSuccessAt: "2026-07-27T18:24:00-03:00",
            lastErrorCode: null,
            schedule: "0 * * * *",
          },
          {
            id: "074f76c4-47f8-43ec-bc84-b2ce2b20e526",
            accountLabel: "Mazzarini",
            source: "PJN",
            status: "CONNECTED",
            lastSuccessAt: "2026-07-27T18:24:00-03:00",
            lastErrorCode: null,
            schedule: "0 * * * *",
          },
        ]}
      />
    </AppShell>
  );
}
