import { AppShell } from "@/components/app-shell";
import { SettingsPanel } from "@/components/settings-panel";
import { demoMode } from "@/lib/demo-mode";

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsPanel demo={demoMode()} />
    </AppShell>
  );
}
