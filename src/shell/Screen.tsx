import type { ReactNode } from "react";

type Props = {
  title: string;
  /** Text after the title in the floating bar. */
  meta?: ReactNode;
  /** Buttons at the right end of the floating bar. */
  actions?: ReactNode;
  children: ReactNode;
};

// One screen inside the content panel: content scrolls under a floating glass bar (NAV-01).
export function Screen({ title, meta, actions, children }: Props) {
  return (
    <>
      <div className="scroll">
        <div className="top-space" />
        {children}
        <div className="bottom-space" />
      </div>
      <div className="bar float-top">
        <div className="bar-title"><span className="section">{title}</span></div>
        {meta && <span className="label muted">{meta}</span>}
        <span className="spacer" />
        {actions}
      </div>
    </>
  );
}
