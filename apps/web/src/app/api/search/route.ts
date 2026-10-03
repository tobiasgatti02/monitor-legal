import { apiContext } from "@/lib/api/context";
import { api,response } from "@/lib/api/http";
import { db } from "@/lib/db";
export const GET=api(async request=>{
  const c=await apiContext(request),q=new URL(request.url).searchParams.get("q")?.trim().slice(0,200)??"";
  if(!q)return response([]);
  const rows=await db().query(`(select id,title,'Causa' as kind,'/causas/'||id as url from cases where tenant_id=$1 and deleted_at is null and (title ilike '%'||$2||'%' or docket_number ilike '%'||$2||'%') limit 8)
    union all (select id,full_name as title,'Cliente' as kind,'/clientes' as url from clients where tenant_id=$1 and deleted_at is null and full_name ilike '%'||$2||'%' limit 8)
    union all (select id,name as title,'Documento' as kind,'/documentos' as url from documents where tenant_id=$1 and deleted_at is null and name ilike '%'||$2||'%' limit 8)
    union all (select id,title,'Tarea' as kind,'/tareas' as url from tasks where tenant_id=$1 and title ilike '%'||$2||'%' limit 8)`,[c.tenantId,q]);
  return response(rows);
});
