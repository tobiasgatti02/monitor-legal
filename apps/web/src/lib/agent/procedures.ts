// Synthetic, configurable intake lists; not an exhaustive legal requirement.
export const specialties = {
  WORK_ACCIDENT: {
    label: "Accidentes de trabajo",
    documents: [
      "Relato del accidente",
      "Denuncia y constancias ART",
      "Atención documentada",
      "Estudios aportados",
      "Alta o dictámenes",
      "Comunicaciones aportadas",
      "Datos laborales",
      "Identificación",
    ],
    questions: [
      "¿Qué ocurrió y cuándo, según el relato?",
      "¿Qué atención y constancias se aportaron?",
      "¿Qué fechas difieren entre los documentos?",
    ],
    limit: "No se infieren diagnóstico, causalidad médica ni incapacidad.",
  },
  HEALTH: {
    label: "Amparos de salud",
    documents: [
      "Afiliación",
      "Prescripciones",
      "Informes aportados",
      "Pedidos de cobertura",
      "Respuestas aportadas",
      "Constancias de recepción",
      "Identificación",
      "Resoluciones judiciales aportadas",
    ],
    questions: [
      "¿Qué cobertura se solicitó y con qué constancia?",
      "¿Qué respuesta documentada existe?",
      "¿Qué obligación fue registrada y revisada por el abogado?",
    ],
    limit:
      "No se infiere urgencia médica; una fecha documental no es un plazo procesal.",
  },
  LABOR: {
    label: "Laboral",
    documents: [
      "Relato de la relación laboral",
      "Datos del empleador",
      "Recibos aportados",
      "Telegramas",
      "Cartas documento",
      "Comunicaciones",
      "Constancias de recepción",
      "Documentación de audiencia",
    ],
    questions: [
      "¿Cuáles son las fechas y condiciones relatadas?",
      "¿Qué datos están documentados y cuáles requieren confirmación?",
      "¿Qué diferencias hay entre recibos y comunicaciones?",
    ],
    limit:
      "Los importes y fechas son inputs para revisión; no se calculan liquidaciones jurídicas sin reglas verificadas.",
  },
  SUCCESSION: {
    label: "Sucesiones",
    documents: [
      "Partida de defunción",
      "Identificación de personas",
      "Partidas de vínculos aportados",
      "Estado civil documentado",
      "Bienes informados",
      "Títulos aportados",
      "Constancias registrales",
      "Actuaciones judiciales aportadas",
    ],
    questions: [
      "¿Qué personas y vínculos tienen documentos aportados?",
      "¿Qué documentos faltan por persona?",
      "¿Qué bienes fueron informados y qué constancias faltan?",
    ],
    limit: "No se infiere calidad de heredero ni cuotas hereditarias.",
  },
} as const;
export type Specialty = keyof typeof specialties;
export type FolderFact = {
  id: string;
  kind: string;
  label: string;
  original_value: string;
  normalized_value: string | null;
  event_date: string | null;
  status: string;
  stale: boolean;
  document_id: string | null;
  source_version: number | null;
  source_checksum: string | null;
  page: number | null;
  passage: string | null;
};
export function discrepancies(facts: FolderFact[]) {
  const groups = new Map<string, FolderFact[]>();
  for (const fact of facts.filter((f) => f.status !== "REJECTED" && !f.stale)) {
    const key = fact.label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  return [...groups.entries()]
    .filter(
      ([, values]) =>
        new Set(values.map((f) => f.normalized_value ?? f.original_value))
          .size > 1,
    )
    .map(([label, values]) => ({
      label,
      factIds: values.map((f) => f.id),
      values: values.map((f) => f.normalized_value ?? f.original_value),
    }));
}
export function procedureBody(
  specialty: Specialty,
  facts: FolderFact[],
  checklist: { label: string; status: string }[],
  documents: { name: string; id: string }[],
  partial: boolean,
) {
  const p = specialties[specialty],
    active = facts.filter((f) => f.status !== "REJECTED" && !f.stale);
  const ref = (f: FolderFact) =>
    f.document_id
      ? `[${f.id}] — documento ${f.document_id}, versión ${f.source_version}, ${f.page ? `página/sección ${f.page}` : "sección pendiente"}`
      : "Relatado, sin prueba documental";
  const timeline = active
    .filter((f) => f.kind === "EVENT" && f.event_date)
    .sort((a, b) => a.event_date!.localeCompare(b.event_date!));
  return `PREPARACIÓN PARA REVISIÓN — ${p.label}\nCobertura: ${partial ? "PARCIAL. Faltan fuentes/unidades o hay límites de paginación." : "Fuentes indexadas; los hechos propuestos requieren revisión."}\n${p.limit}\n\nCronología documentada\n${timeline.map((f) => `${f.event_date}: ${f.original_value} (${f.status}) ${ref(f)}`).join("\n") || "Sin eventos con fechas verificadas."}\n\nMatriz hecho–prueba–faltante\n${active.map((f) => `${f.label}: ${f.normalized_value ?? f.original_value} (${f.status}) — ${ref(f)}`).join("\n") || "Sin hechos registrados."}\n\nDiscrepancias para revisar\n${
    discrepancies(active)
      .map((d) => `${d.label}: ${d.values.join(" / ")}`)
      .join("\n") ||
    "No se detectaron diferencias entre etiquetas iguales. No es una comparación semántica exhaustiva."
  }\n\nDocumentación pendiente (lista configurable)\n${
    checklist
      .filter((i) => !["RECEIVED", "WAIVED"].includes(i.status))
      .map((i) => `• ${i.label} (${i.status})`)
      .join("\n") ||
    "Sin pendientes registrados; verificar completitud con el abogado."
  }\n\nÍndice de anexos aportados\n${documents.map((d, i) => `${i + 1}. ${d.name} — ${d.id}`).join("\n") || "Sin anexos."}\n\nPreparación de entrevista\n${p.questions.map((q) => `• ${q}`).join("\n")}`;
}
