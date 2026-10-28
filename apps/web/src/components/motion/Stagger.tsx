import { Children } from "react";

/**
 * Children fade and lift in 40ms apart (M2). Pure CSS, so the content is
 * visible even before scripts load, and reduced motion turns it off (see
 * .ft-rise in globals.css).
 */
export function Stagger({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      {Children.toArray(children).map((child, i) => (
        <div key={i} className="ft-rise" style={{ "--i": i } as React.CSSProperties}>
          {child}
        </div>
      ))}
    </div>
  );
}
