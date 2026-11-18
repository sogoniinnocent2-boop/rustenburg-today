"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function MenuDrawer({ label, closeLabel, children }: { label: string; closeLabel: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (box.current) box.current.checked = false;
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && box.current?.checked) box.current.checked = false;
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="menu-root">
      <input ref={box} id="city-menu" className="menu-toggle" type="checkbox" />
      <label htmlFor="city-menu" className="menu-button">
        <span className="menu-bars" aria-hidden="true" />
        <span className="menu-label">{label}</span>
      </label>
      <label htmlFor="city-menu" className="drawer-backdrop" aria-label={closeLabel} />
      <aside id="city-drawer" className="glass-side drawer-panel" aria-label={label}>
        {children}
      </aside>
    </div>
  );
}
