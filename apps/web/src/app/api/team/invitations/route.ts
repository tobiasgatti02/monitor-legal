import {createHash,randomBytes} from "node:crypto";
import {z} from "zod";
import {api,jsonBody,response} from "@/lib/api/http";
import {apiContext,requireRoles,audit} from "@/lib/api/context";
import {db} from "@/lib/db";
export const POST=api(async request=>{
 const c=await apiContext(request);requireRoles(c,["OWNER","ADMIN"]);
 const input=await jsonBody(request,z.object({email:z.email().max(254).transform(s=>s.toLowerCase()),role:z.enum(["ADMIN","LAWYER","ASSISTANT","READ_ONLY"])}).strict());
 const token=randomBytes(32).toString("hex"),hash=createHash("sha256").update(token).digest("hex");
 const rows=await db().query("insert into team_invitations(tenant_id,email,role_code,token_hash,created_by) values($1,$2,$3,$4,$5) returning id,expires_at",[c.tenantId,input.email,input.role,hash,c.actorId]);
 await audit(c,"TEAM_INVITATION_CREATED","team-invitation",rows[0]!.id,{role:input.role});
 return response({id:rows[0]!.id,expiresAt:rows[0]!.expires_at,url:`${process.env.BETTER_AUTH_URL}/invitacion#token=${token}`},{status:201});
});
