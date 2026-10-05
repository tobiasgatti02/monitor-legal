import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ query: mocks.query }) }));
import { agentTools } from "./tools";

const context = { actorId: "fixture", actorName: "Fixture", tenantId: crypto.randomUUID(), tenantName: "Fixture", role: "OWNER" as const };
beforeEach(() => { mocks.query.mockReset(); mocks.query.mockResolvedValue([]); });
describe("document selection tools", () => {
  it("selects the latest upload with an empty name search and a stable chronological order", async () => {
    const tools = agentTools(context, crypto.randomUUID());
    await tools.execute("listDocuments", '{"sort":"newest","limit":1}');
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("order by d.created_at desc,d.id desc limit $6 offset $7"),
      [context.tenantId, null, "", null, null, 1, 0]);
  });
  it("supports oldest, position and date filters independently of name search", async () => {
    const tools = agentTools(context, crypto.randomUUID());
    const value = await tools.execute("listDocuments", '{"sort":"oldest","limit":1,"offset":1,"uploadedFrom":"2026-10-04T00:00:00-03:00","uploadedBefore":"2026-10-05T00:00:00-03:00"}');
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("order by d.created_at asc,d.id asc"),
      [context.tenantId, null, "", "2026-10-04T00:00:00-03:00", "2026-10-05T00:00:00-03:00", 1, 1]);
    expect(value).toMatchObject({ returnedCount: 0, searchedField: "name", orderedBy: "uploadedAt" });
  });
  it("describes an empty name search accurately instead of claiming to search content", async () => {
    const tools = agentTools(context, crypto.randomUUID());
    await tools.execute("listDocuments", '{"search":"Acuerdo"}');
    expect(tools.sources[0]!.excerpt).toContain("No se buscó en su contenido");
    expect(tools.sources[0]!.excerpt).toContain("Acuerdo");
  });
  it("rejects an explicit request for another cause before querying", async () => {
    const tools = agentTools(context, crypto.randomUUID(), crypto.randomUUID());
    await expect(tools.execute("listDocuments", JSON.stringify({ caseId: crypto.randomUUID() }))).rejects.toMatchObject({ code: "SCOPE_MISMATCH" });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
