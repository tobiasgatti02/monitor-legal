import { AppShell } from "@/components/app-shell";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { demoMode } from "@/lib/demo-mode";

export default function AuditPage() {
  return (
    <AppShell>
      <ResourceWorkspace
        title="Auditoría y salud"
        description="Acciones sensibles, ejecuciones y errores operativos."
        endpoint="/api/audit"
        createLabel=""
        fields={[]}
        demo={demoMode()}
        readOnly
        allowDelete={false}
        columns={[
          { key: "createdAt", label: "Fecha", kind: "date" },
          { key: "action", label: "Acción", kind: "status" },
          { key: "entityType", label: "Entidad" },
          { key: "entityId", label: "Identificador" },
          { key: "actorUserId", label: "Usuario" },
        ]}
        demoRows={[
          {
            id: "a71e898b-edb8-4a16-b62d-1beec7c550d2",
            createdAt: "2026-07-27T18:24:10-03:00",
            action: "PJN_SYNC_PERSISTED",
            entityType: "sync_run",
            entityId: "demo-sync",
            actorUserId: "Agustín Gatti",
          },
        ]}
      />
    </AppShell>
  );
}
