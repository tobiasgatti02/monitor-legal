import { apiContext, requireRoles } from "@/lib/api/context";
import { api, response } from "@/lib/api/http";
import { syncGmailMev } from "@/lib/agent/gmail-mev-sync";

export const maxDuration = 120;

export const POST = api(async (request) => {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  return response(await syncGmailMev(context));
});
