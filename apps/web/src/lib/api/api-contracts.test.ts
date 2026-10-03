import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { paginationFrom } from "@/lib/api/pagination";
import {
  clientCreateSchema,
  communicationActionSchema,
  leadCreateSchema,
  taskUpdateSchema,
} from "@/lib/api/schemas";

describe("API contracts", () => {
  it("implements every endpoint family required by the MVP", () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const apiRoot = path.resolve(directory, "../../app/api");
    const routes = [
      "today/route.ts",
      "cases/route.ts",
      "cases/[id]/route.ts",
      "cases/[id]/events/route.ts",
      "cases/[id]/tasks/route.ts",
      "cases/[id]/communications/route.ts",
      "clients/route.ts",
      "clients/[id]/route.ts",
      "clients/[id]/contact/route.ts",
      "leads/route.ts",
      "leads/[id]/activities/route.ts",
      "tasks/route.ts",
      "deadlines/route.ts",
      "calendar/route.ts",
      "documents/route.ts",
      "fees/route.ts",
      "payments/route.ts",
      "integrations/route.ts",
      "integrations/[id]/test/route.ts",
      "integrations/[id]/sync/route.ts",
      "sync-runs/route.ts",
      "alerts/route.ts",
      "audit/route.ts",
      "client-portal/route.ts",
    ];
    for (const route of routes) {
      expect(fs.existsSync(path.join(apiRoot, route)), route).toBe(true);
    }
  });

  it("keeps OAuth disabled and public sign-up closed by default", () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const authSource = fs.readFileSync(
      path.resolve(directory, "../auth/server.ts"),
      "utf8",
    );
    expect(authSource).toContain("socialProviders: {}");
    expect(authSource).toContain('MONITOR_LEGAL_ALLOW_SIGN_UP !== "true"');
  });

  it("limits pagination and rejects invalid pages", () => {
    const request = new Request("https://monitor.test/api/cases?page=2&limit=1000");
    expect(paginationFrom(request)).toEqual({ page: 2, limit: 100, offset: 100 });
    expect(() =>
      paginationFrom(new Request("https://monitor.test/api/cases?page=-1")),
    ).toThrow("paginación");
  });

  it("requires at least one contact method for a lead", () => {
    const result = leadCreateSchema.safeParse({
      fullName: "Persona Ejemplo",
      consultationReason: "Consulta ficticia",
    });
    expect(result.success).toBe(false);
  });

  it("does not accept tenant identifiers from clients", () => {
    const client = clientCreateSchema.parse({
      tenantId: "c4ff8882-66b0-4872-bc0c-fb20c83b437e",
      fullName: "Persona Ejemplo",
    });
    expect(client).not.toHaveProperty("tenantId");
  });

  it("keeps communication approval as a separate action", () => {
    expect(communicationActionSchema.parse({ action: "APPROVE" })).toEqual({
      action: "APPROVE",
    });
    expect(taskUpdateSchema.parse({ status: "DONE" })).toEqual({ status: "DONE" });
  });
});
