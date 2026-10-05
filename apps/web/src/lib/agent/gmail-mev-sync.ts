import "server-only";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { audit, type ApiContext } from "@/lib/api/context";
import { db } from "@/lib/db";
import { decryptGmailToken, gmailProfile, refreshGmailAccessToken } from "./gmail-mev-oauth";
import { parseGmailMevMessage, sameMevCourt, type GmailMessage } from "./gmail-mev-message";

type Connection = {
  connector_id: string;
  mailbox_email: string;
  refresh_token_encrypted: string;
  sync_fence: number;
};

async function gmailJson<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ApiError(502, "GMAIL_READ_FAILED", "No se pudieron leer los avisos de Gmail.");
  const raw = await response.text();
  if (raw.length > 400_000) throw new ApiError(502, "GMAIL_RESPONSE_TOO_LARGE", "Un aviso excede el límite de lectura.");
  return JSON.parse(raw) as T;
}

export async function syncGmailMev(c: ApiContext) {
  const connections = (await db().query(
    `update public.gmail_mev_connections
        set sync_lease_until=now()+interval '180 seconds',sync_fence=sync_fence+1
      where tenant_id=$1 and status in ('CONNECTED','DEGRADED')
        and (sync_lease_until is null or sync_lease_until<now())
      returning connector_id,mailbox_email,refresh_token_encrypted,sync_fence`,
    [c.tenantId],
  )) as Connection[];
  const connection = connections[0];
  if (!connection) {
    const existing = await db().query("select 1 from public.gmail_mev_connections where tenant_id=$1", [c.tenantId]);
    throw existing.length
      ? new ApiError(409, "GMAIL_SYNC_BUSY", "Ya hay una lectura Gmail en curso. Reintentá en unos minutos.")
      : new ApiError(404, "GMAIL_NOT_CONNECTED", "Conectá el buzón Gmail desde Integraciones.");
  }
  await db().query(
    "update public.connectors set last_attempt_at=now() where tenant_id=$1 and id=$2",
    [c.tenantId, connection.connector_id],
  );
  try {
    const accessToken = await refreshGmailAccessToken(decryptGmailToken(connection.refresh_token_encrypted));
    const email = await gmailProfile(accessToken);
    if (email !== connection.mailbox_email)
      throw new ApiError(502, "GMAIL_MAILBOX_MISMATCH", "La autorización de Google corresponde a otra casilla.");
    const ids: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 4; page++) {
      const params = new URLSearchParams({ q: "from:mev@scba.gov.ar newer_than:30d", maxResults: "50" });
      if (pageToken) params.set("pageToken", pageToken);
      const list = await gmailJson<{ messages?: { id: string }[]; nextPageToken?: string }>(
        `messages?${params}`,
        accessToken,
      );
      ids.push(...(list.messages ?? []).map((message) => message.id));
      pageToken = list.nextPageToken;
      if (!pageToken) break;
    }
    const result = { scanned: ids.length, imported: 0, duplicate: 0, unmatched: 0, unparsed: 0 };
    for (const id of ids) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) { result.unparsed++; continue; }
      const message = await gmailJson<GmailMessage>(`messages/${id}?format=full`, accessToken);
      const parsed = parseGmailMevMessage(message);
      if (!parsed) { result.unparsed++; continue; }
      const cases = (await db().query(
        `select id,court from public.cases
          where tenant_id=$1 and deleted_at is null and docket_number=$2 limit 2`,
        [c.tenantId, parsed.preview.caseNumber],
      )) as { id: string; court: string | null }[];
      if (cases.length !== 1 || !cases[0]?.court || !sameMevCourt(cases[0].court, parsed.preview.court)) {
        result.unmatched++;
        continue;
      }
      const checksum = createHash("sha256").update(parsed.text).digest("hex");
      const rows = await db().query(
        `insert into public.judicial_events
          (tenant_id,case_id,connector_id,source,event_type,source_event_id,
           source_date,title,original_text,normalized_text,content_hash,metadata,created_by)
         values($1,$2,$3,'MEV_SCBA','MOVEMENT',$4,$5,$6,$7,$7,$8,$9::jsonb,$10)
         on conflict do nothing returning id`,
        [
          c.tenantId,
          cases[0].id,
          connection.connector_id,
          id,
          parsed.preview.sourceDate,
          parsed.preview.title,
          parsed.text,
          checksum,
          JSON.stringify({
            transport: "GMAIL_OAUTH",
            mailbox: connection.mailbox_email,
            caseMatch: "EXACT_DOCKET_AND_COURT",
            senderAuthenticity: "UNVERIFIED",
            notice: "Aviso MEV recibido por Gmail. Movimiento referencial; no determina notificación formal ni inicio de plazo.",
          }),
          c.actorId,
        ],
      );
      if (rows.length) result.imported++;
      else result.duplicate++;
    }
    await db().query(
      `update public.gmail_mev_connections set status='CONNECTED',last_sync_at=now(),
         last_error_code=null,sync_lease_until=null,updated_at=now()
         where tenant_id=$1 and sync_fence=$2`,
      [c.tenantId, connection.sync_fence],
    );
    await db().query(
      `update public.connectors set status='CONNECTED',last_success_at=now(),
         last_error_code=null,last_error_message=null,updated_at=now()
         where tenant_id=$1 and id=$2 and exists (
           select 1 from public.gmail_mev_connections g
           where g.tenant_id=$1 and g.sync_fence=$3
         )`,
      [c.tenantId, connection.connector_id, connection.sync_fence],
    );
    await audit(c, "GMAIL_MEV_SYNC", "connector", connection.connector_id, result);
    return result;
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "GMAIL_SYNC_FAILED";
    await db().query(
      `update public.gmail_mev_connections set status='DEGRADED',last_error_code=$2,
         sync_lease_until=null,updated_at=now()
         where tenant_id=$1 and sync_fence=$3`,
      [c.tenantId, code, connection.sync_fence],
    );
    await db().query(
      `update public.connectors set status='DEGRADED',last_error_code=$3,
         last_error_message='Revisar autorización Gmail',updated_at=now()
         where tenant_id=$1 and id=$2 and exists (
           select 1 from public.gmail_mev_connections g
           where g.tenant_id=$1 and g.sync_fence=$4
         )`,
      [c.tenantId, connection.connector_id, code, connection.sync_fence],
    );
    throw error;
  }
}
