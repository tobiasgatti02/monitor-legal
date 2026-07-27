import { AppShell } from "@/components/app-shell";
import { CaseDetail } from "@/components/case-detail";
import { demoMode } from "@/lib/demo-mode";

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <CaseDetail id={id} demo={demoMode()} />
    </AppShell>
  );
}
