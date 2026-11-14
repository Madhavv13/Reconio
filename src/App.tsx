import { useEffect, useState, type ReactElement } from "react";
import { Briefcase, Shield, Wrench } from "lucide-react";
import { Sidebar, type NavItem } from "./shell/Sidebar";
import { Screen } from "./shell/Screen";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { EngagementProvider, useEngagement } from "./state/engagement";
import { ToolCheck } from "./screens/tools/ToolCheck";
import { NewEngagement } from "./screens/engagement-new/NewEngagement";
import { ScopeScreen } from "./screens/scope/ScopeScreen";
import { EngagementSettings } from "./screens/engagement-settings/EngagementSettings";

type ScreenId = "scope" | "settings" | "tools" | "new";

const NAV: NavItem[] = [
  { group: "Engagement" },
  { id: "scope", label: "Scope", icon: Shield },
  { id: "settings", label: "Engagement settings", icon: Briefcase },
  { group: "App" },
  { id: "tools", label: "Tool check", icon: Wrench },
];

function Shell() {
  const { loaded, list, active, open } = useEngagement();
  const [screen, setScreen] = useState<ScreenId>("scope");

  // If the last engagement is gone (deleted), open the most recent remaining one.
  useEffect(() => {
    if (loaded && !active && list && list.length > 0) open(list[0].id);
  }, [loaded, active, list, open]);

  if (!loaded) return null;

  // First run: no engagement yet, so creating one is the only thing to do.
  const firstRun = !active && (list?.length ?? 0) === 0;
  const current: ScreenId = firstRun && screen !== "tools" ? "new" : screen;

  const screens: Record<ScreenId, () => ReactElement> = {
    new: () => (
      <Screen title="New engagement">
        <NewEngagement onCreated={() => setScreen("scope")} onCancel={firstRun ? undefined : () => setScreen("scope")} />
      </Screen>
    ),
    scope: () => <ScopeScreen />,
    settings: () => <EngagementSettings />,
    tools: () => (
      <Screen title="Tool check">
        <ToolCheck />
      </Screen>
    ),
  };

  return (
    <div className="app">
      <div className="app-side">
        <Sidebar
          items={firstRun ? NAV.filter((n) => "group" in n ? n.group === "App" : n.id === "tools") : NAV}
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
