import { z } from "zod";
import { apiContext } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { draftMutation, draftSchema } from "@/lib/agent/drafts";
export const maxDuration = 120;
export const POST = api(async (r, route) =>
  response(
    await draftMutation(
      await apiContext(r),
      z
        .string()
        .uuid()
        .parse((await route?.params)?.id),
      await jsonBody(r, draftSchema),
    ),
    { status: 201 },
  ),
);
