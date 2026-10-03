import {createHash} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {betterAuth} from "better-auth";
import {z} from "zod";
import {api,jsonBody,response} from "@/lib/api/http";
import {ApiError} from "@/lib/api/errors";
import {auth} from "@/lib/auth/server";
export const POST=api(async request=>{
 const input=await jsonBody(request,z.object({token:z.string().regex(/^[a-f0-9]{64}$/),name:z.string().min(2).max(100),username:z.string().min(3).max(30).regex(/^[a-z0-9_]+$/),password:z.string().min(12).max(128)}).strict());
 const sql=neon(process.env.DATABASE_AUTH_URL!),hash=createHash("sha256").update(input.token).digest("hex");
 const claimed=await sql.query("update team_invitations set used_at=now() where token_hash=$1 and used_at is null and expires_at>now() returning *",[hash]);
 const invite=claimed[0];if(!invite)throw new ApiError(409,"INVITATION_UNAVAILABLE","La invitación venció o ya se utilizó.");
 let accountCreated=false;
 try{
  const existing=await sql.query('select id from public."user" where lower(email)=lower($1)',[invite.email]);
  if(existing.length)throw new ApiError(409,"ACCOUNT_EXISTS","Esta cuenta ya existe. El administrador puede incorporarla desde Equipo.");
  const bootstrap=betterAuth({...auth.options,emailAndPassword:{enabled:true,minPasswordLength:12,disableSignUp:false}});
  const user=await bootstrap.api.signUpEmail({body:{email:invite.email,name:input.name,username:input.username,password:input.password},headers:request.headers});accountCreated=true;
  await sql.query("insert into tenant_members(tenant_id,user_id,role_code,created_by) values($1,$2,$3,$4)",[invite.tenant_id,user.user.id,invite.role_code,invite.created_by]);
  await sql.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,created_by) values($1,$2,'TEAM_INVITATION_ACCEPTED','team-invitation',$3,$2)",[invite.tenant_id,user.user.id,invite.id]);
  return response({accepted:true});
 }catch(error){if(!accountCreated)await sql.query("update team_invitations set used_at=null where id=$1",[invite.id]);throw error;}
});
