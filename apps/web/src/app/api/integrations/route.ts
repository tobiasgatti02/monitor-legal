import { apiContext, requireRoles } from "@/lib/api/context";
import { api } from "@/lib/api/http";
import { createResource, listResource } from "@/lib/api/resources";

export const GET = api((request) => listResource(request, "integrations"));

export const POST = api(async (request) => {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  return createResource(request, "integrations");
});
