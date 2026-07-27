import { api } from "@/lib/api/http";
import { listEvents } from "@/lib/api/special";

export const GET = api(listEvents);
