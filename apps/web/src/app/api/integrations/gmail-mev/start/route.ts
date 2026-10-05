import { z } from "zod";
import { apiContext, requireRoles } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { api } from "@/lib/api/http";
import { createGmailMevAuthorization } from "@/lib/agent/gmail-mev-oauth";

export const GET = api(async (request) => {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  const email = z.email().parse(new URL(request.url).searchParams.get("email") ?? "").toLowerCase();
  const allowedEmail = process.env.GMAIL_MEV_ALLOWED_MAILBOX?.trim().toLowerCase();
  if (!allowedEmail)
    throw new ApiError(503, "GMAIL_NOT_CONFIGURED", "Todavía no se configuró la casilla autorizada.");
  if (email !== allowedEmail)
    throw new ApiError(422, "GMAIL_MAILBOX_MISMATCH", "Esta casilla no está autorizada para la integración.");
  const { url, cookie } = createGmailMevAuthorization({
    tenantId: context.tenantId,
    actorId: context.actorId,
    expectedEmail: email,
  });
  const response = Response.redirect(url, 302);
  response.headers.set("Set-Cookie", cookie);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});
