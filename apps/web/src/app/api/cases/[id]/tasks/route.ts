import { ApiError } from "@/lib/api/errors";
import { api } from "@/lib/api/http";
import { createResource, listResource } from "@/lib/api/resources";

export const GET = api(async (request, route) => {
  const caseId = (await route?.params)?.id;
  if (!caseId) throw new ApiError(400, "ID_REQUIRED", "Falta la causa.");
  return listResource(request, "tasks", { caseId });
});

export const POST = api(async (request, route) => {
  const caseId = (await route?.params)?.id;
  if (!caseId) throw new ApiError(400, "ID_REQUIRED", "Falta la causa.");
  return createResource(request, "tasks", { caseId });
});
