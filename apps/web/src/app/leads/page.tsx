import { AppShell } from "@/components/app-shell";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { demoMode } from "@/lib/demo-mode";

export default function LeadsPage() {
  return (
    <AppShell>
      <ResourceWorkspace
        title="Leads"
        description="Consultas nuevas y próximos contactos comerciales."
        endpoint="/api/leads"
        createLabel="Nuevo lead"
        demo={demoMode()}
        columns={[
          { key: "fullName", label: "Nombre" },
          { key: "consultationReason", label: "Consulta" },
          { key: "whatsapp", label: "WhatsApp" },
          { key: "urgency", label: "Urgencia", kind: "status" },
          { key: "status", label: "Etapa", kind: "status" },
          { key: "nextActionAt", label: "Próximo contacto", kind: "date" },
        ]}
        fields={[
          { name: "fullName", label: "Nombre", required: true },
          { name: "whatsapp", label: "WhatsApp" },
          { name: "email", label: "Email", type: "email" },
          { name: "consultationReason", label: "Motivo de consulta", type: "textarea", required: true },
          { name: "source", label: "Origen" },
          {
            name: "urgency",
            label: "Urgencia",
            type: "select",
            defaultValue: "MEDIUM",
            options: [
              { label: "Baja", value: "LOW" },
              { label: "Media", value: "MEDIUM" },
              { label: "Alta", value: "HIGH" },
              { label: "Crítica", value: "CRITICAL" },
            ],
          },
          { name: "counterparty", label: "Contraparte" },
          { name: "nextAction", label: "Próxima acción" },
          { name: "nextActionAt", label: "Fecha de seguimiento", type: "datetime-local" },
        ]}
        demoRows={[
          {
            id: "75bb0926-020d-4a96-92f7-e77ca806de21",
            fullName: "Sofía Prueba",
            consultationReason: "Consulta laboral",
            whatsapp: "5492915550199",
            urgency: "HIGH",
            status: "NEW",
            nextActionAt: "2026-07-27T16:00:00-03:00",
          },
        ]}
      />
    </AppShell>
  );
}
