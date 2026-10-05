import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ApiError } from "@/lib/api/errors";

export const gmailMevScope = "https://www.googleapis.com/auth/gmail.readonly";
export const gmailMevCookie = "gmail_mev_oauth";

type OAuthState = {
  nonce: string;
  verifier: string;
  tenantId: string;
  actorId: string;
  expectedEmail: string;
  expiresAt: number;
};

function tokenKey() {
  const encoded = process.env.GMAIL_TOKEN_KEY;
  const key = encoded ? Buffer.from(encoded, "base64") : Buffer.alloc(0);
  if (key.length !== 32)
    throw new ApiError(503, "GMAIL_NOT_CONFIGURED", "Falta configurar la clave de Gmail.");
  return key;
}

function clientCredentials() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const appUrl = process.env.BETTER_AUTH_URL;
  if (!clientId || !clientSecret || !appUrl)
    throw new ApiError(503, "GMAIL_NOT_CONFIGURED", "OAuth de Gmail todavía no está configurado.");
  const origin = new URL(appUrl);
  if (origin.protocol !== "https:" && origin.hostname !== "localhost")
    throw new ApiError(503, "GMAIL_INVALID_URL", "OAuth de Gmail requiere HTTPS.");
  return {
    clientId,
    clientSecret,
    redirectUri: new URL("/api/integrations/gmail-mev/callback", origin).toString(),
    secure: origin.protocol === "https:",
  };
}

function mac(value: string) {
  return createHmac("sha256", tokenKey()).update(`gmail-mev-state:${value}`).digest("base64url");
}

export function createGmailMevAuthorization(input: {
  tenantId: string;
  actorId: string;
  expectedEmail: string;
}) {
  const { clientId, redirectUri, secure } = clientCredentials();
  const state: OAuthState = {
    ...input,
    nonce: randomBytes(24).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    expiresAt: Date.now() + 10 * 60_000,
  };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const cookieValue = `${payload}.${mac(payload)}`;
  const challenge = createHash("sha256").update(state.verifier).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [name, value] of Object.entries({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: gmailMevScope,
    access_type: "offline",
    prompt: "consent",
    state: state.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    login_hint: state.expectedEmail,
  })) url.searchParams.set(name, value);
  const cookie = `${gmailMevCookie}=${cookieValue}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secure ? "; Secure" : ""}`;
  return { url: url.toString(), cookie };
}

export function readGmailMevState(cookieHeader: string | null, nonce: string) {
  const pair = cookieHeader?.split("; ").find((item) => item.startsWith(`${gmailMevCookie}=`));
  const value = pair?.slice(gmailMevCookie.length + 1);
  const [payload, signature] = value?.split(".") ?? [];
  if (!payload || !signature) throw new ApiError(400, "OAUTH_STATE_INVALID", "La autorización de Gmail venció.");
  const expected = Buffer.from(mac(payload));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided))
    throw new ApiError(400, "OAUTH_STATE_INVALID", "La autorización de Gmail no es válida.");
  let state: OAuthState;
  try {
    state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  } catch {
    throw new ApiError(400, "OAUTH_STATE_INVALID", "La autorización de Gmail no es válida.");
  }
  if (state.expiresAt < Date.now() || state.nonce !== nonce)
    throw new ApiError(400, "OAUTH_STATE_INVALID", "La autorización de Gmail venció.");
  return state;
}

export function clearGmailMevCookie() {
  return `${gmailMevCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${clientCredentials().secure ? "; Secure" : ""}`;
}

export function encryptGmailToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(Buffer.from("gmail-mev-refresh-v1"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((item) => item.toString("base64url")).join(".");
}

export function decryptGmailToken(sealed: string) {
  const [iv, tag, ciphertext] = sealed.split(".");
  if (!iv || !tag || !ciphertext) throw new ApiError(503, "GMAIL_TOKEN_INVALID", "La conexión Gmail debe renovarse.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from("gmail-mev-refresh-v1"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new ApiError(503, "GMAIL_TOKEN_INVALID", "La conexión Gmail debe renovarse.");
  }
}

type TokenResponse = { access_token?: string; refresh_token?: string; scope?: string; error?: string };

async function requestToken(values: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json()) as TokenResponse;
  if (!response.ok || !body.access_token)
    throw new ApiError(502, "GMAIL_TOKEN_FAILED", "Google no autorizó la conexión. Reintentá desde Integraciones.");
  return body;
}

export async function exchangeGmailCode(code: string, verifier: string) {
  const { clientId, clientSecret, redirectUri } = clientCredentials();
  return requestToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = clientCredentials();
  const token = await requestToken({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  return token.access_token!;
}

export async function gmailProfile(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ApiError(502, "GMAIL_PROFILE_FAILED", "No se pudo verificar la cuenta Gmail.");
  const body = (await response.json()) as { emailAddress?: string };
  if (!body.emailAddress) throw new ApiError(502, "GMAIL_PROFILE_FAILED", "Google no devolvió la dirección del buzón.");
  return body.emailAddress.toLowerCase();
}
