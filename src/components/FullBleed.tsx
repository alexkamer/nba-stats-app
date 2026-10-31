import type { CSSProperties, ReactNode } from "react";

/** Breaks a section out of the page's centered `max-w-6xl` column to span
 * the full content area. The classic `left-1/2 -mx-[50vw] w-screen` trick
 * only works when that column is centered in the viewport — true below
 * `lg`, but not at `lg` and up, where `Sidebar` (`lg:w-52`, 13rem) shifts
 * the content area 13rem right of the viewport's left edge. Without the
 * `lg:` adjustment below, the breakout box's left edge lands under the
 * sidebar instead of at the content area's edge. */
export function FullBleed({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative left-1/2 -mx-[50vw] w-screen lg:mx-[calc(-50vw+6.5rem)] lg:w-[calc(100vw-13rem)] ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
