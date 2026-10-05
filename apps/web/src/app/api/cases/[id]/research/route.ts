import { z } from "zod";
import { apiContext } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import {
  researchSources,
  saveResearchSource,
  sourceSchema,
} from "@/lib/agent/research";
export const GET = api(async (r, route) =>
  response(
    await researchSources(
      await apiContext(r),
      z
        .string()
        .uuid()
        .parse((await route?.params)?.id),
      new URL(r.url).searchParams.get("q")?.slice(0, 300) ?? "",
    ),
  ),
);
export const POST = api(async (r, route) =>
  response(
    await saveResearchSource(
      await apiContext(r),
      z
        .string()
        .uuid()
        .parse((await route?.params)?.id),
      await jsonBody(r, sourceSchema),
    ),
    { status: 201 },
  ),
);
