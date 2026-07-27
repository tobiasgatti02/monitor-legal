import { api } from "@/lib/api/http";
import { createResource, listResource } from "@/lib/api/resources";

export const GET = api((request) => listResource(request, "leads"));
export const POST = api((request) => createResource(request, "leads"));
