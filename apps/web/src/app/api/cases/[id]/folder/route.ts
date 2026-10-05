import { z } from "zod";
import { apiContext } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { loadFolder, folderMutation, folderAction } from "@/lib/agent/folder";
export const GET = api(async (request, route) =>
  response(
    await loadFolder(
      await apiContext(request),
      z
        .string()
        .uuid()
        .parse((await route?.params)?.id),
    ),
  ),
);
export const POST = api(async (request, route) =>
  response(
    await folderMutation(
      await apiContext(request),
      z
        .string()
        .uuid()
        .parse((await route?.params)?.id),
      await jsonBody(request, folderAction),
    ),
  ),
);
