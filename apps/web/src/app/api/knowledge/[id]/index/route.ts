import { z } from "zod";
import { apiContext } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { idSchema } from "@/lib/api/schemas";
import { indexDocument } from "@/lib/agent/ingestion";
export const maxDuration = 120;
export const POST = api(async (request, route) => {
  const c = await apiContext(request),
    id = idSchema.parse((await route?.params)?.id);
  const input = await jsonBody(
    request,
    z
      .object({
        pages: z
          .array(
            z.object({
              page: z.number().int().min(1).max(200),
              text: z.string().max(50000),
            }),
          )
          .min(1)
          .max(200)
          .optional(),
      })
      .strict(),
  );
  return response(await indexDocument(c, id, input.pages));
});
