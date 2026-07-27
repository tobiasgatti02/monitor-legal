import { api } from "@/lib/api/http";
import { addTeamMember, listTeam } from "@/lib/api/special";

export const GET = api(listTeam);
export const POST = api(addTeamMember);
