import { CaseSupport } from "@/components/case-support";
import { DraftWorkspace } from "@/components/draft-workspace";
import { LiveFolder } from "@/components/live-folder";
import { capabilities } from "@/lib/agent/flags";
import { CaseAccess } from "@/components/case-access";
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
      <LiveFolder id={id} enabled={capabilities().liveFolder && !demoMode()} />
      <DraftWorkspace
        caseId={id}
        enabled={capabilities().drafts && !demoMode()}
      />
      <CaseSupport
        caseId={id}
        enabled={capabilities().liveFolder && !demoMode()}
        researchEnabled={capabilities().research}
      />
      <CaseAccess id={id} />
    </AppShell>
  );
}
