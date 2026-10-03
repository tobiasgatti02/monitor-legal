import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { betterAuth } from "better-auth";
import { z } from "zod";
import { api,jsonBody,response } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import { auth } from "@/lib/auth/server";
export const POST=api(async request=>{
  const input=await jsonBody(request,z.object({token:z.string().min(32).max(100),name:z.string().min(2).max(100),username:z.string().min(3).max(30).regex(/^[a-z0-9_]+$/),studio:z.string().min(2).max(120),email:z.email(),password:z.string().min(12).max(128)}).strict());
  const secret=process.env.SETUP_TOKEN;
  if(!secret||input.token.length!==secret.length||!timingSafeEqual(Buffer.from(secret),Buffer.from(input.token))) throw new ApiError(403,"SETUP_DENIED","El enlace de configuración no es válido.");
  if(!process.env.DATABASE_AUTH_URL)throw new ApiError(503,"DATABASE_NOT_CONFIGURED","Falta configurar la base de datos.");
  const sql=neon(process.env.DATABASE_AUTH_URL);
  const claimed=await sql.query(`insert into bootstrap_claim(id) select 'initial-owner'
    where not exists(select 1 from public."user") on conflict do nothing returning id`);
  if(!claimed.length)throw new ApiError(409,"SETUP_COMPLETE","El estudio ya fue configurado. Iniciá sesión con tu cuenta.");
  try {
    const bootstrap=betterAuth({...auth.options,emailAndPassword:{enabled:true,minPasswordLength:12,disableSignUp:false}});
    const result=await bootstrap.api.signUpEmail({body:{email:input.email,password:input.password,name:input.name,username:input.username},headers:request.headers});
    const rows=await sql.query(`with studio as (insert into tenants(name,created_by) values($1,$2) returning id),
      member as (insert into tenant_members(tenant_id,user_id,role_code,created_by) select id,$2,'OWNER',$2 from studio)
      select id from studio`,[input.studio,result.user.id]);
    return response({tenantId:rows[0]!.id,configured:true});
  } catch(error) {
    await sql.query("delete from bootstrap_claim where id='initial-owner' and not exists(select 1 from public.\"user\")");
    throw error;
  }
});
