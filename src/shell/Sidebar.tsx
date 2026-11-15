import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronsUpDown, Plus, type LucideIcon } from "lucide-react";
import mark from "../assets/reconio-mark.svg";
import { useEngagement } from "../state/engagement";
import { announce } from "../ui/a11y";

export type NavItem =
  /** `countLabel` is read after the count by screen readers ("Scope, 4 rules"). */
  | { id: string; label: string; icon: LucideIcon; count?: string; countLabel?: string }
  | { group: string };

type Props = {
  items: NavItem[];
  /** Pinned to the bottom of the sidebar, as in the mockups (Settings). */
  bottom: NavItem[];
  current: string;
  onSelect: (id: string) => void;
  onNewEngagement: () => void;
};

const ic = { className: "ic", strokeWidth: 1.5, "aria-hidden": true } as const;

// The engagement switcher (ENG-02, ENG-04): always visible at the top of the sidebar.
// Keyboard (ARIA menu pattern): Enter, Space or Down opens the menu on the first item, Up on
// the last; Up and Down move, Home and End jump, Esc closes and returns to the button, Tab
// closes and moves on.
function Switcher({ onNew }: { onNew: () => void }) {
  const { list, active, open } = useEngagement();
  const [menu, setMenu] = useState<null | "first" | "last">(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const items = () => [...(root.current?.querySelectorAll<HTMLElement>(".menu-item") ?? [])];
  const close = (refocus: boolean) => {
    setMenu(null);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!menu) return;
    const outside = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setMenu(null);
    document.addEventListener("mousedown", outside);
    const all = items();
    (menu === "last" ? all[all.length - 1] : all[0])?.focus();
    return () => document.removeEventListener("mousedown", outside);
  }, [menu]);

  const onMenuKey = (e: ReactKeyboardEvent) => {
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      all[(n + all.length) % all.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") close(false);
  };

  const onButtonKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMenu("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMenu("last");
    }
  };

  const e = active?.engagement;
  const pick = async (id: string, name: string) => {
    close(true);
    if (id !== e?.id) {
      await open(id);
      announce(`Opened ${name}.`);
    }
  };

  return (
    <div className="switcher-wrap" style={{ position: "relative" }} ref={root}>
      <button
        type="button"
        ref={button}
        className="switcher"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        aria-controls={menu ? "switcher-menu" : undefined}
        onClick={() => (menu ? close(false) : setMenu("first"))}
        onKeyDown={onButtonKey}
      >
        <span className="switcher-mark" aria-hidden="true" />
        <span className="grow" style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e?.name ?? "No engagement"}</span>
          {e?.client && <span className="meta muted">{e.client}</span>}
        </span>
        {/* 2.5.3: the name starts with the visible text, then says what the button does. */}
        <span className="sr-only">, switch engagement</span>
        <ChevronsUpDown {...ic} className="ic muted" />
      </button>
      {menu && (
        <div
          className="menu"
          id="switcher-menu"
          role="menu"
          aria-label="Engagements"
          onKeyDown={onMenuKey}
          style={{ position: "absolute", zIndex: 30, top: 48, left: 0, right: 0, maxHeight: 360, overflow: "auto" }}
        >
          {list?.map((x) => (
            <button
              key={x.id}
              type="button"
              className="menu-item"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={x.id === e?.id}
              onClick={() => pick(x.id, x.name)}
            >
              {x.id === e?.id ? <Check {...ic} /> : <span className="ic" aria-hidden="true" />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
            </button>
          ))}
          <div className="menu-sep" role="separator" />
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            tabIndex={-1}
            onClick={() => { close(false); onNew(); }}
          >
            <Plus {...ic} />New engagement
          </button>
        </div>
      )}
    </div>
  );
}

// Floating glass sidebar (NAV-01).
function NavButton({ n, current, onSelect }: { n: Exclude<NavItem, { group: string }>; current: string; onSelect: (id: string) => void }) {
  return (
    <button type="button" className="nav-item" aria-current={current === n.id ? "page" : undefined} onClick={() => onSelect(n.id)}>
      <n.icon {...ic} />
      {n.label}
      {n.count && <span className="count"><span className="sr-only">, </span>{n.count}{n.countLabel && <span className="sr-only"> {n.countLabel}</span>}</span>}
    </button>
  );
}

export function Sidebar({ items, bottom, current, onSelect, onNewEngagement }: Props) {
  return (
    <nav className="sidebar glass" aria-label="Main">
      <div className="row" style={{ height: 40, padding: "0 10px", marginBottom: "var(--space-2)" }}>
        <span className="wordmark">
          <img className="wordmark-mark" src={mark} alt="" width={22} height={22} />
          Reconio
        </span>
      </div>
      <Switcher onNew={onNewEngagement} />
      {items.map((n) =>
        "group" in n ? <div key={n.group} className="nav-label">{n.group}</div> : <NavButton key={n.id} n={n} current={current} onSelect={onSelect} />,
      )}
      <div className="spacer" />
      {bottom.map((n) => ("group" in n ? null : <NavButton key={n.id} n={n} current={current} onSelect={onSelect} />))}
    </nav>
  );
}
