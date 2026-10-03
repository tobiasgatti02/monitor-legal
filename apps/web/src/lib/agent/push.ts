import "server-only";
import webpush from "web-push";
import type { NeonQueryFunction } from "@neondatabase/serverless";
export async function deliverPush(sql: NeonQueryFunction<false, false>) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
    return { sent: 0, failed: 0 };
  webpush.setVapidDetails(
    "mailto:tobiasgatti02@gmail.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const rows = await sql.query("select * from app.pending_push()");
  const grouped = new Map<string, typeof rows>();
  for (const row of rows)
    grouped.set(row.notification_id, [
      ...(grouped.get(row.notification_id) ?? []),
      row,
    ]);
  let sent = 0,
    failed = 0;
  const groups = [...grouped];
  for (let offset = 0; offset < groups.length; offset += 5) {
    await Promise.allSettled(
      groups.slice(offset, offset + 5).map(async ([id, subscriptions]) => {
        let success = false;
        const expired: string[] = [];
        await Promise.allSettled(
          subscriptions.map(async (row) => {
            try {
              await webpush.sendNotification(
                row.subscription,
                JSON.stringify({ id }),
                { TTL: 3600, urgency: "normal", timeout: 8000 },
              );
              success = true;
              sent++;
            } catch (e) {
              failed++;
              if ([404, 410].includes((e as { statusCode: number }).statusCode))
                expired.push(row.subscription_id);
            }
          }),
        );
        await sql.query("select app.finish_push($1,$2,$3::uuid[])", [
          id,
          success,
          expired,
        ]);
      }),
    );
  }
  return { sent, failed };
}
