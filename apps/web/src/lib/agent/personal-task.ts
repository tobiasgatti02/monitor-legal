// Only explicit, complete scheduling requests use this route. Other wording stays with the model.
export function personalTask(message: string, now = new Date()) {
  const match = message.trim().match(
    /^(?:¿\s*)?(?:(?:pod[eé]s|podr[ií]as|puedes)\s+)?(?:cre[aá](?:r)?(?:me)?|agreg[aá](?:r)?(?:me)?|anot[aá](?:r)?(?:me)?)\s+(?:una|la)\s+tarea(?:\s+de)?(?:\s+que\s+tengo\s+que)?\s+(.+?)\s+(?:para\s+)?(pasado\s+ma[ñn]ana|ma[ñn]ana|hoy)\s+a\s+las?\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?|horas)?\s*[?.!]?$/i,
  );
  if (!match) return null;
  const title = match[1]!.trim();
  const hour = Number(match[3]);
  const minute = Number(match[4] ?? 0);
  if (!title || title.length > 200 || hour > 23 || minute > 59) return null;
  const day = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const relative = match[2]!.toLowerCase();
  const offset = relative === "hoy" ? 0 : relative.startsWith("pasado") ? 2 : 1;
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return {
    action: "CREATE_TASK" as const,
    title: title[0]!.toUpperCase() + title.slice(1),
    dueAt: `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`,
  };
}
