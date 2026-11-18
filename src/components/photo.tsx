"use client";

import { useState } from "react";

export function Photo({ src, alt, width, height, credit, className }: { src: string; alt: string; width: number | null; height: number | null; credit: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <>
      <img src={src} alt={alt} width={width || 1600} height={height || 900} className={className} loading="lazy" onError={() => setFailed(true)} />
      <p className="hero-credit">{credit}</p>
    </>
  );
}
