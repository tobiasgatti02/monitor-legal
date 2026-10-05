import { parseMevEmail, type MevEmailPreview } from "./mev-email";

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
};

export type GmailMessage = {
  id: string;
  sizeEstimate?: number;
  payload?: GmailPart;
};

function courtKey(value: string) {
  return value
    .toLowerCase()
    .replace(/¡/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function sameMevCourt(a: string, b: string) {
  return courtKey(a) === courtKey(b);
}

function header(part: GmailPart, name: string) {
  return part.headers?.find((item) => item.name.toLowerCase() === name)?.value ?? "";
}

function collect(part: GmailPart, mimeType: string): string[] {
  const own = part.mimeType?.toLowerCase() === mimeType && part.body?.data
    ? [Buffer.from(part.body.data, "base64url").toString("utf8")]
    : [];
  return [...own, ...(part.parts ?? []).flatMap((child) => collect(child, mimeType))];
}

function htmlAsText(html: string) {
  return html
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/(?:p|div|tr|table)\s*>/gi, "\n")
    .replace(/<\s*\/(?:td|th)\s*>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp|aacute|eacute|iacute|oacute|uacute|ntilde);/gi, (_, entity: string) => {
      const named: Record<string, string> = {
        amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
        aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
      };
      const lower = entity.toLowerCase();
      if (lower.startsWith("#")) {
        const point = lower.startsWith("#x")
          ? Number.parseInt(lower.slice(2), 16)
          : Number.parseInt(lower.slice(1), 10);
        return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
          ? String.fromCodePoint(point)
          : " ";
      }
      return named[lower] ?? " ";
    })
    .replace(/\u00a0/g, " ");
}

export function parseGmailMevMessage(message: GmailMessage):
  | { preview: MevEmailPreview; text: string; gmailMessageId: string }
  | null {
  if (!message.id || !message.payload || (message.sizeEstimate ?? 0) > 250_000) return null;
  const from = header(message.payload, "from");
  if (!/\bmev@scba\.gov\.ar\b/i.test(from)) return null;
  const subject = header(message.payload, "subject");
  const plain = collect(message.payload, "text/plain")[0];
  const html = collect(message.payload, "text/html")[0];
  const body = plain || (html ? htmlAsText(html) : "");
  if (!body || body.length > 29_000) return null;
  const text = `De: ${from}\nSubject: ${subject}\n\n${body}`;
  const preview = parseMevEmail(text);
  return preview ? { preview, text, gmailMessageId: message.id } : null;
}
