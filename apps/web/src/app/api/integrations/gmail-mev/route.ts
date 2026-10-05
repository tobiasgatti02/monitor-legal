import { apiContext, requireRoles } from "@/lib/api/context";
import { api, response } from "@/lib/api/http";
import { db } from "@/lib/db";

export const GET = api(async (request) => {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  const rows = await db().query(
    `select mailbox_email as "mailboxEmail",status,last_sync_at as "lastSyncAt",
            last_error_code as "lastErrorCode",granted_scope as "grantedScope"
       from public.gmail_mev_connections where tenant_id=$1`,
    [context.tenantId],
  );
  return response(rows[0] ?? { status: "DISCONNECTED" });
});
