import { api } from "@/lib/api/http";
import { getSettings, updateSettings } from "@/lib/api/special";

export const GET = api(getSettings);
export const PATCH = api(updateSettings);
