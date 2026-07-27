import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { TodayDashboard } from "@/components/today-dashboard";
import { auth, authConfigured } from "@/lib/auth/server";
import { getTodayDashboard } from "@/lib/today-data";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  let actorId = "demo-user";

  if (authConfigured) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect("/auth/sign-in");
    actorId = session.user.id;
  }

  const data = await getTodayDashboard(actorId);

  return (
    <AppShell>
      <TodayDashboard data={data} />
    </AppShell>
  );
}
