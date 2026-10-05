import { apiContext, audit, requireRoles } from "@/lib/api/context";
import { api, response } from "@/lib/api/http";
import { db } from "@/lib/db";
import { decryptGmailToken } from "@/lib/agent/gmail-mev-oauth";

export const POST = api(async (request) => {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  const rows = (await db().query(
    "select connector_id,refresh_token_encrypted from public.gmail_mev_connections where tenant_id=$1",
    [context.tenantId],
  )) as { connector_id: string; refresh_token_encrypted: string }[];
  const connection = rows[0];
  if (!connection) return response({ disconnected: true, revokedAtGoogle: false });
  let revokedAtGoogle = false;
  try {
    const token = decryptGmailToken(connection.refresh_token_encrypted);
    const result = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    revokedAtGoogle = result.ok;
  } catch {
    // Local removal still blocks subsequent access. The owner can revoke in Google too.
  }
  await db().query("delete from public.gmail_mev_connections where tenant_id=$1", [context.tenantId]);
  await db().query(
    `update public.connectors set status='DISCONNECTED',updated_at=now()
       where tenant_id=$1 and id=$2`,
    [context.tenantId, connection.connector_id],
  );
  await audit(context, "GMAIL_MEV_DISCONNECTED", "connector", connection.connector_id, { revokedAtGoogle });
  return response({ disconnected: true, revokedAtGoogle });
});
