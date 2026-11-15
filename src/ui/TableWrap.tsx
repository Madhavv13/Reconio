import type { ReactNode } from "react";

// A data table that may be wider than its panel (1.4.10 allows two-dimensional tables to
// scroll). The scroll area is a named region that takes focus, so keyboard users can scroll
// it with the arrow keys (2.1.1).
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
