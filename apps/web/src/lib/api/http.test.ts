import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./http";

afterEach(() => vi.restoreAllMocks());

describe("API failure diagnostics", () => {
  it("logs SQLSTATE and request context without SQL, parameters or database details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("private database message"), {
      name: "NeonDbError",
      code: "42P01",
      detail: "private document text",
      query: "private SQL",
    });
    const response = await api(async () => { throw error; })(
      new Request("https://monitor.test/api/agent?secret=private", { method: "POST" }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: {
      code: "INTERNAL_ERROR", message: "No pudimos completar la operación.",
    } });
    expect(log).toHaveBeenCalledWith("API_UNHANDLED_ERROR", {
      name: "NeonDbError", databaseCode: "42P01", method: "POST", path: "/api/agent",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });

  it("does not log arbitrary content from the error code", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await api(async () => { throw { code: "private document text" }; })(
      new Request("https://monitor.test/api/agent"),
    );
    expect(log).toHaveBeenCalledWith("API_UNHANDLED_ERROR", {
      name: "UnknownError", databaseCode: undefined, method: "GET", path: "/api/agent",
    });
  });
});
