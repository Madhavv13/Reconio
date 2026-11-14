import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons for the dialog-actions row. One primary or danger button per dialog. */
  actions: ReactNode;
  width?: number;
  alert?: boolean;
};

// Modal dialog on thick glass over a scrim (design system: dialog, scrim). Esc and the
// scrim close it; focus moves into it on open and back to the opener on close.
export function Dialog({ title, onClose, children, actions, width, alert }: Props) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Parents pass a new onClose on every render; keep the latest without re-running the effect,
  // which would move focus back to the first field on every keystroke or click.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Focus the field the user came to fill in: [autofocus], then a text box, then the first button.
    const q = (sel: string) => ref.current?.querySelector<HTMLElement>(sel);
    const first = q("[autofocus]") ?? q("textarea") ?? q("input:not([type=checkbox]):not([type=radio])") ?? q("button:not([disabled])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab" && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>("input, textarea, select, button:not([disabled]), [tabindex='0']")];
        if (!items.length) return;
        const [a, z] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          z.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === z) {
          a.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="dialog"
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={id}
        style={width ? { width } : undefined}
      >
        <h2 className="dialog-title" id={id}>{title}</h2>
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}
