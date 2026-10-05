import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/lib/db";
import type { ApiContext } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";

export const profiles = {
  study: { input: 96000, output: 12800, calls: 8, tools: 12, perCall: 1600 },
  classification: {
    input: 1500,
    output: 128,
    calls: 1,
    tools: 0,
    perCall: 128,
  },
  brief: { input: 6000, output: 600, calls: 1, tools: 2, perCall: 600 },
  document: { input: 12000, output: 1200, calls: 2, tools: 4, perCall: 600 },
  extraction: { input: 8000, output: 1200, calls: 2, tools: 0, perCall: 600 },
  draft: { input: 48000, output: 6000, calls: 6, tools: 8, perCall: 1200 },
  research: { input: 24000, output: 2400, calls: 4, tools: 8, perCall: 600 },
  extraction_document: {
    input: 48000,
    output: 7200,
    calls: 12,
    tools: 0,
    perCall: 600,
  },
  ingestion: { input: 1000000, output: 0, calls: 0, tools: 0, perCall: 0 },
} as const;
export type Profile = keyof typeof profiles;
export const tariff = {
  version: "cf-2026-10-04",
  source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  usdPerNeuron: 0.000011,
};
export function estimateNeurons(model: string, input: number, output = 0) {
  const rates: Record<string, [number, number]> = {
    "@cf/qwen/qwen3-30b-a3b-fp8": [4625, 30475],
    "@cf/baai/bge-m3": [1075, 0],
    "@cf/baai/bge-reranker-base": [283, 0],
  };
  const rate = rates[model];
  if (!rate)
    throw new ApiError(
      422,
      "UNPRICED_MODEL",
      "El modelo requiere una tarifa verificada antes de activarse.",
    );
  return (input * rate[0] + output * rate[1]) / 1e6;
}
// Conservative byte bound for byte-level tokenizers, with framing/schema headroom.
// Not a token measurement; usage from the provider remains the source of actual tokens.
export function tokenBound(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8") + 256;
}
const scope = new AsyncLocalStorage<{
  workId: string;
  profile: Profile;
  task: string;
  beforeCall?: () => Promise<void>;
}>();
export function budgetScope() {
  return scope.getStore();
}
export function withBudget<T>(
  value: NonNullable<ReturnType<typeof budgetScope>>,
  run: () => T,
) {
  return scope.run(value, run);
}
export async function createWork(
  c: ApiContext,
  profile: Profile,
  caseId?: string,
  documentId?: string,
) {
  const rows = await db().query(
    "insert into ai_work(tenant_id,user_id,profile,case_id,document_id) values($1,$2,$3,$4,$5) returning id",
    [c.tenantId, c.actorId, profile, caseId ?? null, documentId ?? null],
  );
  return rows[0]!.id as string;
}
export async function reserveAttempt(
  model: string,
  payload: unknown,
  output: number,
  task?: string,
) {
  const current = budgetScope();
  if (!current)
    throw new ApiError(
      503,
      "AI_BUDGET_REQUIRED",
      "La llamada de IA requiere un trabajo con presupuesto.",
    );
  await current.beforeCall?.();
  const input = tokenBound(payload);
  estimateNeurons(model, input, output);
  if (input + output > 32768)
    throw new ApiError(
      422,
      "CONTEXT_LIMIT",
      "Reducí el contexto de la consulta.",
    );
  try {
    const rows = await db().query(
      "select app.reserve_ai_attempt($1,$2,'cloudflare',$3,'legal-2026-10-04',$4,$5,$6,$7) as id",
      [
        current.workId,
        task ?? current.task,
        model,
        tariff.version,
        tariff.source,
        input,
        output,
      ],
    );
    return { id: rows[0]!.id as string, input, output };
  } catch (error) {
    // Only accounting exceptions indicate a limit. Connection, schema and
    // permission failures must reach the API's normal error reporting.
    if (!(error instanceof Error)) throw error;
    switch (error.message) {
      case "DAILY_BUDGET_EXCEEDED":
        throw new ApiError(429, "AI_BUDGET_LIMIT",
          "Se alcanzó el límite diario de IA de la aplicación, del estudio o de tu usuario. El avance queda guardado.");
      case "WORK_BUDGET_EXCEEDED":
      case "CLASSIFICATION_BUDGET_EXCEEDED":
      case "DOCUMENT_BUDGET_EXCEEDED":
        throw new ApiError(429, "AI_WORK_BUDGET_LIMIT",
          "Este trabajo alcanzó su límite de llamadas o de contexto de IA. El avance queda guardado.");
      case "AI_CONCURRENCY_LIMIT":
      case "CASE_CONCURRENCY_LIMIT":
        throw new ApiError(429, "AI_CONCURRENCY_LIMIT",
          "Hay otra llamada de IA en curso. Esperá a que termine y volvé a intentar.");
      case "DOCUMENT_RESERVATION_EXPIRED":
        throw new ApiError(409, "DOCUMENT_RESERVATION_EXPIRED",
          "Venció la reserva de IA del documento. Continuá la extracción para iniciar otro segmento.");
      case "WORK_NOT_ACCESSIBLE":
        throw new ApiError(403, "WORK_NOT_ACCESSIBLE",
          "No tenés acceso a este trabajo de IA.");
      default:
        throw error;
    }
  }
}
export async function settleAttempt(
  id: string,
  started: number,
  state: "SUCCEEDED" | "FAILED" | "UNCERTAIN",
  usage?: Record<string, unknown>,
  error?: string,
) {
  const valid = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  const prompt = usage?.prompt_tokens_details as
    Record<string, unknown> | undefined;
  const completion = usage?.completion_tokens_details as
    Record<string, unknown> | undefined;
  await db().query("select app.settle_ai_attempt($1,$2,$3,$4,$5,$6,$7,$8)", [
    id,
    valid(usage?.prompt_tokens),
    valid(usage?.completion_tokens),
    valid(prompt?.cached_tokens),
    valid(completion?.reasoning_tokens),
    Date.now() - started,
    state,
    error ?? null,
  ]);
}
export async function consumeTool() {
  const current = budgetScope();
  if (!current) return; // Typed code-only commands have no AI work.
  const rows = await db().query("select app.use_ai_tool($1) as allowed", [
    current.workId,
  ]);
  if (!rows[0]?.allowed)
    throw new ApiError(
      422,
      "TOOL_BUDGET_LIMIT",
      "Se agotó el presupuesto de herramientas.",
    );
}
