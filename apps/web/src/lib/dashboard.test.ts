import { describe, expect, it } from "vitest";

import { attentionScore, orderAttention, type AttentionItem } from "./dashboard";

const base: AttentionItem = {
  id: "base",
  type: "TASK",
  title: "Tarea",
  context: "Caso",
  source: "ESTUDIO",
  relativeTime: "hoy",
  reason: "Requiere acción",
  owner: "Abogada",
  priority: "MEDIUM",
  primaryAction: "Revisar",
};

describe("priorización de Hoy", () => {
  it("prioriza criticidad antes que tipo", () => {
    const criticalLead = { ...base, id: "lead", type: "LEAD" as const, priority: "CRITICAL" as const };
    const highDeadline = {
      ...base,
      id: "deadline",
      type: "DEADLINE" as const,
      priority: "HIGH" as const,
    };

    expect(attentionScore(criticalLead)).toBeGreaterThan(attentionScore(highDeadline));
    expect(orderAttention([highDeadline, criticalLead])[0]?.id).toBe("lead");
  });

  it("desempata por impacto operativo", () => {
    const deadline = { ...base, id: "deadline", type: "DEADLINE" as const };
    const task = { ...base, id: "task" };

    expect(orderAttention([task, deadline])[0]?.id).toBe("deadline");
  });
});
