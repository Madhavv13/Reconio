import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

type Props<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
};

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Segmented control (design system: seg, seg-thumb). The thumb slides to the pressed option,
// the same motion as glass.js slideX: 0.34 s expo.out, none under reduced motion.
export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  const root = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const btn = root.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (!btn || !thumb.current) return;
    const props = { x: btn.offsetLeft, width: btn.offsetWidth };
    if (first.current || reduced()) gsap.set(thumb.current, props);
    else gsap.to(thumb.current, { ...props, duration: 0.34, ease: "expo.out" });
    first.current = false;
  }, [value]);

  return (
    <div className="seg" role="group" aria-label={label} ref={root}>
      <span className="seg-thumb" ref={thumb} />
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
