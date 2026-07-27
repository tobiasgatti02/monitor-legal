import { api } from "@/lib/api/http";
import { listAudit } from "@/lib/api/special";

export const GET = api(listAudit);
