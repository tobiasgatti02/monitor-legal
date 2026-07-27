import { AppShell } from "@/components/app-shell";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { demoMode } from "@/lib/demo-mode";

export default function ClientsPage() {
  return (
    <AppShell>
      <ResourceWorkspace
        title="Clientes"
        description="Contacto, estado de relación y próximo seguimiento."
        endpoint="/api/clients"
        createLabel="Nuevo cliente"
        demo={demoMode()}
        columns={[
          { key: "fullName", label: "Cliente" },
          { key: "whatsapp", label: "WhatsApp" },
          { key: "email", label: "Email" },
          { key: "locality", label: "Localidad" },
          { key: "status", label: "Estado", kind: "status" },
          { key: "nextContactAt", label: "Próximo contacto", kind: "date" },
        ]}
        fields={[
          { name: "fullName", label: "Nombre completo / razón social", required: true },
          {
            name: "kind",
            label: "Tipo",
            type: "select",
            defaultValue: "PERSON",
            options: [
              { label: "Persona", value: "PERSON" },
              { label: "Empresa", value: "COMPANY" },
            ],
          },
          { name: "documentId", label: "DNI / CUIT" },
          { name: "whatsapp", label: "WhatsApp" },
          { name: "email", label: "Email", type: "email" },
          { name: "phone", label: "Teléfono" },
          { name: "locality", label: "Localidad" },
          { name: "address", label: "Domicilio" },
          { name: "nextContactAt", label: "Próximo contacto", type: "datetime-local" },
          { name: "notes", label: "Notas", type: "textarea" },
        ]}
        demoRows={[
          {
            id: "0b88af26-b4f6-442f-bde8-2b68f5369fa8",
            fullName: "María Ejemplo",
            whatsapp: "5492915550101",
            email: "maria@example.com",
            locality: "Bahía Blanca",
            status: "ACTIVE",
            nextContactAt: "2026-07-28T14:00:00-03:00",
          },
        ]}
      />
    </AppShell>
  );
}
