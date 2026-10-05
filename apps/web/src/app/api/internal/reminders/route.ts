import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { capabilities } from "@/lib/agent/flags";
import { deliverPush } from "@/lib/agent/push";
export const maxDuration = 120;
export async function POST(request: Request) {
  const expected = process.env.ALERT_CRON_KEY ?? "",
    received =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !expected ||
    Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_SCHEDULER_URL)
    return NextResponse.json(
      { error: "Scheduler unavailable" },
      { status: 503 },
    );
  try {
    const sql = neon(process.env.DATABASE_SCHEDULER_URL),
      rows = await sql.query("select app.deliver_reminders() as delivered");
    const folderAlerts = capabilities().liveFolder
      ? (await sql.query("select app.deliver_folder_alerts() as delivered"))[0]!
          .delivered
      : 0;
    const push = await deliverPush(sql);
    return NextResponse.json(
      {
        delivered: rows[0]!.delivered,
        push,
        folderAlerts,
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Scheduler failed" }, { status: 503 });
  }
}
