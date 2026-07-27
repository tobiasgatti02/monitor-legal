import { api } from "@/lib/api/http";
import { convertLead } from "@/lib/api/special";

export const POST = api(convertLead);
