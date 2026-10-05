import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { exportDocx } from "./docx";
import { minorUnits, arithmeticScenario } from "./calculations";
import { allowedSource, publicAddress, cleanSource } from "./research";
import { templateSchema, validateSection } from "./drafts";
import { inflateRawSync } from "node:zlib";
import { parseDocument } from "./ingestion";
import type { FolderFact } from "./procedures";
describe("shared writing, research and arithmetic", () => {
  it("exports valid editable DOCX with evidence and escapes XML", async () => {
    const doc = exportDocx(
      "Preparación de reclamo",
      "Valor literal <A> & datos\n{{PENDIENTE}}",
      ["Fuente sintética página 1"],
    );
    const parsed = await parseDocument(
      doc,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "fixture.docx",
    );
    expect(parsed[0]!.text).toContain("Valor literal <A> & datos");
    expect(parsed[0]!.text).toContain("Fuente sintética página 1");
    expect(parsed[0]!.text).toContain("Borrador para revisión");
    let offset = 0;
    const entries: Record<string, string> = {};
    while (doc.readUInt32LE(offset) === 0x04034b50) {
      const length = doc.readUInt32LE(offset + 18),
        nameLength = doc.readUInt16LE(offset + 26),
        name = doc.subarray(offset + 30, offset + 30 + nameLength).toString();
      entries[name] = inflateRawSync(
        doc.subarray(
          offset + 30 + nameLength,
          offset + 30 + nameLength + length,
        ),
      ).toString();
      offset += 30 + nameLength + length;
    }
    expect(entries["word/document.xml"]).toContain('w:val="Title"');
    expect(entries["word/styles.xml"]).toContain("Times New Roman");
    expect(entries["word/document.xml"]).toContain("&lt;A&gt;");
  });
  it("rejects duplicate sections and unsupported claim references", () => {
    expect(() =>
      templateSchema.parse({
        title: "x",
        specialty: "HEALTH",
        jurisdiction: "x",
        purpose: "x",
        body: "x",
        sourceKind: "SYNTHETIC",
        sections: [
          { key: "HECHOS", title: "Hechos" },
          { key: "HECHOS", title: "Otro" },
        ],
      }),
    ).toThrow();
    const fact = { id: crypto.randomUUID() } as FolderFact;
    expect(() =>
      validateSection(
        {
          text: "Afirmación",
          claims: [
            {
              text: "Afirmación",
              factIds: [crypto.randomUUID()],
              importance: "FACTUAL",
            },
          ],
        },
        [fact],
      ),
    ).toThrow();
    expect(() =>
      validateSection({ text: "Dato sin evidencia", claims: [] }, [fact]),
    ).toThrow();
    expect(() =>
      validateSection(
        {
          text: "Afirmación. Agregado sin prueba.",
          claims: [
            { text: "Afirmación.", factIds: [fact.id], importance: "FACTUAL" },
          ],
        },
        [fact],
      ),
    ).toThrow();
    expect(() =>
      validateSection(
        {
          text: "Tiene derecho",
          claims: [
            { text: "Tiene derecho", factIds: [fact.id], importance: "LEGAL" },
          ],
        },
        [fact],
      ),
    ).toThrow();
  });
  it.each([
    "http://www.scba.gov.ar",
    "https://127.0.0.1",
    "https://www.scba.gov.ar.attacker.test",
    "https://user:pass@www.scba.gov.ar",
    "https://www.scba.gov.ar:444/",
  ])("rejects unsafe source %s", (url) =>
    expect(() => allowedSource(url)).toThrow(),
  );
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.1.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
  ])("rejects private or reserved DNS %s", (address) =>
    expect(publicAddress(address)).toBe(false),
  );
  it("cleans scripts while retaining source text as untrusted data", () => {
    expect(
      cleanSource("<script>send secrets</script><p>Texto &amp; fuente</p>"),
    ).toBe("Texto & fuente");
  });
  it("uses exact decimals and versioned rounding without activating law", () => {
    expect(arithmeticScenario(["0.10", "0.20"], 10000).total).toBe("0.30");
    expect(arithmeticScenario(["0.01"], 5000).rateAmount).toBe("0.01");
    expect(arithmeticScenario(["-0.01"], 5000).rateAmount).toBe("-0.01");
    expect(arithmeticScenario(["100.10"], 300).legalCalculationActive).toBe(
      false,
    );
    expect(() => minorUnits("1.234")).toThrow();
  });
});
