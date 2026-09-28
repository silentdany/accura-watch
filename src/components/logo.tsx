"use client";

import { useId } from "react";

/** Pulse-eye silhouette and pulse line, on a 64×64 grid. */
export const EYE_PATH = "M3 32C4.5 23 17 13 32 13C47 13 59.5 23 61 32C59.5 41 47 51 32 51C17 51 4.5 41 3 32Z";
export const PULSE_PATH = "M13 32h9.5l5-10 6.5 19 5-13 3.5 4h9.5";

/** The Watch mark: a blue eye with the pulse cut out (transparent, so it sits on any background). */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden>
      <defs>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="#fff" />
          <path d={PULSE_PATH} fill="none" stroke="#000" strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <path d={EYE_PATH} fill="hsl(var(--brand))" mask={`url(#m${id})`} />
    </svg>
  );
}
