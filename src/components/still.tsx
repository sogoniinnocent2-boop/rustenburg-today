"use client";

import { useState } from "react";

export function Still({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="still still-failed">Image unavailable</p>;
  return <img className="still" src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
