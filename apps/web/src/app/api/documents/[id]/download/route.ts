import { api } from "@/lib/api/http";
import { downloadDocument } from "@/lib/api/special";

export const GET = api(downloadDocument);
