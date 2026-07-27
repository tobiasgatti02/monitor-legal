import { AppShell } from "@/components/app-shell";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { demoMode } from "@/lib/demo-mode";

export default function DocumentsPage() {
  return (
    <AppShell>
      <ResourceWorkspace
        title="Documentos"
        description="Archivos pequeños almacenados en Neon, vinculables a clientes, causas y tareas."
        endpoint="/api/documents"
        createLabel="Subir documento"
        demo={demoMode()}
        columns={[
          { key: "name", label: "Nombre" },
          { key: "category", label: "Categoría", kind: "status" },
          { key: "mimeType", label: "Tipo" },
          { key: "sizeBytes", label: "Bytes" },
          { key: "createdAt", label: "Subido", kind: "date" },
        ]}
        fields={[
          { name: "name", label: "Nombre opcional" },
          { name: "contentBase64", label: "Archivo (máximo 5 MB)", type: "file", required: true },
          {
            name: "category",
            label: "Categoría",
            type: "select",
            defaultValue: "OTHER",
            options: [
              { label: "Demanda", value: "CLAIM" },
              { label: "Contestación", value: "ANSWER" },
              { label: "Cédula", value: "NOTICE" },
              { label: "Sentencia", value: "JUDGMENT" },
              { label: "Poder", value: "POWER_OF_ATTORNEY" },
              { label: "Documento del cliente", value: "CLIENT_DOCUMENT" },
              { label: "Otro", value: "OTHER" },
            ],
          },
          { name: "clientId", label: "UUID de cliente (opcional)" },
          { name: "caseId", label: "UUID de causa (opcional)" },
          { name: "taskId", label: "UUID de tarea (opcional)" },
        ]}
        demoRows={[
          {
            id: "966c4bf3-e674-4b21-9393-8c56d62c19db",
            name: "cedula-demo.pdf",
            category: "NOTICE",
            mimeType: "application/pdf",
            sizeBytes: 142800,
            createdAt: "2026-07-27T17:10:00-03:00",
          },
        ]}
      />
    </AppShell>
  );
}
