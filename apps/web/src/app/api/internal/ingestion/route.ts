import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withActor } from "@/lib/db-scope";
import { runDocumentStep } from "@/lib/agent/jobs";
import type { ApiContext } from "@/lib/api/context";
export const maxDuration = 120;
export async function POST(request: Request) {
  const expected = process.env.INGESTION_CRON_KEY ?? "",
    received =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !expected ||
    Buffer.byteLength(expected) !== Buffer.byteLength(received) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_SCHEDULER_URL)
    return NextResponse.json(
      { error: "Scheduler unavailable" },
      { status: 503 },
    );
  try {
    const rows = await neon(process.env.DATABASE_SCHEDULER_URL).query(
      "select * from app.next_legal_job()",
    );
    const job = rows[0];
    if (!job) return NextResponse.json({ processed: false });
    return await withActor(job.actor, async () => {
      const membership = await db().query(
        "select tm.role_code,t.name from tenant_members tm join tenants t on t.id=tm.tenant_id where tm.tenant_id=$1 and tm.user_id=$2 and tm.active",
        [job.tenant, job.actor],
      );
      if (!membership.length || membership[0]!.role_code === "READ_ONLY")
        return NextResponse.json({ processed: false, reason: "ACTOR_REVOKED" });
      const c: ApiContext = {
        actorId: job.actor,
        tenantId: job.tenant,
        role: membership[0]!.role_code,
        tenantName: membership[0]!.name,
        actorName: "Executor",
      };
      return NextResponse.json(await runDocumentStep(c, job.id));
    });
  } catch {
    return NextResponse.json({ error: "Ingestion failed" }, { status: 503 });
  }
}
