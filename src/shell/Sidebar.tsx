import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, type LucideIcon } from "lucide-react";
import mark from "../assets/reconio-mark.svg";
import { useEngagement } from "../state/engagement";

export type NavItem = { id: string; label: string; icon: LucideIcon } | { group: string };

type Props = {
  items: NavItem[];
  current: string;
  onSelect: (id: string) => void;
  onNewEngagement: () => void;
};

const ic = { className: "ic", strokeWidth: 1.5, "aria-hidden": true } as const;

// The engagement switcher (ENG-02, ENG-04): always visible at the top of the sidebar.
function Switcher({ onNew, onSwitched }: { onNew: () => void; onSwitched: () => void }) {
  const { list, active, open } = useEngagement();
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    root.current?.querySelector<HTMLElement>(".menu-item")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const e = active?.engagement;
  const pick = async (id: string) => {
    setMenu(false);
    if (id !== e?.id) {
      await open(id);
      onSwitched();
    }
  };

  return (
    <div style={{ position: "relative" }} ref={root}>
      <button
        type="button"
        className="switcher"
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label={e ? `Engagement: ${e.name}. Switch engagement` : "Choose an engagement"}
        onClick={() => setMenu(!menu)}
      >
        <span className="switcher-mark" />
        <span className="grow" style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e?.name ?? "No engagement"}</span>
          {e?.client && <span className="meta muted">{e.client}</span>}
        </span>
        <ChevronsUpDown {...ic} className="ic muted" />
      </button>
      {menu && (
        <div className="menu" role="menu" style={{ position: "absolute", zIndex: 30, top: 48, left: 0, right: 0, maxHeight: 360, overflow: "auto" }}>
          {list?.map((x) => (
            <button
              key={x.id}
              type="button"
              className="menu-item"
              role="menuitemradio"
              aria-checked={x.id === e?.id}
              aria-selected={x.id === e?.id}
              onClick={() => pick(x.id)}
            >
              {x.id === e?.id ? <Check {...ic} /> : <span className="ic" />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
            </button>
          ))}
          <div className="menu-sep" />
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={() => { setMenu(false); onNew(); }}
          >
            <Plus {...ic} />New engagement
          </button>
        </div>
      )}
    </div>
  );
}

// Floating glass sidebar (NAV-01).
export function Sidebar({ items, current, onSelect, onNewEngagement }: Props) {
  return (
    <aside className="sidebar glass" aria-label="Navigation">
      <div className="row" style={{ height: 40, padding: "0 10px", marginBottom: "var(--space-2)" }}>
        <span className="wordmark">
          <img className="wordmark-mark" src={mark} alt="" width={22} height={22} />
          Reconio
        </span>
      </div>
      <Switcher onNew={onNewEngagement} onSwitched={() => {}} />
      {items.map((n) =>
        "group" in n ? (
          <div key={n.group} className="nav-label">{n.group}</div>
        ) : (
          <button
            key={n.id}
            type="button"
            className="nav-item"
            aria-current={current === n.id ? "page" : undefined}
            onClick={() => onSelect(n.id)}
          >
            <n.icon {...ic} />
            {n.label}
          </button>
        ),
      )}
      <div className="spacer" />
    </aside>
  );
}
