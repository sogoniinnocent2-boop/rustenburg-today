"use client";

import { useEffect, useState } from "react";

export function FloatDock({ locale }: { locale: string }) {
  const [top, setTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setTop(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="float-dock">
      <a className="float-btn" href={`/${locale}/ask`}>Ask</a>
      <a className="float-btn" href={`/${locale}/saved`}>Saved</a>
      {top ? <button type="button" className="float-btn" onClick={() => document.getElementById("content")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>Top</button> : null}
    </div>
  );
}
