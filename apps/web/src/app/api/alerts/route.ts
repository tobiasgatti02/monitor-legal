import { api } from "@/lib/api/http";
import { listAlerts, updateAlert } from "@/lib/api/special";

export const GET = api(listAlerts);
export const PATCH = api(updateAlert);
