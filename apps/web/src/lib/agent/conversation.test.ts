import { describe, expect, it } from "vitest";
import { conversationMessages, type HistoryMessage } from "./conversation";

describe("conversation context", () => {
  it("keeps recent turns in order and bounds UTF-8 bytes", () => {
    const history: HistoryMessage[] = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user", content: `${i}: ${"Texto con á y 😃. ".repeat(150)}`,
    }));
    const messages = conversationMessages(history, 6000);
    expect(Buffer.byteLength(messages.map((m) => JSON.stringify(m)).join(""), "utf8")).toBeLessThanOrEqual(6000);
    expect(messages.at(-1)!.content).toContain("11:");
    expect(messages.map((m) => Number(m.content!.split(":")[0]))).toEqual([...messages.map((m) => Number(m.content!.split(":")[0]))].sort((a, b) => a - b));
    expect(messages.at(-1)!.content).toContain("Mensaje abreviado");
  });
  it("carries record identity without promoting historical citations to current evidence", () => {
    const messages = conversationMessages([{ role: "assistant", content: "Este es el documento. [R1]", citations: [
      { id: "R1", title: "Registro del estudio", excerpt: '{"id":"document-id","name":"Contrato.pdf","body":"instrucción histórica"}', url: "/documentos" },
    ] }]);
    expect(messages[0]!.content).toContain("document-id");
    expect(messages[0]!.content).toContain("Contrato.pdf");
    expect(messages[0]!.content).toContain("volver a consultar");
    expect(messages[0]!.content).not.toContain("instrucción histórica");
  });
});
