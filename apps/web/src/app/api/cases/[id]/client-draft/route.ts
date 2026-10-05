import { z } from "zod";
import { apiContext } from "@/lib/api/context";
import { api, response } from "@/lib/api/http";
import { proposeClientDraft } from "@/lib/agent/communication-drafts";
export const POST = api(async (r, route) =>
  response(
    await proposeClientDraft(
      await apiContext(r),
      z
        .string()
        .uuid()
        .parse((await route?.params)?.id),
    ),
    { status: 201 },
  ),
);
