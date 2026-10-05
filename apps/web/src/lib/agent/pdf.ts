import { PDFDocument, StandardFonts } from "pdf-lib";

export async function exportPdf(title: string, body: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  pdf.setTitle(title);
  pdf.setCreator("Monitor Legal");
  const width = 595.28, height = 841.89, margin = 56;
  let page = pdf.addPage([width, height]);
  let y = height - margin;
  const text = (value: string, size: number, heading = false) => {
    const face = heading ? bold : font;
    // Reject unsupported characters instead of silently dropping document content.
    face.encodeText(value.replace(/[\r\n\t]/g, " "));
    const lines: string[] = [];
    for (const paragraph of value.replace(/\r/g, "").split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (face.widthOfTextAtSize(candidate, size) <= width - margin * 2) line = candidate;
        else {
          if (line) lines.push(line);
          line = "";
          for (const char of word) {
            if (face.widthOfTextAtSize(line + char, size) > width - margin * 2) { lines.push(line); line = ""; }
            line += char;
          }
        }
      }
      lines.push(line);
    }
    for (const line of lines) {
      if (y < margin + size * 1.5) { page = pdf.addPage([width, height]); y = height - margin; }
      page.drawText(line, { x: margin, y, size, font: face });
      y -= size * 1.5;
    }
    y -= size;
  };
  text(title, 17, true);
  text("BORRADOR PARA REVISIÓN", 10, true);
  text(body, 12);
  for (const [i, p] of pdf.getPages().entries())
    p.drawText(`${i + 1} / ${pdf.getPageCount()}`, { x: width - margin - 45, y: 30, font, size: 9 });
  return Buffer.from(await pdf.save());
}
