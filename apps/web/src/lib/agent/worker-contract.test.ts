import { beforeEach, describe, it, expect, vi } from "vitest";
import worker from "../../../../../services/ai-gateway/src/index";
const model = "@cf/qwen/qwen3-30b-a3b-fp8";
const env = {
  AI: {
    run: vi.fn(async () => ({
      response: "Fixture",
      usage: { prompt_tokens: 2, completion_tokens: 1 },
    })),
  },
  DOCUMENTS: {
    get: vi.fn(),
    head: vi.fn(),
    put: vi.fn(async () => ({ etag: "fixture" })),
  },
  SERVICE_KEY: "synthetic-only",
  ALERT_CRON_KEY: "synthetic-alert",
  ALERT_CRON_URL: "https://synthetic.invalid/alerts",
};
function chat(profile?: string, max = 600, key = "synthetic-only") {
  return new Request("https://synthetic.invalid/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(profile ? { "X-Legal-Profile": profile } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Fixture" }],
      max_tokens: max,
    }),
  });
}
beforeEach(() => vi.clearAllMocks());
describe("Worker trusted profiles and private artifact contract", () => {
  it("rejects unauthenticated calls before reading provider", async () => {
    expect(
      (await worker.fetch(chat("document", 600, "invalid"), env)).status,
    ).toBe(401);
    expect(env.AI.run).not.toHaveBeenCalled();
  });
  it.each([
    [undefined, 600],
    ["unknown", 600],
    ["classification", 129],
    ["document", 601],
    ["draft", 1201],
    ["brief", 0],
  ])("rejects profile %s / output %s", async (profile, max) => {
    expect(
      (
        await worker.fetch(
          chat(profile as string | undefined, max as number),
          env,
        )
      ).status,
    ).toBe(422);
    expect(env.AI.run).not.toHaveBeenCalled();
  });
  it.each([
    ["classification", 128],
    ["brief", 600],
    ["document", 600],
    ["extraction", 600],
    ["draft", 1200],
    ["research", 600],
  ])("accepts bounded %s", async (profile, max) => {
    expect(
      (await worker.fetch(chat(profile as string, max as number), env)).ok,
    ).toBe(true);
    expect(env.AI.run).toHaveBeenCalledWith(
      model,
      expect.objectContaining({ max_tokens: max, stream: false }),
    );
  });
  it("rejects derivative checksum mismatch without writing original namespace", async () => {
    const r = new Request(
      "https://synthetic.invalid/artifacts/10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/" +
        "a".repeat(64),
      {
        method: "PUT",
        headers: { Authorization: "Bearer synthetic-only" },
        body: "{}",
      },
    );
    expect((await worker.fetch(r, env)).status).toBe(422);
    expect(env.DOCUMENTS.put).not.toHaveBeenCalled();
  });
  it("persists authenticated immutable derivatives separately", async () => {
    const body = '[{"page":1,"text":"Synthetic"}]',
      hash = Buffer.from(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)),
      ).toString("hex");
    const r = new Request(
      "https://synthetic.invalid/artifacts/10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/" +
        hash,
      {
        method: "PUT",
        headers: { Authorization: "Bearer synthetic-only" },
        body,
      },
    );
    expect((await worker.fetch(r, env)).ok).toBe(true);
    expect(env.DOCUMENTS.put).toHaveBeenCalledWith(
      expect.stringMatching(/^derived\//),
      expect.any(ArrayBuffer),
      expect.objectContaining({ onlyIf: { etagDoesNotMatch: "*" } }),
    );
  });
});
