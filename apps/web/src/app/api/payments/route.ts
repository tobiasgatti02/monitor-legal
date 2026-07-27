import { api } from "@/lib/api/http";
import { createResource, listResource } from "@/lib/api/resources";

export const GET = api((request) => listResource(request, "payments"));
export const POST = api((request) => createResource(request, "payments"));
