import { api } from "@/lib/api/http";
import { createLeadActivity, leadActivities } from "@/lib/api/special";

export const GET = api(leadActivities);
export const POST = api(createLeadActivity);
