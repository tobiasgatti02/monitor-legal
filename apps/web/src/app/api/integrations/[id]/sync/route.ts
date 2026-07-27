import { api } from "@/lib/api/http";
import { enqueueIntegration } from "@/lib/api/special";

export const POST = api((request, route) => enqueueIntegration(request, route, "SYNC"));
