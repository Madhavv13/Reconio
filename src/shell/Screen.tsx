import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  title: string;
  /** Text after the title in the floating bar. */
  meta?: ReactNode;
  /** Buttons at the right end of the floating bar. */
  actions?: ReactNode;
  children: ReactNode;
};

// One screen inside the content panel: content scrolls under a floating glass bar (NAV-01).
// The title is the screen's h1 (1.3.1, 2.4.6). When a screen opens and nothing has focus,
// focus goes to the title so keyboard and screen-reader users start at the top (2.4.3).
export function Screen({ title, meta, actions, children }: Props) {
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body) h1.current?.focus();
  }, []);

  return (
    <>
      <div className="scroll">
        <div className="top-space" />
        {children}
        <div className="bottom-space" />
      </div>
      <header className="bar float-top">
        <div className="bar-title">
          <h1 className="section" ref={h1} tabIndex={-1} data-screen-title>{title}</h1>
        </div>
        {meta && <span className="label muted">{meta}</span>}
        <span className="spacer" />
        {actions}
      </header>
    </>
  );
}
