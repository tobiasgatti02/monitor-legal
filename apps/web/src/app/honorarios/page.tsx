import { AppShell } from "@/components/app-shell";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { demoMode } from "@/lib/demo-mode";

export default function FeesPage() {
  const demo = demoMode();
  return (
    <AppShell>
      <div className="stacked-resources">
        <ResourceWorkspace
          title="Honorarios"
          description="Acuerdos económicos por causa. No reemplaza la contabilidad fiscal."
          endpoint="/api/fees"
          createLabel="Registrar acuerdo"
          demo={demo}
          columns={[
            { key: "caseId", label: "Causa" },
            { key: "agreementType", label: "Acuerdo" },
            { key: "agreedAmount", label: "Monto", kind: "money" },
            { key: "currency", label: "Moneda" },
            { key: "createdAt", label: "Registrado", kind: "date" },
          ]}
          fields={[
            { name: "caseId", label: "UUID de causa", required: true },
            { name: "agreementType", label: "Tipo de acuerdo", required: true },
            { name: "agreedAmount", label: "Monto pactado", type: "number", required: true },
            { name: "currency", label: "Moneda", defaultValue: "ARS" },
            { name: "notes", label: "Notas", type: "textarea" },
          ]}
          demoRows={[]}
        />
        <ResourceWorkspace
          title="Pagos"
          description="Cobros registrados contra un acuerdo de honorarios."
          endpoint="/api/payments"
          createLabel="Registrar pago"
          demo={demo}
          columns={[
            { key: "feeId", label: "Acuerdo" },
            { key: "amount", label: "Importe", kind: "money" },
            { key: "currency", label: "Moneda" },
            { key: "method", label: "Medio" },
            { key: "paidAt", label: "Fecha", kind: "date" },
          ]}
          fields={[
            { name: "feeId", label: "UUID del acuerdo", required: true },
            { name: "amount", label: "Importe", type: "number", required: true },
            { name: "currency", label: "Moneda", defaultValue: "ARS" },
            { name: "paidAt", label: "Fecha de pago", type: "datetime-local", required: true },
            { name: "method", label: "Medio de pago" },
            { name: "concept", label: "Concepto" },
          ]}
          demoRows={[]}
        />
      </div>
    </AppShell>
  );
}
