import { AppShell } from "@/components/app-shell";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { demoMode } from "@/lib/demo-mode";

export default function TasksPage() {
  return (
    <AppShell>
      <ResourceWorkspace
        title="Tareas y agenda"
        description="Trabajo pendiente, vencimientos internos y seguimientos."
        endpoint="/api/tasks"
        createLabel="Nueva tarea"
        demo={demoMode()}
        quickComplete
        columns={[
          { key: "title", label: "Tarea" },
          { key: "priority", label: "Prioridad", kind: "status" },
          { key: "status", label: "Estado", kind: "status" },
          { key: "dueAt", label: "Vence", kind: "date" },
          { key: "description", label: "Detalle" },
        ]}
        fields={[
          { name: "title", label: "Título", required: true },
          { name: "description", label: "Descripción", type: "textarea" },
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
          { name: "dueAt", label: "Fecha y hora", type: "datetime-local" },
          { name: "caseId", label: "UUID de causa (opcional)" },
          { name: "clientId", label: "UUID de cliente (opcional)" },
        ]}
        demoRows={[
          {
            id: "66cf9854-6f1c-442f-a975-6228f2cedc37",
            title: "Revisar cédula recibida",
            priority: "CRITICAL",
            status: "OPEN",
            dueAt: "2026-07-27T12:30:00-03:00",
            description: "Verificar si contiene un plazo procesal.",
          },
        ]}
      />
    </AppShell>
  );
}
