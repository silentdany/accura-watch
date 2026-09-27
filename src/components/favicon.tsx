"use client";

import { useState } from "react";
import { faviconUrl } from "@/lib/domain";

/** Site favicon with a lettered fallback when it can't be loaded. */
export function Favicon({ domain, size = 18 }: { domain: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (failed) {
    return (
      <span
        style={{ ...style, fontSize: Math.max(8, size * 0.55) }}
        className="inline-flex shrink-0 items-center justify-center rounded-[4px] bg-muted font-semibold uppercase text-muted-foreground"
        aria-hidden
      >
        {domain.charAt(0)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={faviconUrl(domain, 64)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-[4px] bg-muted"
      style={style}
    />
  );
}
