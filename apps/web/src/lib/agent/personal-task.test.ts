import { describe, expect, it } from "vitest";
import { personalTask } from "./personal-task";
import { actionSchema } from "./contracts";

describe("personal task scheduling", () => {
  const now = new Date("2026-10-05T01:00:00Z"); // Still October 4 in Argentina.
  it.each([
    "podes crearme una tarea de llamar a luis mañana a las 19hs?",
    "¿Podés crearme una tarea de llamar a luis mañana a las 19 hs?",
    "agrega la tarea de que tengo que llamar a luis mañana a las 19hs",
  ])("prepares %s without inventing a cause", (message) => {
    const task = personalTask(message, now);
    expect(task).toEqual({
      action: "CREATE_TASK", title: "Llamar a luis", dueAt: "2026-10-05T19:00:00-03:00",
    });
    expect(actionSchema.parse(task).caseId).toBeUndefined();
  });
  it("preserves minutes and advances the local calendar across the year boundary", () => {
    expect(personalTask("Creame una tarea de llamar a Luis pasado mañana a las 08:30", new Date("2027-01-01T01:00:00Z"))?.dueAt)
      .toBe("2027-01-02T08:30:00-03:00");
  });
  it.each([
    "no crees una tarea de llamar a Luis mañana a las 19hs",
    "podes crearme una tarea de llamar a Luis mañana a las 29hs?",
    "creame una tarea de llamar a Luis mañana a las 19:70",
    "creame una tarea de llamar a Luis mañana",
    "creame una tarea de llamar a Luis mañana a las 19 y enviá un email",
  ])("leaves incomplete or ambiguous requests to the normal flow: %s", (message) => {
    expect(personalTask(message, now)).toBeNull();
  });
  it.each(["CREATE_DEADLINE", "DRAFT_COMMUNICATION"])("still requires a cause for %s", (action) => {
    expect(actionSchema.safeParse({ action, title: "Test", dueAt: "2027-01-02T19:00:00-03:00" }).success).toBe(false);
  });
});
