import "server-only";
import { ApiError } from "@/lib/api/errors";
import type { ModelMessage, ModelResult, ToolDefinition } from "./contracts";

type Provider = { name: string; url: string; token: string; model: string };
let cooldown = 0;
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
  ): Promise<ModelResult> {
    const available = providers();
    if (!available.length)
      throw new ApiError(
        503,
        "MODEL_NOT_CONFIGURED",
        "La IA todavía no está conectada. Podés consultar datos del estudio y buscar documentos.",
      );
    for (const provider of available) {
      if (
        provider.name === "cloudflare" &&
        cooldown > Date.now() &&
        available.length > 1
      )
        continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        let res: Response;
        try {
          res = await fetch(provider.url, {
            method: "POST",
            signal: AbortSignal.timeout(25000),
            headers: {
              Authorization: `Bearer ${provider.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: provider.model,
              messages,
              temperature: 0.1,
              max_tokens: 800,
              ...(tools.length ? { tools, tool_choice: toolChoice } : {}),
              stream: false,
            }),
          });
        } catch {
          break;
        }
        if (!res.ok) {
          if (res.status === 429 || res.status >= 500) {
            if (provider.name === "cloudflare") cooldown = Date.now() + 30000;
            if (attempt === 0 && res.status !== 429) continue;
          }
          break;
        }
        const json = await res.json();
        const message = json.choices?.[0]?.message;
        if (!message || (!message.content && !message.tool_calls?.length))
          break;
        return {
          message,
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
          model: provider.model,
          provider: provider.name,
        };
      }
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
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${privateGateway ? process.env.LEGAL_AI_KEY : process.env.CLOUDFLARE_AI_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("AI_AUXILIARY_UNAVAILABLE");
    const result = await res.json();
    if (!result.success) throw new Error("AI_AUXILIARY_UNAVAILABLE");
    return result.result as T;
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
      {
        query,
        contexts: chunks.map((c) => ({ text: c.content })),
        top_k: 8,
      },
    );
  }
}
export const gateway = new ModelGateway();
