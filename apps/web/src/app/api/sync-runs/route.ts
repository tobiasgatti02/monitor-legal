import { api } from "@/lib/api/http";
import { listSyncRuns } from "@/lib/api/special";

export const GET = api(listSyncRuns);
