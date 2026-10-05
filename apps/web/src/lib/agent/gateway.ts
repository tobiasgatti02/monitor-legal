import "server-only";
import { ApiError } from "@/lib/api/errors";
import type { ModelMessage, ModelResult, ToolDefinition } from "./contracts";

import {
  budgetScope,
  profiles,
  tokenBound,
  reserveAttempt,
  settleAttempt,
  type Profile,
} from "./budgets";

type Provider = { name: string; url: string; token: string; model: string };

export function modelConfigured() {
  return providers().length > 0;
}
function providers(): Provider[] {
  const result: Provider[] = [];
  if (process.env.LEGAL_AI_URL && process.env.LEGAL_AI_KEY)
    result.push({
      name: "cloudflare",
      url: `${process.env.LEGAL_AI_URL}/chat/completions`,
      token: process.env.LEGAL_AI_KEY,
      model: process.env.LEGAL_MODEL ?? "@cf/qwen/qwen3-30b-a3b-fp8",
    });
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_TOKEN)
    result.push({
      name: "cloudflare",
      url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
      token: process.env.CLOUDFLARE_AI_TOKEN,
      model: process.env.LEGAL_MODEL ?? "@cf/qwen/qwen3-30b-a3b-fp8",
    });
  if (process.env.GROQ_API_KEY && process.env.GROQ_ZDR_CONFIRMED === "true")
    result.push({
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      token: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
    });
  if (process.env.LOCAL_MODEL_URL && process.env.LOCAL_MODEL_KEY)
    result.push({
      name: "local",
      url: `${process.env.LOCAL_MODEL_URL.replace(/\/$/, "")}/chat/completions`,
      token: process.env.LOCAL_MODEL_KEY,
      model: process.env.LOCAL_MODEL_NAME ?? "local",
    });
  return result;
}
export class ModelGateway {
  async complete(
    messages: ModelMessage[],
    tools: ToolDefinition[] = [],
    toolChoice: "auto" | "required" = "auto",
    override?: Profile,
  ): Promise<ModelResult> {
    const provider = providers()[0];
    if (!provider)
      throw new ApiError(
        503,
        "MODEL_NOT_CONFIGURED",
        "La IA todavía no está conectada. Tus datos siguen accesibles.",
      );
    if (provider.name !== "cloudflare")
      throw new ApiError(
        503,
        "UNPRICED_PROVIDER",
        "El proveedor necesita tarifas y evaluación antes de habilitarse.",
      );
    const profile = override ?? budgetScope()?.profile;
    if (!profile)
      throw new ApiError(
        503,
        "AI_BUDGET_REQUIRED",
        "Falta presupuesto de la llamada.",
      );
    const output = profiles[profile].perCall;
    if (!output)
      throw new ApiError(
        422,
        "INVALID_PROFILE",
        "Este perfil no permite generación.",
      );
    const payload = {
      model: provider.model,
      // Workers AI accepts tool calls, but requires string content in input messages.
      // OpenAI-style assistant tool-call responses can contain null content.
      messages: messages.map((message) => ({
        ...message,
        content: message.content ?? "",
      })),
      temperature: 0.1,
      max_tokens: output,
      ...(tools.length ? { tools, tool_choice: toolChoice } : {}),
      stream: false,
    };
    if (
      profile === "classification" &&
      tokenBound(payload) > profiles.classification.input
    )
      throw new ApiError(
        422,
        "CLASSIFICATION_INPUT_LIMIT",
        "Acotá la consulta para clasificarla sin omitir contexto.",
      );
    for (
      let attempt = 0;
      attempt < (profile === "classification" ? 1 : 2);
      attempt++
    ) {
      const reservation = await reserveAttempt(
        provider.model,
        payload,
        output,
        override ?? undefined,
      );
      const started = Date.now();
      let json: Record<string, unknown> | undefined;
      let state: "SUCCEEDED" | "FAILED" | "UNCERTAIN" = "UNCERTAIN";
      let errorCode = "NETWORK_OR_TIMEOUT",
        retry = false;
      try {
        const res = await fetch(provider.url, {
          method: "POST",
          signal: AbortSignal.timeout(25000),
          headers: {
            Authorization: `Bearer ${provider.token}`,
            "Content-Type": "application/json",
            "X-Legal-Profile": profile,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          state = "FAILED";
          errorCode = `HTTP_${res.status}`;
          retry = res.status === 429 || res.status >= 500;
        } else {
          json = await res.json();
          const choices = json?.choices as
            { message?: ModelMessage }[] | undefined;
          const message = choices?.[0]?.message;
          if (message && (message.content || message.tool_calls?.length)) {
            state = "SUCCEEDED";
            const usage = json?.usage as Record<string, unknown> | undefined;
            await settleAttempt(reservation.id, started, state, usage);
            const reported =
              typeof usage?.prompt_tokens === "number" &&
              typeof usage?.completion_tokens === "number";
            return {
              message,
              inputTokens: reported
                ? Number(usage!.prompt_tokens)
                : reservation.input,
              outputTokens: reported
                ? Number(usage!.completion_tokens)
                : reservation.output,
              usageOrigin: reported ? "reported" : "estimated",
              model: provider.model,
              provider: provider.name,
            };
          }
          state = "FAILED";
          errorCode = "INVALID_MODEL_RESPONSE";
        }
      } catch (error) {
        // Accounting failures are not retried as model/network failures.
        if (state === "SUCCEEDED") throw error;
        retry = true;
      }
      await settleAttempt(
        reservation.id,
        started,
        state,
        json?.usage as Record<string, unknown> | undefined,
        errorCode,
      );
      if (!retry || attempt) break;
      await new Promise((resolve) =>
        setTimeout(resolve, 200 + Math.random() * 300),
      );
    }
    throw new ApiError(
      503,
      "MODEL_UNAVAILABLE",
      "El proveedor de IA no está disponible. Tus documentos y datos siguen accesibles.",
    );
  }
  async cloudflare<T>(model: string, input: unknown): Promise<T> {
    const privateGateway = process.env.LEGAL_AI_URL && process.env.LEGAL_AI_KEY;
    if (
      !privateGateway &&
      (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_AI_TOKEN)
    )
      throw new Error("EMBEDDINGS_NOT_CONFIGURED");
    const url = privateGateway
      ? `${process.env.LEGAL_AI_URL}/run/${model}`
      : `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
    const reservation = await reserveAttempt(
      model,
      input,
      0,
      model.includes("reranker") ? "rerank" : "embedding",
    );
    const started = Date.now();
    let state: "SUCCEEDED" | "FAILED" | "UNCERTAIN" = "UNCERTAIN",
      usage: Record<string, unknown> | undefined;
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${privateGateway ? process.env.LEGAL_AI_KEY : process.env.CLOUDFLARE_AI_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        state = "FAILED";
        throw new Error("AI_AUXILIARY_UNAVAILABLE");
      }
      const result = await res.json();
      if (!result.success) {
        state = "FAILED";
        throw new Error("AI_AUXILIARY_UNAVAILABLE");
      }
      usage = result.result?.usage ?? result.usage;
      state = "SUCCEEDED";
      return result.result as T;
    } finally {
      await settleAttempt(
        reservation.id,
        started,
        state,
        usage,
        state === "SUCCEEDED" ? undefined : "AI_AUXILIARY_UNAVAILABLE",
      );
    }
  }
  async embed(text: string[]) {
    const result = await this.cloudflare<{ data: number[][] }>(
      "@cf/baai/bge-m3",
      { text },
    );
    if (
      result.data.length !== text.length ||
      result.data.some(
        (v) => v.length !== 1024 || v.some((x) => !Number.isFinite(x)),
      )
    )
      throw new Error("INVALID_EMBEDDING");
    return result.data;
  }
  async rerank(query: string, chunks: { content: string }[]) {
    return this.cloudflare<{ response: { id: number; score: number }[] }>(
      "@cf/baai/bge-reranker-base",
      { query, contexts: chunks.map((c) => ({ text: c.content })), top_k: 8 },
    );
  }
}
export const gateway = new ModelGateway();
