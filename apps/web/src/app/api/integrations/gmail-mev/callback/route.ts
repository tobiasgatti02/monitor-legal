import { apiContext, audit, requireRoles } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { api } from "@/lib/api/http";
import { db } from "@/lib/db";
import {
  clearGmailMevCookie,
  encryptGmailToken,
  exchangeGmailCode,
  gmailMevScope,
  gmailProfile,
  readGmailMevState,
} from "@/lib/agent/gmail-mev-oauth";

export const GET = api(async (request) => {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) throw new ApiError(400, "GMAIL_AUTH_REJECTED", "No se autorizó Gmail.");
  const code = url.searchParams.get("code");
  const nonce = url.searchParams.get("state");
  if (!code || !nonce) throw new ApiError(400, "GMAIL_AUTH_INVALID", "Google no devolvió la autorización.");
  const state = readGmailMevState(request.headers.get("cookie"), nonce);
  if (state.actorId !== context.actorId || state.tenantId !== context.tenantId)
    throw new ApiError(403, "GMAIL_AUTH_SESSION_MISMATCH", "La sesión cambió durante la autorización.");
  const token = await exchangeGmailCode(code, state.verifier);
  if (!token.refresh_token || !token.scope?.split(" ").includes(gmailMevScope))
    throw new ApiError(502, "GMAIL_SCOPE_MISSING", "Google no concedió lectura persistente del buzón.");
  const email = await gmailProfile(token.access_token!);
  if (email !== state.expectedEmail)
    throw new ApiError(403, "GMAIL_MAILBOX_MISMATCH", "Se eligió otra cuenta de Google. Conectá la casilla autorizada.");
  const encrypted = encryptGmailToken(token.refresh_token);
  await db().query(
    `with connector as (
       insert into public.connectors(tenant_id,source,account_label,status,created_by)
       values($1,'MEV_SCBA','Gmail MEV (avisos)','CONNECTED',$2)
       on conflict (tenant_id,source,account_label) do update
       set status='CONNECTED',updated_at=now(),last_error_code=null,last_error_message=null
       returning id
     )
     insert into public.gmail_mev_connections
       (tenant_id,connector_id,mailbox_email,refresh_token_encrypted,granted_scope,status,created_by)
     select $1,id,$3,$4,$5,'CONNECTED',$2 from connector
     on conflict (tenant_id) do update set
       connector_id=excluded.connector_id,mailbox_email=excluded.mailbox_email,
       refresh_token_encrypted=excluded.refresh_token_encrypted,
       granted_scope=excluded.granted_scope,status='CONNECTED',
       last_error_code=null,updated_at=now()`,
    [context.tenantId, context.actorId, email, encrypted, token.scope],
  );
  await audit(context, "GMAIL_MEV_CONNECTED", "connector", undefined, { mailbox: email, transport: "GMAIL_OAUTH" });
  const destination = new URL("/integraciones?gmail=connected", process.env.BETTER_AUTH_URL);
  const response = Response.redirect(destination, 302);
  response.headers.set("Set-Cookie", clearGmailMevCookie());
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});
