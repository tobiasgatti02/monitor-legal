import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: () => ({ query: mocks.query }) }));
vi.mock("@/lib/api/context", () => ({ requireWrite: vi.fn() }));
vi.mock("./retrieval", () => ({ retrieve: vi.fn() }));

import { agentTools } from "./tools";

const context = {
  actorId: "user",
  actorName: "Tobi",
  tenantId: crypto.randomUUID(),
  tenantName: "Estudio",
  role: "OWNER" as const,
};
beforeEach(() => {
  mocks.query.mockReset().mockResolvedValue([]);
});

describe("empty study lookups", () => {
  it("stores a personal task proposal without a cause and does not execute the task", async () => {
    mocks.query.mockResolvedValue([{ id: crypto.randomUUID(), status: "PENDING" }]);
    const tools = agentTools(context, crypto.randomUUID());
    await tools.execute("proposeAction", JSON.stringify({
      action: "CREATE_TASK", title: "Llamar a Luis", dueAt: "2027-01-02T19:00:00-03:00",
    }));
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("insert into agent_approvals"),
      expect.arrayContaining([null, "CREATE_TASK"]),
    );
    expect(tools.proposal?.title).toBe("Llamar a Luis");
    expect(tools.sources[0]?.caseId).toBeUndefined();
  });
  it("provides evidence for an empty task list", async () => {
    const tools = agentTools(context, crypto.randomUUID());
    const rows = await tools.execute("getTasks", "{}");
    expect(rows).toEqual([
      {
        message:
          "No encontré tareas pendientes registradas para esta consulta.",
        citation: "R1",
      },
    ]);
    expect(tools.sources[0]?.url).toBe("/tareas");
    expect(tools.sources[0]?.excerpt).toContain("registradas");
  });

  it("does not equate missing recorded deadlines with no legal deadlines", async () => {
    const tools = agentTools(context, crypto.randomUUID());
    await tools.execute("getDeadlines", "{}");
    expect(tools.sources[0]?.excerpt).toContain(
      "Esto no confirma la ausencia de vencimientos legales",
    );
  });
});
