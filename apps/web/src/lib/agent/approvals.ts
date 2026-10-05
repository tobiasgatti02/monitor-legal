import "server-only";
import { db } from "@/lib/db";
import { requireRoles, type ApiContext } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";

export async function decideApproval(
  context: ApiContext,
  id: string,
  decision: "APPROVE" | "REJECT",
) {
  requireRoles(context, ["OWNER", "ADMIN", "LAWYER"]);
  const rows = await db().query(
    `with selected as (
    select * from agent_approvals where tenant_id=$1 and user_id=$2 and id=$3
      and status='PENDING' and expires_at>now() and (payload->>'sourceOutputId' is null or exists(select 1 from case_outputs o where o.id=(payload->>'sourceOutputId')::uuid and o.tenant_id=agent_approvals.tenant_id and o.case_id=agent_approvals.case_id and o.reviewed_at is not null and not o.stale)) for update
  ), new_task as (
    insert into tasks(tenant_id,case_id,title,description,due_at,responsible_user_id,created_by)
    select $1,case_id,payload->>'title',payload->>'body',(payload->>'dueAt')::timestamptz,$2,$2
      from selected where action='CREATE_TASK' and $4='APPROVE' returning id
  ), new_deadline as (
    insert into deadlines(tenant_id,case_id,title,due_at,status,notes,created_by)
    select $1,case_id,payload->>'title',(payload->>'dueAt')::timestamptz,'POSSIBLE',payload->>'body',$2
      from selected where action='CREATE_DEADLINE' and $4='APPROVE' returning id
  ), new_communication as (
    insert into communications(tenant_id,case_id,client_id,subject,body,channel,direction,status,created_by)
    select $1,s.case_id,c.client_id,s.payload->>'title',s.payload->>'body','EMAIL','OUTBOUND','DRAFT',$2
      from selected s join cases c on c.id=s.case_id and c.tenant_id=s.tenant_id
      where s.action='DRAFT_COMMUNICATION' and $4='APPROVE' returning id
  ) , new_reminder as (
    insert into reminders(tenant_id,user_id,case_id,title,body,due_at,repeat_frequency,created_by)
    select $1,$2,case_id,payload->>'title',coalesce(payload->>'body',''),(payload->>'dueAt')::timestamptz,coalesce(payload->>'repeatFrequency','NONE'),$2 from selected where action='CREATE_REMINDER' and $4='APPROVE' and (payload->>'dueAt')::timestamptz>now() returning id
  ), decided as (
    update agent_approvals a set status=case when $4='APPROVE' then 'APPROVED' else 'REJECTED' end,
      decided_by=$2,decided_at=now(),result_id=coalesce((select id from new_task),(select id from new_deadline),(select id from new_communication),(select id from new_reminder))
      from selected s where a.id=s.id and ($4='REJECT' or s.action<>'CREATE_REMINDER' or exists(select 1 from new_reminder)) returning a.id,a.status,a.result_id as "resultId",a.action
  ), logged as (
    insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata,created_by)
    select $1,$2,'AGENT_ACTION_'||status,'agent-approval',id,jsonb_build_object('action',action,'resultId',"resultId"),$2 from decided
  ) select * from decided`,
    [context.tenantId, context.actorId, id, decision],
  );
  if (!rows.length)
    throw new ApiError(
      409,
      "APPROVAL_UNAVAILABLE",
      "La propuesta ya fue decidida, venció o no es accesible.",
    );
  return rows[0];
}
