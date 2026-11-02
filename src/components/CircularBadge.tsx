"use client";

import { useState } from "react";

const SIZE_CLASSES = {
  xs: "h-4 w-4",
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-14 w-14",
} as const;

export type CircularBadgeSize = keyof typeof SIZE_CLASSES;

/** Unified circular treatment for team/player identity images and compact
 * result/status marks, replacing the previous mix of unclipped square
 * `<img>`s and ad hoc `rounded-full` call sites at inconsistent sizes. */
export function CircularBadge({
  src,
  alt,
  size,
  fallback,
  className = "",
}: {
  src?: string | null;
  alt: string;
  size: CircularBadgeSize;
  fallback?: React.ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];

  if (!src || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-surface-muted ${sizeClass} ${className}`}
        aria-hidden={alt === ""}
        aria-label={alt || undefined}
      >
        {fallback}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`shrink-0 rounded-full object-cover ${sizeClass} ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
