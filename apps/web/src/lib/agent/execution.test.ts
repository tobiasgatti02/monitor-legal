import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ query: mocks.query }) }));
import { estimateNeurons, tokenBound, withBudget } from "./budgets";
import { ModelGateway } from "./gateway";
import { deterministicRoute } from "./intent";
import { validatedFacts } from "./extraction";
import { validatePages } from "./jobs";
import {
  procedureBody,
  discrepancies,
  specialties,
  type Specialty,
  type FolderFact,
} from "./procedures";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mocks.query.mockReset();
  mocks.query.mockResolvedValue([{ id: crypto.randomUUID() }]);
});
describe("budgets and provider accounting", () => {
  it("reserves before fetch and accounts absent usage conservatively", async () => {
    vi.stubEnv("LEGAL_AI_URL", "https://synthetic.invalid");
    vi.stubEnv("LEGAL_AI_KEY", "synthetic");
    const fetcher = vi.fn(async () => {
      expect(mocks.query.mock.calls[0]![0]).toContain("reserve_ai_attempt");
      return Response.json({
        choices: [{ message: { role: "assistant", content: "Fixture" } }],
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await withBudget(
      { workId: crypto.randomUUID(), profile: "brief", task: "test" },
      () => new ModelGateway().complete([{ role: "user", content: "fixture" }]),
    );
    expect(result.usageOrigin).toBe("estimated");
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBe(600);
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringContaining("settle_ai_attempt"),
      expect.arrayContaining([null, "SUCCEEDED"]),
    );
  });
  it("does not call provider when reservation fails", async () => {
    vi.stubEnv("LEGAL_AI_URL", "https://synthetic.invalid");
    vi.stubEnv("LEGAL_AI_KEY", "synthetic");
    mocks.query.mockRejectedValue(new Error("quota"));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      withBudget(
        { workId: crypto.randomUUID(), profile: "brief", task: "test" },
        () =>
          new ModelGateway().complete([{ role: "user", content: "fixture" }]),
      ),
    ).rejects.toMatchObject({ code: "AI_BUDGET_LIMIT" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("accounts both timeout and retry before a successful response", async () => {
    vi.stubEnv("LEGAL_AI_URL", "https://synthetic.invalid");
    vi.stubEnv("LEGAL_AI_KEY", "synthetic");
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { role: "assistant", content: "Fixture" } }],
          usage: { prompt_tokens: 20, completion_tokens: 5 },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    await withBudget(
      { workId: crypto.randomUUID(), profile: "document", task: "test" },
      () => new ModelGateway().complete([{ role: "user", content: "fixture" }]),
    );
    expect(
      mocks.query.mock.calls.filter(([sql]) =>
        sql.includes("reserve_ai_attempt"),
      ),
    ).toHaveLength(2);
    expect(
      mocks.query.mock.calls.filter(([sql]) =>
        sql.includes("settle_ai_attempt"),
      ),
    ).toHaveLength(2);
    expect(mocks.query.mock.calls[1]![1]).toContain("UNCERTAIN");
  });
  it("does not retry permanent failures", async () => {
    vi.stubEnv("LEGAL_AI_URL", "https://synthetic.invalid");
    vi.stubEnv("LEGAL_AI_KEY", "synthetic");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 422 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      withBudget(
        { workId: crypto.randomUUID(), profile: "document", task: "test" },
        () =>
          new ModelGateway().complete([{ role: "user", content: "fixture" }]),
      ),
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("uses model-specific official rates and byte bounds", () => {
    expect(
      estimateNeurons("@cf/qwen/qwen3-30b-a3b-fp8", 6000, 600),
    ).toBeCloseTo(46.035);
    expect(estimateNeurons("@cf/baai/bge-m3", 1000000)).toBe(1075);
    expect(tokenBound("á😃")).toBeGreaterThan(6);
    expect(() => estimateNeurons("unpriced", 1)).toThrow();
  });
  it.each([
    "no mostrame mis causas",
    "no crees una tarea",
    "resumilo",
    "sí",
    "hola, mostrame mis causas",
  ])("keeps %s out of deterministic actions", (text) => {
    expect(deterministicRoute(text).tool).toBeUndefined();
    expect(deterministicRoute(text).greeting).toBeUndefined();
  });
});
describe("passages and page coverage", () => {
  it("rejects fabricated sources and dates", () => {
    const raw = {
      facts: [
        {
          kind: "EVENT",
          label: "Atención",
          value: "atención",
          passage: "Hubo atención el 03/10/2026.",
          date: "2026-10-03",
        },
      ],
    };
    expect(validatedFacts(raw, "Hubo atención el 03/10/2026.")).toHaveLength(1);
    expect(() => validatedFacts(raw, "No hubo atención.")).toThrow();
    expect(() =>
      validatedFacts(
        { ...raw, facts: [{ ...raw.facts[0], date: "2026-10-04" }] },
        "Hubo atención el 03/10/2026.",
      ),
    ).toThrow();
  });
  it("rejects impossible calendar dates", () => {
    expect(() =>
      validatedFacts(
        {
          facts: [
            {
              kind: "EVENT",
              label: "Fecha",
              value: "31/02/2026",
              passage: "Fecha 31/02/2026",
              date: "2026-02-31",
            },
          ],
        },
        "Fecha 31/02/2026",
      ),
    ).toThrow();
  });
  it("rejects duplicate/missing OCR pages", () => {
    expect(() => validatePages([{ page: 2, text: "OCR" }])).toThrow();
    expect(() =>
      validatePages([
        { page: 1, text: "OCR" },
        { page: 1, text: "OCR" },
      ]),
    ).toThrow();
  });
  it("distinguishes discrepancy from a finding", () => {
    const base = {
      id: "a",
      kind: "FACT",
      label: "Fecha",
      original_value: "1",
      normalized_value: null,
      event_date: null,
      status: "EXTRACTED",
      stale: false,
      document_id: null,
      source_version: null,
      source_checksum: null,
      page: null,
      passage: null,
    };
    expect(
      discrepancies([base, { ...base, id: "b", original_value: "2" }]),
    ).toHaveLength(1);
    expect(
      discrepancies([
        base,
        { ...base, id: "b", original_value: "2", stale: true },
      ]),
    ).toHaveLength(0);
  });
});
// 32 synthetic functional procedure scenarios, eight per specialty. No model/legal-quality claims.
const scenarios = [
  "documented_event",
  "reported_person",
  "missing_evidence",
  "contradiction",
  "partial_ocr",
  "rejected_fact",
  "stale_source",
  "empty_folder",
];
for (const specialty of Object.keys(specialties) as Specialty[])
  describe(`synthetic ${specialty}`, () => {
    it.each(scenarios)(
      "%s preserves evidence status and professional limits",
      (scenario) => {
        const fact: FolderFact = {
          id: "fixture-fact",
          kind:
            scenario === "documented_event"
              ? "EVENT"
              : scenario === "reported_person"
                ? "PERSON"
                : "FACT",
          label: "Dato documentado",
          original_value: "Dato sintético literal",
          normalized_value: null,
          event_date: scenario === "documented_event" ? "2026-10-03" : null,
          status:
            scenario === "reported_person"
              ? "REPORTED"
              : scenario === "rejected_fact"
                ? "REJECTED"
                : "EXTRACTED",
          stale: scenario === "stale_source",
          document_id:
            scenario === "reported_person" || scenario === "missing_evidence"
              ? null
              : "fixture-document",
          source_version: 1,
          source_checksum: "fixture-checksum",
          page: 1,
          passage: "Dato sintético literal",
        };
        const facts =
          scenario === "empty_folder"
            ? []
            : scenario === "contradiction"
              ? [fact, { ...fact, id: "second", original_value: "Otro dato" }]
              : [fact];
        const body = procedureBody(
          specialty,
          facts,
          [{ label: "Constancia pendiente", status: "PENDING" }],
          [{ id: "fixture-document", name: "Anexo sintético" }],
          scenario === "partial_ocr",
        );
        expect(body).toContain(specialties[specialty].limit);
        expect(body).toContain("Constancia pendiente");
        expect(body).toContain("Anexo sintético");
        if (
          ["rejected_fact", "stale_source", "empty_folder"].includes(scenario)
        )
          expect(body).not.toContain(fact.original_value);
        else if (
          scenario === "reported_person" ||
          scenario === "missing_evidence"
        )
          expect(body).toContain("Relatado, sin prueba documental");
        else expect(body).toContain("versión 1");
        if (scenario === "contradiction") expect(body).toContain("Otro dato");
        if (scenario === "partial_ocr") expect(body).toContain("PARCIAL");
      },
    );
  });
