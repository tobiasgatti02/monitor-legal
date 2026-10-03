import { describe, it, expect } from "vitest";
import { chunkPages, rrf, citedSources, stripThinking } from "./core";
import { actionSchema, querySchema, type Chunk } from "./contracts";
const hit = (id: string): Chunk => ({
  id,
  documentId: id,
  title: id,
  content: "dato",
  pageStart: 1,
  pageEnd: 1,
});
describe("grounded legal agent", () => {
  it("preserves original page boundaries even across overlapping chunks", () => {
    const chunks = chunkPages([
      { page: 1, text: "contrato ".repeat(500) },
      { page: 3, text: "sentencia ".repeat(500) },
    ]);
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.every((c) => c.pageStart === c.pageEnd)).toBe(true);
    expect(new Set(chunks.map((c) => c.pageStart))).toEqual(new Set([1, 3]));
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });
  it("never silently indexes blank scanned pages", () =>
    expect(chunkPages([{ page: 1, text: "   " }])).toEqual([]));
  it("rejects configurations that cannot advance", () =>
    expect(() => chunkPages([], 200, 200)).toThrow());
  it("fuses duplicate hits without giving duplicate evidence to the model", () => {
    const result = rrf([hit("a"), hit("b")], [hit("b"), hit("c")]);
    expect(result[0]?.id).toBe("b");
    expect(result).toHaveLength(3);
  });
  it("rejects invented citations", () =>
    expect(() =>
      citedSources("Afirmación [S99]", [
        { id: "S1", title: "doc", url: "/doc", excerpt: "texto" },
      ]),
    ).toThrow("INVALID_CITATION"));
  it("returns only actually cited sources and removes repeats", () =>
    expect(
      citedSources("[S1] [S1]", [
        { id: "S1", title: "a", url: "/a", excerpt: "" },
        { id: "S2", title: "b", url: "/b", excerpt: "" },
      ]),
    ).toHaveLength(1));
  it("does not expose reasoning blocks", () =>
    expect(stripThinking("<think>private</think>Respuesta")).toBe("Respuesta"));
  it("rejects arbitrary model tools, tenant overrides, and send intents", () => {
    expect(
      actionSchema.safeParse({
        action: "SEND_EMAIL",
        caseId: crypto.randomUUID(),
        title: "x",
      }).success,
    ).toBe(false);
    expect(
      querySchema.safeParse({ message: "hola", tenantId: crypto.randomUUID() })
        .success,
    ).toBe(false);
  });
  it("requires a proposed date for a deadline", () =>
    expect(
      actionSchema.safeParse({
        action: "CREATE_DEADLINE",
        caseId: crypto.randomUUID(),
        title: "x",
      }).success,
    ).toBe(false));
  it("keeps chat context and input bounded", () =>
    expect(querySchema.safeParse({ message: "x".repeat(4001) }).success).toBe(
      false,
    ));
});
