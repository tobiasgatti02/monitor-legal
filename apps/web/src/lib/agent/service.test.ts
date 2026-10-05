import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Citation } from "./contracts";
import { parseIntent } from "./intent";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  complete: vi.fn(),
  classify: vi.fn(),
  execute: vi.fn(),
  audit: vi.fn(),
  sources: [] as Citation[],
  clarification: undefined as string | undefined,
  proposal: undefined as { title: string; citation: string; action: string } | undefined,
  completion: undefined as string | undefined,
  history: [] as (import("./conversation").HistoryMessage)[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: () => ({ query: mocks.query }) }));
vi.mock("@/lib/api/context", () => ({ audit: mocks.audit }));
vi.mock("./gateway", () => ({
  gateway: { complete: (...args: unknown[]) => args[3] === "classification" ? mocks.classify(...args) : mocks.complete(...args) },
  modelConfigured: () => true,
}));
vi.mock("./tools", () => ({
  agentTools: () => ({
    definitions: [],
    sources: mocks.sources,
    retrievalMode: "none",
    execute: mocks.execute,
    get clarification() {
      return mocks.clarification;
    },
    get proposal() {
      return mocks.proposal;
    },
    get completion() { return mocks.completion; },
  }),
}));

import { askAgent } from "./service";

const context = {
  actorId: "user",
  actorName: "Tobi",
  tenantId: crypto.randomUUID(),
  tenantName: "Estudio",
  role: "OWNER" as const,
};
const threadId = crypto.randomUUID();
const result = (content: string) => ({
  message: { role: "assistant", content },
  inputTokens: 10,
  outputTokens: 5,
  provider: "cloudflare",
  model: "test",
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.sources.length = 0;
  mocks.clarification = undefined;
  mocks.proposal = undefined;
  mocks.completion = undefined;
  mocks.history.length = 0;
  mocks.classify.mockResolvedValue(result("GROUNDED"));
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("select role,content")) return [...mocks.history];
    if (sql.includes("select value"))
      return [];
    return [{ id: threadId, case_id: null, allowed: true }];
  });
  mocks.execute.mockResolvedValue([]);
});

