import { apiContext, requireRoles } from "@/lib/api/context";
import { api } from "@/lib/api/http";
import { getResource, updateResource } from "@/lib/api/resources";

export const GET = api((request, route) => getResource(request, route, "integrations"));

export const PATCH = api(async (request, route) => {
  const context = await apiContext(request);
  requireRoles(context, ["OWNER", "ADMIN"]);
  return updateResource(request, route, "integrations");
});
