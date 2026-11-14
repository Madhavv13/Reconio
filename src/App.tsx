import { useState, type ReactElement } from "react";
import { Wrench } from "lucide-react";
import { Sidebar, type NavItem } from "./shell/Sidebar";
import { ToolCheck } from "./screens/tools/ToolCheck";

const NAV: NavItem[] = [{ id: "tools", label: "Tool check", icon: Wrench }];

const SCREENS: Record<string, { title: string; render: () => ReactElement }> = {
  tools: { title: "Tool check", render: () => <ToolCheck /> },
};

// App shell (NAV-01): floating sidebar, one content panel, a floating bar over the content.
export default function App() {
  const [screen, setScreen] = useState("tools");
  const s = SCREENS[screen];
  return (
    <div className="app">
      <div className="app-side">
        <Sidebar items={NAV} current={screen} onSelect={setScreen} />
      </div>
      <main className="app-main">
        <div className="content no-pipe">
          <div className="scroll">
            <div className="top-space" />
            {s.render()}
            <div className="bottom-space" />
          </div>
          <div className="bar float-top">
            <div className="bar-title"><span className="section">{s.title}</span></div>
          </div>
        </div>
      </main>
    </div>
  );
}
