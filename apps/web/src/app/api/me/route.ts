import { apiContext } from "@/lib/api/context";
import { api,response } from "@/lib/api/http";
export const GET=api(async request=>response(await apiContext(request)));
