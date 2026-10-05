import { z } from "zod";

export const querySchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    threadId: z.string().uuid().optional(),
    caseId: z.string().uuid().optional(),
    mode: z.enum(["research", "draft", "operations"]).default("research"),
  })
  .strict();
export const actionSchema = z
  .object({
    action: z.enum([
      "CREATE_TASK",
      "CREATE_DEADLINE",
      "DRAFT_COMMUNICATION",
      "CREATE_REMINDER",
    ]),
    caseId: z
      .string()
      .uuid()
      .nullish()
      .transform((v) => v ?? undefined),
    title: z.string().min(1).max(200),
    body: z.string().max(6000).default(""),
    repeatFrequency: z.enum(["NONE", "DAILY", "WEEKLY"]).default("NONE"),
    dueAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (["CREATE_DEADLINE", "CREATE_REMINDER"].includes(v.action) && !v.dueAt)
      ctx.addIssue({ code: "custom", message: "Falta fecha propuesta" });
    if (["CREATE_DEADLINE", "DRAFT_COMMUNICATION"].includes(v.action) && !v.caseId)
      ctx.addIssue({ code: "custom", message: "Falta la causa" });
    if (
      v.action === "CREATE_REMINDER" &&
      v.dueAt &&
      Date.parse(v.dueAt) <= Date.now()
    )
      ctx.addIssue({
        code: "custom",
        message: "El recordatorio debe tener una fecha futura",
      });
  });
export type Citation = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  documentId?: string;
  chunkId?: string;
  sourceVersion?: number;
  sourceChecksum?: string;
  caseId?: string;
  clientId?: string;
  pageStart?: number;
  pageEnd?: number;
};
export type Chunk = {
  id: string;
  documentId: string;
  title: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  sourceVersion?: number;
  sourceChecksum?: string;
  score?: number;
};
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
export type ModelResult = {
  message: ModelMessage;
  usageOrigin?: "reported" | "estimated";
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
};
export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
