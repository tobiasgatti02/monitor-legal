import { z } from "zod";
import { api, jsonBody, response } from "@/lib/api/http";
import { apiContext } from "@/lib/api/context";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
function allowedEndpoint(value: string) {
  const u = new URL(value);
  return (
    (u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      [
        "fcm.googleapis.com",
        "android.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(u.hostname)) ||
    (u.protocol === "https:" &&
      u.hostname.endsWith(".notify.windows.com") &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443"))
  );
}
const subscription = z
  .object({
    endpoint: z.url().max(2000).refine(allowedEndpoint),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z
          .string()
          .min(40)
          .max(300)
          .regex(/^[a-zA-Z0-9_-]+$/),
        auth: z
          .string()
          .min(16)
          .max(100)
          .regex(/^[a-zA-Z0-9_-]+$/),
      })
      .strict(),
  })
  .strict();
export const GET = api(async (request) => {
  await apiContext(request);
  return response({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
});
export const POST = api(async (request) => {
  const c = await apiContext(request),
    input = await jsonBody(request, subscription);
  if (!process.env.VAPID_PUBLIC_KEY)
    throw new ApiError(
      503,
      "PUSH_NOT_CONFIGURED",
      "Los avisos push no están conectados.",
    );
  await db().query(
    "insert into push_subscriptions(tenant_id,user_id,endpoint,subscription) values($1,$2,$3,$4::jsonb) on conflict(endpoint) do update set subscription=excluded.subscription",
    [c.tenantId, c.actorId, input.endpoint, JSON.stringify(input)],
  );
  return response({ enabled: true });
});
export const DELETE = api(async (request) => {
  const c = await apiContext(request),
    input = await jsonBody(
      request,
      z.object({ endpoint: z.string().max(2000) }).strict(),
    );
  await db().query(
    "delete from push_subscriptions where tenant_id=$1 and user_id=$2 and endpoint=$3",
    [c.tenantId, c.actorId, input.endpoint],
  );
  return response({ disabled: true });
});
