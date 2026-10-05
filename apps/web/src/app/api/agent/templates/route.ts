import { apiContext } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { templates, saveTemplate, templateSchema } from "@/lib/agent/drafts";
export const GET = api(async (r) =>
  response(await templates(await apiContext(r))),
);
export const POST = api(async (r) =>
  response(
    await saveTemplate(await apiContext(r), await jsonBody(r, templateSchema)),
    { status: 201 },
  ),
);
