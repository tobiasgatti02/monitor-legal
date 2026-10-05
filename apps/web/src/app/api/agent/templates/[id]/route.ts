import { z } from "zod";
import { apiContext } from "@/lib/api/context";
import { api, response } from "@/lib/api/http";
import { approveTemplate } from "@/lib/agent/drafts";
export const POST = api(async (r, route) =>
  response(
    await approveTemplate(
      await apiContext(r),
      z
        .string()
        .uuid()
        .parse((await route?.params)?.id),
    ),
  ),
);
