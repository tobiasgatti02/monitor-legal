import { api } from "@/lib/api/http";
import {
  deleteResource,
  getResource,
  updateResource,
} from "@/lib/api/resources";

export const GET = api((request, route) => getResource(request, route, "leads"));
export const PATCH = api((request, route) => updateResource(request, route, "leads"));
export const DELETE = api((request, route) => deleteResource(request, route, "leads"));
