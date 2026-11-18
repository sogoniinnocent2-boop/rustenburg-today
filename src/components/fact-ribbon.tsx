"use client";

import { useEffect, useState } from "react";

export function FactRibbon({ facts }: { facts: string[] }) {
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(reduce.matches || document.hidden);
    sync();
    reduce.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      reduce.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const hold = paused || still;
  return (
    <section className="space-y-3" aria-label="Rustenburg facts">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">Rustenburg. A story still being written.</h2>
        <button type="button" className="rounded-full border px-3 py-1 text-sm" onClick={() => setPaused((value) => !value)}>{hold ? "Play" : "Pause"}</button>
      </div>
      {hold ? (
        <ul className="space-y-2">{facts.map((fact) => <li key={fact} className="text-sm">{fact}</li>)}</ul>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#DCE2EA]">
          <p className="ribbon-track px-4 py-3 text-sm">{facts.join("   ·   ")}</p>
        </div>
      )}
    </section>
  );
}
