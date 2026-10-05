import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Citation } from "./contracts";
import { parseIntent } from "./intent";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  complete: vi.fn(),
  execute: vi.fn(),
  audit: vi.fn(),
  sources: [] as Citation[],
  clarification: undefined as string | undefined,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: () => ({ query: mocks.query }) }));
vi.mock("@/lib/api/context", () => ({ audit: mocks.audit }));
vi.mock("./gateway", () => ({
  gateway: { complete: mocks.complete },
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
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("select role,content") || sql.includes("select value"))
      return [];
    return [{ id: threadId, case_id: null, allowed: true }];
  });
  mocks.execute.mockResolvedValue([]);
});

describe("natural conversation and evidence policy", () => {
  it("clarifies ambiguous operations within the parent call budget", async () => {
    mocks.complete.mockResolvedValueOnce(result("GROUNDED"));
    const answer = await askAgent(context, {
      message: "¿Y con eso?",
      threadId,
      mode: "operations",
    });
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(answer.content).toContain("Precisá");
    expect(mocks.execute).not.toHaveBeenCalled();
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
});
