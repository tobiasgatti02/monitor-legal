import { AppShell } from "@/components/app-shell";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { demoMode } from "@/lib/demo-mode";

export default function TeamPage() {
  return (
    <AppShell>
      <ResourceWorkspace
        title="Equipo"
        description="Miembros del estudio y permisos. El alta pública permanece desactivada."
        endpoint="/api/team"
        createLabel="Añadir miembro"
        demo={demoMode()}
        allowDelete={false}
        columns={[
          { key: "fullName", label: "Nombre" },
          { key: "email", label: "Email" },
          { key: "role", label: "Rol", kind: "status" },
          { key: "active", label: "Activo" },
          { key: "joinedAt", label: "Ingreso", kind: "date" },
        ]}
        fields={[
          { name: "email", label: "Email de una cuenta ya registrada", type: "email", required: true },
          {
            name: "role",
            label: "Rol",
            type: "select",
            required: true,
            defaultValue: "LAWYER",
            options: [
              { label: "Administrador", value: "ADMIN" },
              { label: "Abogado", value: "LAWYER" },
              { label: "Asistente", value: "ASSISTANT" },
              { label: "Sólo lectura", value: "READ_ONLY" },
            ],
          },
        ]}
        demoRows={[
          {
            id: "demo-user",
            fullName: "Agustín Gatti",
            email: "agustin@example.com",
            role: "OWNER",
            active: true,
            joinedAt: "2026-07-27T09:00:00-03:00",
          },
        ]}
      />
    </AppShell>
  );
}
