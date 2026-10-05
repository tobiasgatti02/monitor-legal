export type MevEmailPreview = {
  declaredSender: string;
  court: string;
  caseNumber: string;
  caseTitle: string | null;
  description: string;
  status: string | null;
  sourceDate: string;
  localDate: string;
  title: string;
};

function linesFrom(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/\\\s*$/, "")
        .replace(/\*\*/g, "")
        .replace(/\|/g, " ")
        .replace(/^\s*>\s?/, "")
        .trim(),
    )
    .filter((line) => line && !/^[-\s]+$/.test(line));
}

function field(lines: string[], label: string) {
  const prefix = new RegExp(`^${label}\\s*:\\s*(.*)$`, "i");
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index]?.match(prefix);
    if (!match) continue;
    return (match[1]?.trim() || lines[index + 1] || "").trim();
  }
  return "";
}

function parseArgentineDate(value: string) {
  const match = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  if (!day || !month || !year || !hour || !minute) return null;
  const second = match[6] || "00";
  const y = Number(year), m = Number(month), d = Number(day);
  const h = Number(hour), min = Number(minute), s = Number(second);
  const checked = new Date(Date.UTC(y, m - 1, d, h, min, s));
  if (
    checked.getUTCFullYear() !== y ||
    checked.getUTCMonth() !== m - 1 ||
    checked.getUTCDate() !== d ||
    checked.getUTCHours() !== h ||
    checked.getUTCMinutes() !== min ||
    checked.getUTCSeconds() !== s
  ) return null;
  const localDate = `${year}-${month}-${day}T${hour.padStart(2, "0")}:${minute}`;
  return { localDate, sourceDate: `${localDate}:${second}-03:00` };
}

/** Extracts fields from text supplied by a user; it cannot authenticate the email. */
export function parseMevEmail(raw: string): MevEmailPreview | null {
  if (!raw || raw.length > 30000) return null;
  const lines = linesFrom(raw);
  const declaredSender = lines.find((line) =>
    /^(?:De|From)\s*:/i.test(line) && /\bmev@scba\.gov\.ar\b/i.test(line),
  );
  if (!declaredSender) return null;
  const court = field(lines, "Organismo");
  const caseNumber = field(lines, "Nro de causa");
  const caseTitle = field(lines, "Carátula") || null;
  const description = field(lines, "Descripción");
  const status = field(lines, "Estado") || null;
  const parsedDate = parseArgentineDate(field(lines, "Fecha"));
  if (!court || !/^\d{1,30}$/.test(caseNumber) || !description || !parsedDate) return null;
  return {
    declaredSender,
    court,
    caseNumber,
    caseTitle,
    description,
    status,
    ...parsedDate,
    title: `MEV · Causa ${caseNumber} · ${description}`.slice(0, 300),
  };
}