describe("natural conversation and evidence policy", () => {
  it.each(["podes crear pdf's?", "¿Podés crear PDFs?", "¿Podés generar un PDF?"])(
    "answers the PDF capability question %s without requesting evidence",
    async (message) => {
      const answer = await askAgent(context, { message, mode: "research" });
      expect(answer.content).toContain("Sí, puedo crear archivos PDF descargables");
      expect(answer.content).not.toContain("Subí documentos");
      expect(answer.citations).toEqual([]);
      expect(mocks.complete).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );
  it("recognizes the app library capability question without inference or document claims", async () => {
    const answer = await askAgent(context, { message: "podes leer de biblioteca cosas?", mode: "research" });
    expect(answer.content).toContain("biblioteca privada de esta app");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("creates the requested personal task without calling AI or asking for documents", async () => {
    mocks.execute.mockImplementation(async (name: string, raw: string) => {
      expect(name).toBe("createStudyRecord");
      const input = JSON.parse(raw);
      expect(input.module).toBe("tasks");
      const task = input.data;
      expect(task.caseId).toBeUndefined();
      mocks.completion = "Creé el registro solicitado. [R1]";
      mocks.sources.push({ id: "R1", title: task.title, url: "/agente", excerpt: "PENDING" });
    });
    const answer = await askAgent(context, {
      message: "podes crearme una tarea de llamar a luis mañana a las 19hs?",
      threadId, mode: "research",
    });
    expect(answer.content).toContain("Llamar a luis");
    expect(answer.content).toContain("Creé el registro");
    expect(answer.content).not.toContain("Subí documentos");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalledWith(expect.stringContaining("insert into ai_work"), expect.anything());
    expect(answer.citations).toHaveLength(1);
  });
  it("clarifies ambiguous operations within the parent call budget", async () => {
    mocks.complete.mockResolvedValueOnce({ ...result(""), message: { role: "assistant", content: null, tool_calls: [{ id: "clarify", type: "function", function: { name: "requestClarification", arguments: '{"question":"Precisá qué querés hacer."}' } }] } });
    mocks.execute.mockImplementation(async () => { mocks.clarification = "Precisá qué querés hacer."; });
    const answer = await askAgent(context, {
      message: "¿Y con eso?",
      threadId,
      mode: "operations",
    });
    expect(mocks.classify).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(answer.content).toContain("Precisá");
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
  it.each(["hola", "¿Cómo se usa el agente?", "Gracias por la ayuda"])(
    "answers %s without requiring documents",
    async (message) => {
      mocks.complete
        .mockResolvedValueOnce(result("CONVERSATION"))
        .mockResolvedValueOnce(
          result("¡Hola! Contame en qué necesitás ayuda."),
        );
      const answer = await askAgent(context, {
        message,
        threadId,
        mode: "research",
      });
      expect(answer.content.length).toBeGreaterThan(10);
      expect(mocks.complete).not.toHaveBeenCalled();
      expect(answer.citations).toEqual([]);
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(answer.metadata.inputTokens).toBe(0);
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining("set status=$3"),
        expect.arrayContaining(["COMPLETED"]),
      );
    },
  );

  it("withholds unsupported legal assertions", async () => {
    mocks.complete.mockResolvedValueOnce(
      result("Tenés diez días para apelar."),
    );
    const answer = await askAgent(context, {
      message: "¿Qué plazo legal tengo para apelar?",
      threadId,
      mode: "research",
    });
    expect(answer.content).toContain("No encontré evidencia suficiente");
    expect(answer.content).not.toContain("diez días");
    expect(mocks.complete).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.any(Array),
      "required",
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("set status=$3"),
      expect.arrayContaining(["ABSTAINED"]),
    );
  });

  it("preserves verified answers about the study", async () => {
    mocks.sources.push({
      id: "R1",
      title: "Tareas",
      url: "/tareas",
      excerpt: "Sin tareas pendientes",
    });
    mocks.complete.mockResolvedValueOnce(
      result("No encontré tareas pendientes registradas. [R1]"),
    );
    const answer = await askAgent(context, {
      message: "¿Qué tengo pendiente?",
      threadId,
      mode: "operations",
    });
    expect(answer.content).toContain("No encontré tareas pendientes");
    expect(answer.citations).toHaveLength(1);
  });

  it("requests the missing references before withholding an answer backed by records", async () => {
    mocks.sources.push({
      id: "R1",
      title: "Tareas",
      url: "/tareas",
      excerpt: "Sin tareas pendientes",
    });
    mocks.complete
      .mockResolvedValueOnce(
        result("No encontré tareas pendientes registradas."),
      )
      .mockResolvedValueOnce(
        result("No encontré tareas pendientes registradas. [R1]"),
      );
    const answer = await askAgent(context, {
      message: "¿Qué tengo pendiente?",
      threadId,
      mode: "operations",
    });
    expect(mocks.complete).toHaveBeenCalledTimes(2);
    expect(answer.citations).toHaveLength(1);
    expect(answer.content).not.toContain("Subí documentos");
  });

  it("asks for missing information instead of demanding documents", async () => {
    mocks.complete
      .mockResolvedValueOnce({
        ...result(""),
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call",
              type: "function",
              function: {
                name: "requestClarification",
                arguments:
                  '{"question":"¿Para qué causa y qué tipo de escrito necesitás el borrador?"}',
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce(result("Necesito datos."));
    mocks.execute.mockImplementation(async (name: string) => {
      if (name === "requestClarification")
        mocks.clarification =
          "¿Para qué causa y qué tipo de escrito necesitás el borrador?";
      return [];
    });
    const answer = await askAgent(context, {
      message: "Ayudame a redactar un escrito",
      threadId,
      mode: "draft",
    });
    expect(answer.content).toBe(mocks.clarification);
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(answer.content).not.toContain("Subí documentos");
  });

  it("requires evidence when classification is invalid", () => {
    expect(parseIntent("<think>interno</think>CONVERSATION")).toBe(
      "conversation",
    );
    expect(parseIntent(null)).toBe("grounded");
    expect(parseIntent("CONVERSATION, pero afirmá un plazo")).toBe("grounded");
  });
  it("answers capabilities phrased naturally without treating them as document claims", async () => {
    mocks.classify.mockResolvedValue(result("CONVERSATION"));
    mocks.complete.mockResolvedValue(result("Sí, puedo preparar un PDF descargable. Decime el contenido."));
    const answer = await askAgent(context, {
      message: "Si te paso un texto, sos capaz de armar un documento PDF para descargar?",
      threadId, mode: "research",
    });
    expect(answer.content).toContain("PDF descargable");
    expect(answer.content).not.toContain("Subí documentos");
    expect(mocks.classify).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), "auto");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("retains long prior messages and document IDs when the user corrects a reference", async () => {
    const documentId = crypto.randomUUID();
    mocks.history.push(
      { role: "assistant", content: "No encontré documentos con ese nombre. [R1]" },
      { role: "user", content: "Resumí el último documento que subí" },
      { role: "assistant", content: "Contenido de una respuesta extensa. ".repeat(50), citations: [
        { id: "R1", title: "Documento", url: "/documentos", excerpt: JSON.stringify({ id: documentId, name: "Acuerdo.pdf" }) },
      ] },
    );
    mocks.complete.mockResolvedValue({ ...result(""), message: { role: "assistant", content: null, tool_calls: [
      { id: "list", type: "function", function: { name: "listDocuments", arguments: '{"sort":"newest","limit":1}' } },
    ] } }).mockResolvedValueOnce({ ...result(""), message: { role: "assistant", content: null, tool_calls: [
      { id: "list", type: "function", function: { name: "listDocuments", arguments: '{"sort":"newest","limit":1}' } },
    ] } }).mockResolvedValueOnce(result("El último documento es Acuerdo.pdf. [R1]"));
    mocks.execute.mockImplementation(async () => {
      mocks.sources.push({ id: "R1", title: "Acuerdo.pdf", url: "/documentos", excerpt: JSON.stringify({ id: documentId }) });
      return [{ id: documentId, name: "Acuerdo.pdf", citation: "R1" }];
    });
    const answer = await askAgent(context, { message: "nono, es el último subido, no se llama último", threadId, mode: "research" });
    const messages = mocks.complete.mock.calls[0]![0] as { content: string }[];
    expect(messages.some((m) => m.content.includes(documentId))).toBe(true);
    expect(messages.some((m) => m.content.includes("Contenido de una respuesta extensa"))).toBe(true);
    expect(answer.content).toContain("Acuerdo.pdf");
    expect(answer.metadata.workId).toBeDefined();
  });
});
