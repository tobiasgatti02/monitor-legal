import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { exportPdf } from "./pdf";
vi.mock("server-only", () => ({}));
import { parseDocument } from "./ingestion";

describe("generated PDF documents", () => {
  it("paginates Spanish text and preserves the beginning and end when read back", async () => {
    const body = Array.from({ length: 100 }, (_, i) => `Párrafo ${i + 1}: documentación y revisión de información del señor Pérez.`).join("\n");
    const bytes = await exportPdf("Historia del cliente", body);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    const pages = await parseDocument(bytes, "application/pdf", "fixture.pdf");
    const text = pages.map(p => p.text).join("\n");
    expect(text).toContain("BORRADOR PARA REVISIÓN");
    expect(text).toContain("Párrafo 1:");
    expect(text).toContain("Párrafo 100:");
  });
  it("does not silently drop characters unsupported by the font", async () => {
    await expect(exportPdf("Fixture", "文字")).rejects.toThrow();
  });
});
