import {neon} from "@neondatabase/serverless";
import {NextResponse} from "next/server";
import {authConfigured} from "@/lib/auth/server";
export async function GET(){
 let database=false;
 try{if(process.env.DATABASE_URL){const sql=neon(process.env.DATABASE_URL);const rows=await sql.query("select not rolbypassrls and not rolsuper and to_regclass('public.knowledge_chunks') is not null and to_regclass('public.team_invitations') is not null as ready from pg_roles where rolname=current_user");database=rows[0]?.ready===true;}}catch{/* Public readiness never includes connection errors or credentials. */}
 const ready=database&&authConfigured;
 return NextResponse.json({data:{status:ready?"ready":"unavailable",database,auth:authConfigured,ai:!!(process.env.LEGAL_AI_URL&&process.env.LEGAL_AI_KEY),timestamp:new Date().toISOString()}},{status:ready?200:503,headers:{"Cache-Control":"no-store"}});
}
