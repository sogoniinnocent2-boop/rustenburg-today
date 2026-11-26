"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

export function FloatDock({ locale }: { locale: string }) {
  const [top, setTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setTop(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="float-dock" lang={locale}>
      <a className="float-btn" href={`/${locale}/ask`}>{t(locale, "nav.ask")}</a>
      <a className="float-btn" href={`/${locale}/saved`}>{t(locale, "nav.saved")}</a>
      {top ? <button type="button" className="float-btn" onClick={() => document.getElementById("content")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>{t(locale, "nav.top")}</button> : null}
    </div>
  );
}
