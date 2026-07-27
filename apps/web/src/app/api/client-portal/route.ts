import { api } from "@/lib/api/http";
import { clientPortal, createClientPortalAccess } from "@/lib/api/special";

export const GET = api(clientPortal);
export const POST = api(createClientPortalAccess);
