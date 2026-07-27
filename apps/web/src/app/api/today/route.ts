import { apiContext } from "@/lib/api/context";
import { api, response } from "@/lib/api/http";
import { getTodayDashboard } from "@/lib/today-data";

export const GET = api(async (request) => {
  const context = await apiContext(request);
  return response(await getTodayDashboard(context.actorId));
});
