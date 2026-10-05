import type { FolderFact } from "./procedures";

export type LetterDocument = {
  id: string;
  name: string;
  status: string | null;
  extraction_status: string | null;
};

// A letter may be concise, but every source in the cause must be accounted for.
// This creates a factual draft; the demand and legal consequences belong to counsel.
export function buildLetterDraft(
  causeTitle: string,
  documents: LetterDocument[],
  facts: FolderFact[],
) {
  const confirmed = facts.filter(
    (fact) =>
      fact.status === "CONFIRMED" &&
      !fact.stale &&
      fact.document_id &&
      documents.some((doc) => doc.id === fact.document_id),
  );
  const pending = documents.filter(
    (doc) =>
      doc.status !== "READY" ||
      doc.extraction_status !== "COMPLETE" ||
      !confirmed.some((fact) => fact.document_id === doc.id),
  );
  const paragraphs = confirmed.map(
    (fact, index) =>
      `${index + 1}. ${fact.label}: ${fact.normalized_value ?? fact.original_value} [fuente ${index + 1}]`,
  );
  const body = [
    "BORRADOR DE CARTA DOCUMENTO — REVISIÓN DEL ABOGADO OBLIGATORIA",
    "Remitente: {{REMITENTE_Y_DOMICILIO}}",
    "Destinatario: {{DESTINATARIO_Y_DOMICILIO}}",
    `Referencia de trabajo: ${causeTitle}`,
    "",
    "Por la presente, dejo constancia de los siguientes hechos documentados, sujetos a cotejo final con sus originales:",
    ...paragraphs,
    "",
    "{{REQUERIMIENTO_CONCRETO_REVISADO_POR_EL_ABOGADO}}",
    "{{PLAZO_Y_APERCIBIMIENTO_REVISADOS_POR_EL_ABOGADO}}",
    "{{CIERRE_Y_FIRMA}}",
  ].join("\n");
  return {
    body,
    confirmed,
    pending,
    coverage: {
      totalDocuments: documents.length,
      documentsWithConfirmedFacts: new Set(
        confirmed.map((fact) => fact.document_id),
      ).size,
      pendingDocuments: pending.map((doc) => ({
        id: doc.id,
        name: doc.name,
        status: doc.status,
        extractionStatus: doc.extraction_status,
      })),
    },
  };
}
