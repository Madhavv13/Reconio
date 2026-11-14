import type { LucideIcon } from "lucide-react";
import mark from "../assets/reconio-mark.svg";

export type NavItem = { id: string; label: string; icon: LucideIcon; count?: string };

type Props = {
  items: NavItem[];
  current: string;
  onSelect: (id: string) => void;
};

// Floating glass sidebar (NAV-01). Module 0 lists only the screens that exist;
// the engagement switcher and result views arrive with their modules.
export function Sidebar({ items, current, onSelect }: Props) {
  return (
    <aside className="sidebar glass" aria-label="Navigation">
      <div className="row" style={{ height: 40, padding: "0 10px", marginBottom: "var(--space-2)" }}>
        <span className="wordmark">
          <img className="wordmark-mark" src={mark} alt="" width={22} height={22} />
          Reconio
        </span>
      </div>
      {items.map(({ id, label, icon: Icon, count }) => (
        <button
          key={id}
          className="nav-item"
          aria-current={current === id ? "page" : undefined}
          onClick={() => onSelect(id)}
          style={{ border: 0, background: current === id ? undefined : "transparent", width: "100%", font: "inherit", fontWeight: 500 }}
        >
          <Icon className="ic" strokeWidth={1.5} aria-hidden />
          {label}
          {count && <span className="count">{count}</span>}
        </button>
      ))}
      <div className="spacer" />
    </aside>
  );
}
