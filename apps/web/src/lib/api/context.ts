import { auth, authConfigured } from "@/lib/auth/server";
import { ApiError } from "@/lib/api/errors";
import { db, isDatabaseConfigured } from "@/lib/db";

export const tenantRoles = ["OWNER", "ADMIN", "LAWYER", "ASSISTANT", "READ_ONLY"] as const;
export type TenantRole = (typeof tenantRoles)[number];

export type ApiContext = {
  actorId: string;
  actorName: string;
  tenantId: string;
  tenantName: string;
  role: TenantRole;
};

type MembershipRow = {
  actor_name: string | null;
  tenant_id: string;
  tenant_name: string;
  role_code: TenantRole;
};

export async function apiContext(request: Request): Promise<ApiContext> {
  if (!authConfigured || !isDatabaseConfigured()) {
    throw new ApiError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "Neon y Better Auth deben estar configurados para utilizar la API.",
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw new ApiError(401, "AUTH_REQUIRED", "Iniciá sesión para continuar.");
  }

  const rows = (await db().query(
    `select tm.tenant_id, tm.role_code, t.name as tenant_name,
            coalesce(u.full_name, $2) as actor_name
       from public.tenant_members tm
       join public.tenants t on t.id = tm.tenant_id
       left join public.users u on u.id = tm.user_id
      where tm.user_id = $1 and tm.active
      order by tm.created_at
      limit 1`,
    [session.user.id, session.user.name],
  )) as MembershipRow[];
  const membership = rows[0];
  if (!membership) {
    throw new ApiError(
      403,
      "TENANT_MEMBERSHIP_REQUIRED",
      "Tu usuario todavía no pertenece a un estudio.",
    );
  }

  return {
    actorId: session.user.id,
    actorName: membership.actor_name ?? session.user.name,
    tenantId: membership.tenant_id,
    tenantName: membership.tenant_name,
    role: membership.role_code,
  };
}

export function requireWrite(context: ApiContext): void {
  if (context.role === "READ_ONLY") {
    throw new ApiError(403, "READ_ONLY", "Tu rol es de sólo lectura.");
  }
}

export function requireRoles(context: ApiContext, roles: readonly TenantRole[]): void {
  if (!roles.includes(context.role)) {
    throw new ApiError(403, "INSUFFICIENT_ROLE", "No tenés permisos para esta operación.");
  }
}

export async function audit(
  context: ApiContext,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db().query(
    `insert into public.audit_logs (
       tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_by
     ) values ($1, $2, $3, $4, $5, $6::jsonb, $2)`,
    [
      context.tenantId,
      context.actorId,
      action,
      entityType ?? null,
      entityId ?? null,
      JSON.stringify(metadata),
    ],
  );
}
