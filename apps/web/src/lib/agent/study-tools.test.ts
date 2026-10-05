import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), read: vi.fn(), list: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/resources", async (original) => ({
  ...await original<typeof import("@/lib/api/resources")>(),
  createResource: mocks.create, updateResource: mocks.update, getResource: mocks.read, listResource: mocks.list, deleteResource: mocks.remove,
}));
vi.mock("@/lib/api/context", () => ({ requireWrite: vi.fn(), requireRoles: vi.fn(), audit: mocks.audit }));
vi.mock("@/lib/db", () => ({ db: () => ({ query: vi.fn() }) }));
import { studyTools } from "./study-tools";
const c = { actorId: "fixture-owner", actorName: "Fixture", tenantId: crypto.randomUUID(), tenantName: "Synthetic", role: "OWNER" as const };
beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue(Response.json({ data: { id: crypto.randomUUID(), title: "Fixture" } })); });
const setup = (caseId?: string) => {
  const finish = vi.fn();
  const record = vi.fn(() => [{ citation: "R1" }]);
  return { tools: studyTools(c, caseId, record, finish), finish, record };
};
describe("study operations", () => {
  it("executes a personal task through the application's validated operation and actor context", async () => {
    const { tools, finish } = setup();
    await tools.createStudyRecord.execute({ module: "tasks", data: { title: "Llamar a Luis" } });
    const [request, module, , context] = mocks.create.mock.calls[0]!;
    expect(module).toBe("tasks");
    expect(context).toEqual(c);
    expect(await request.json()).toEqual({ title: "Llamar a Luis", responsibleUserId: c.actorId });
    expect(finish).toHaveBeenCalledWith("Creé el registro solicitado. «Fixture». [R1]");
  });
  it("does not report success when persistence fails", async () => {
    mocks.create.mockRejectedValueOnce(new Error("database unavailable"));
    const { tools, finish } = setup();
    await expect(tools.createStudyRecord.execute({ module: "clients", data: { fullName: "Fixture" } })).rejects.toThrow();
    expect(finish).not.toHaveBeenCalled();
  });
  it("rejects a different case before mutation", async () => {
    const { tools } = setup(crypto.randomUUID());
    await expect(tools.createStudyRecord.execute({ module: "tasks", data: { caseId: crypto.randomUUID(), title: "Fixture" } })).rejects.toMatchObject({ code: "SCOPE_MISMATCH" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps outbound communications as drafts", async () => {
    const { tools } = setup();
    await tools.createStudyRecord.execute({ module: "communications", data: { subject: "Fixture", status: "SENT" } });
    expect((await mocks.create.mock.calls[0]![0].json()).status).toBe("DRAFT");
  });
  it("requires reading the real record before changing it and respects locked case scope", async () => {
    mocks.read.mockResolvedValueOnce(Response.json({ data: { id: crypto.randomUUID(), caseId: crypto.randomUUID() } }));
    const { tools } = setup(crypto.randomUUID());
    await expect(tools.updateStudyRecord.execute({ module: "tasks", id: crypto.randomUUID(), data: { status: "DONE" } })).rejects.toMatchObject({ code: "SCOPE_MISMATCH" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
