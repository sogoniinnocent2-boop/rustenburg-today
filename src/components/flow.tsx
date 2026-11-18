"use client";

import { useEffect } from "react";

/** Records that the signature intro has played and pauses ambient motion while the tab is hidden. */
export function FlowMemory() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) root.classList.add("flow-skip");
    const sync = () => root.classList.toggle("page-hidden", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    const seen = window.sessionStorage.getItem("rt-flow");
    if (seen || reduce) {
      root.classList.add("flow-skip");
      return () => document.removeEventListener("visibilitychange", sync);
    }
    window.sessionStorage.setItem("rt-flow", "1");
    const timer = window.setTimeout(() => root.classList.add("flow-skip"), 700);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return null;
}
