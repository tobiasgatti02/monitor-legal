import {z} from "zod";
import {api,jsonBody,response} from "@/lib/api/http";
import {apiContext,requireRoles,audit} from "@/lib/api/context";
import {db} from "@/lib/db";
import {ApiError} from "@/lib/api/errors";
export const GET=api(async(request,route)=>{
 const c=await apiContext(request);requireRoles(c,["OWNER","ADMIN"]);const id=z.string().uuid().parse((await route?.params)?.id);
 if(!(await db().query("select id from cases where tenant_id=$1 and id=$2 and deleted_at is null",[c.tenantId,id])).length)throw new ApiError(404,"NOT_FOUND","La causa no existe.");
 const rows=await db().query("select u.id,u.full_name as name,tm.role_code as role,exists(select 1 from case_assignments a where a.tenant_id=$1 and a.case_id=$2 and a.user_id=u.id) as assigned from tenant_members tm join users u on u.id=tm.user_id where tm.tenant_id=$1 and tm.active order by u.full_name",[c.tenantId,id]);return response(rows);
});
export const POST=api(async(request,route)=>{
 const c=await apiContext(request);requireRoles(c,["OWNER","ADMIN"]);const id=z.string().uuid().parse((await route?.params)?.id),input=await jsonBody(request,z.object({userIds:z.array(z.string().min(1).max(100)).max(100)}).strict());
 if(!(await db().query("select id from cases where tenant_id=$1 and id=$2 and deleted_at is null",[c.tenantId,id])).length)throw new ApiError(404,"NOT_FOUND","La causa no existe.");
 const ids=[...new Set(input.userIds)];const members=await db().query("select user_id from tenant_members where tenant_id=$1 and active and user_id=any($2::text[])",[c.tenantId,ids]);if(members.length!==ids.length)throw new ApiError(422,"INVALID_MEMBER","Seleccioná miembros activos del estudio.");
 await db().transaction([{statement:"delete from case_assignments where tenant_id=$1 and case_id=$2",parameters:[c.tenantId,id]},{statement:"insert into case_assignments(tenant_id,case_id,user_id,created_by) select $1,$2,x,$4 from unnest($3::text[]) x",parameters:[c.tenantId,id,ids,c.actorId]}]);
 await audit(c,"CASE_ACCESS_UPDATED","case",id,{userIds:ids});return response({saved:true});
});
