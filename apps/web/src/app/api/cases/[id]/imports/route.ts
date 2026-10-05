import { z } from "zod";
import { apiContext } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { manualImport, importSchema } from "@/lib/agent/imports";
export const POST = api(async (r, route) =>
  response(
    await manualImport(
      await apiContext(r),
      z
        .string()
        .uuid()
        .parse((await route?.params)?.id),
      await jsonBody(r, importSchema),
    ),
    { status: 201 },
  ),
);
