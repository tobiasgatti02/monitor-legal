import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createGmailMevAuthorization,
  decryptGmailToken,
  encryptGmailToken,
  readGmailMevState,
} from "./gmail-mev-oauth";

const previous = {
  GMAIL_TOKEN_KEY: process.env.GMAIL_TOKEN_KEY,
  GMAIL_OAUTH_CLIENT_ID: process.env.GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET: process.env.GMAIL_OAUTH_CLIENT_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
};

beforeEach(() => {
  process.env.GMAIL_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.GMAIL_OAUTH_CLIENT_ID = "synthetic-client";
  process.env.GMAIL_OAUTH_CLIENT_SECRET = "synthetic-secret";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
});
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Gmail MEV OAuth guards", () => {
  it("vincula estado, sesión y PKCE sin exponer secretos en el enlace", () => {
    const authorization = createGmailMevAuthorization({
      tenantId: "tenant-example",
      actorId: "actor-example",
      expectedEmail: "estudio@example.com",
    });
    const url = new URL(authorization.url);
    const state = readGmailMevState(authorization.cookie, url.searchParams.get("state")!);
    expect(state.expectedEmail).toBe("estudio@example.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.url).not.toContain("synthetic-secret");
    expect(() => readGmailMevState(authorization.cookie, "other-nonce")).toThrow();
  });

  it("cifra y autentica el token persistente", () => {
    const sealed = encryptGmailToken("synthetic-refresh-token");
    expect(sealed).not.toContain("synthetic-refresh-token");
    expect(decryptGmailToken(sealed)).toBe("synthetic-refresh-token");
    expect(() => decryptGmailToken(`${sealed}x`)).toThrow();
  });
});
