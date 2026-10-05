import "server-only";
import { createHash } from "node:crypto";
import type { ApiContext } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";

export async function parseDocument(
  content: Buffer,
  mime: string,
  name: string,
) {
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(content) });
    try {
      const result = await parser.getText();
      if (result.total > 200)
        throw new ApiError(
          422,
          "TOO_MANY_PAGES",
          "Dividí el PDF en archivos de hasta 200 páginas.",
        );
      return result.pages.map((p) => ({ page: p.num, text: p.text }));
    } finally {
      await parser.destroy();
    }
  }
  if (name.toLowerCase().endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: content });
    // DOCX has no stable physical pages: citation explicitly names a section.
    return [{ page: 1, text: result.value }];
  }
  if (
    ["text/plain", "text/markdown", "text/csv"].includes(mime) ||
    /\.(txt|md|csv)$/i.test(name)
  ) {
    return content
      .toString("utf8")
      .split("\f")
      .map((text, i) => ({ page: i + 1, text }));
  }
  throw new ApiError(
    415,
    "UNSUPPORTED_FORMAT",
    "Para indexar usá PDF, DOCX, TXT o Markdown. Otros formatos pueden almacenarse como adjuntos.",
  );
}

// Legacy imports now enqueue; parsing runs only in the durable Node executor.
export async function indexDocument(
  context: ApiContext,
  id: string,
  ocrPages?: { page: number; text: string }[],
) {
  const { enqueueDocument } = await import("./jobs");
  return enqueueDocument(context, id, ocrPages);
}
export function contentChecksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
