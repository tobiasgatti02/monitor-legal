import { z } from "zod";
import { apiContext } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { idSchema } from "@/lib/api/schemas";
import { decideApproval } from "@/lib/agent/approvals";
export const POST = api(async (request, route) => {
  const c = await apiContext(request),
    id = idSchema.parse((await route?.params)?.id);
  const input = await jsonBody(
    request,
    z.object({ decision: z.enum(["APPROVE", "REJECT"]) }).strict(),
  );
  return response(await decideApproval(c, id, input.decision));
});
