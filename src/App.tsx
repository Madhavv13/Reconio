import { useEffect, useState, type ReactElement } from "react";
import { Briefcase, Settings as SettingsIcon, Shield } from "lucide-react";
import { Sidebar, type NavItem } from "./shell/Sidebar";
import { Screen } from "./shell/Screen";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { EngagementProvider, useEngagement } from "./state/engagement";
import { onboardingDone } from "./ipc";
import { Onboarding } from "./screens/onboarding/Onboarding";
import { NewEngagement } from "./screens/engagement-new/NewEngagement";
import { ScopeScreen } from "./screens/scope/ScopeScreen";
import { EngagementSettings } from "./screens/engagement-settings/EngagementSettings";
import { Settings } from "./screens/settings/Settings";
import { fmt } from "./ui/format";

type ScreenId = "scope" | "engagement" | "settings" | "new";

function Shell() {
  const { loaded, list, active, open } = useEngagement();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<ScreenId>("scope");

  useEffect(() => {
    onboardingDone().then(setOnboarded);
  }, []);

  // If the last engagement is gone (deleted), open the most recent remaining one.
  useEffect(() => {
    if (loaded && !active && list && list.length > 0) open(list[0].id);
  }, [loaded, active, list, open]);

  if (!loaded || onboarded === null) return null;

  // ONB-01: first launch shows Welcome → Tool check → API keys → First engagement.
  if (!onboarded) {
    return (
      <Onboarding
        onDone={() => {
          setScreen("scope");
          setOnboarded(true);
        }}
      />
    );
  }

  const noEngagement = !active && (list?.length ?? 0) === 0;
  const current: ScreenId = noEngagement && screen !== "settings" ? "new" : screen;

  // Sidebar as in the mockups. Pipeline, results views and Export join it in Modules 2 to 4.
  const nav: NavItem[] = noEngagement
    ? []
    : [
        { group: "Engagement" },
        { id: "scope", label: "Scope", icon: Shield, count: active ? fmt(active.rule_count) : undefined },
        { id: "engagement", label: "Engagement settings", icon: Briefcase },
      ];
  const bottom: NavItem[] = [{ id: "settings", label: "Settings", icon: SettingsIcon }];

  const screens: Record<ScreenId, () => ReactElement> = {
    new: () => (
      <Screen title="New engagement">
        <NewEngagement onCreated={() => setScreen("scope")} onCancel={noEngagement ? undefined : () => setScreen("scope")} />
      </Screen>
    ),
    scope: () => <ScopeScreen />,
    engagement: () => <EngagementSettings />,
    settings: () => <Settings />,
  };

  return (
    <div className="app">
      <div className="app-side">
        <Sidebar
          items={nav}
          bottom={bottom}
          current={current}
          onSelect={(id) => setScreen(id as ScreenId)}
          onNewEngagement={() => setScreen("new")}
        />
      </div>
      <main className="app-main">
        <div className="content no-pipe">
          <ErrorBoundary key={current}>{screens[current]()}</ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

// App shell (NAV-01): floating sidebar, one content panel, a floating bar over the content.
export default function App() {
  return (
    <EngagementProvider>
      <Shell />
    </EngagementProvider>
  );
}
