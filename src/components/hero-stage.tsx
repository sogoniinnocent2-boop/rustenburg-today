"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { HeroScene } from "@/lib/hero-scenes";

const HOLD_MS = 10_000;

export function HeroStage({ scenes, children }: { scenes: HeroScene[]; children: ReactNode }) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduce, setReduce] = useState(false);
  const count = scenes.length;
  const hold = userPaused || hoverPaused || focusPaused || hidden || reduce;
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setHidden(document.hidden);
      setReduce(motion.matches);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
    };
  }, []);
  useEffect(() => {
    if (count < 2 || hold) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), HOLD_MS);
    return () => window.clearInterval(timer);
  }, [count, hold]);
  useEffect(() => {
    if (count < 2) return;
    const next = scenes[(index + 1) % count];
    const image = new Image();
    image.src = next.src;
  }, [count, index, scenes]);
  if (!count) return null;
  const scene = scenes[index] || scenes[0];
  const go = (next: number) => setIndex((next + count) % count);
  return (
    <section
      className="cine-hero"
      aria-roledescription="carousel"
      aria-label="Rustenburg photographs"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setFocusPaused(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setFocusPaused(false);
      }}
    >
      {scenes.map((item, position) => (
        <img key={item.id} className={position === index ? "cine-bg is-on" : "cine-bg"} src={item.src} alt={position === index ? item.alt : ""} aria-hidden={position === index ? undefined : true} />
      ))}
      <div className="cine-shade" />
      {children}
      <div className="hero-meta">
        <p><span>{scene.label}</span> · {scene.place}</p>
        <p>{scene.credit}. {scene.note}</p>
        {count > 1 ? (
          <div className="hero-controls">
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous photograph">Previous</button>
            <button type="button" onClick={() => setUserPaused((value) => !value)}>{userPaused ? "Play" : "Pause"}</button>
            <button type="button" onClick={() => go(index + 1)} aria-label="Next photograph">Next</button>
            <span className="hero-dots" aria-label="Photograph position">
              {scenes.map((item, position) => (
                <button key={item.id} type="button" aria-label={`${item.label}, ${position + 1} of ${count}`} aria-current={position === index ? "true" : undefined} className={position === index ? "is-on" : ""} onClick={() => setIndex(position)} />
              ))}
            </span>
            <span className="hero-meter" aria-hidden="true">{hold ? null : <i key={index} />}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
