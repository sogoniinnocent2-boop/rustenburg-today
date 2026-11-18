"use client";

import { useEffect, useRef, useState } from "react";

export const SLIDE_MS = 15_000;

export type Slide = { key: string; href: string; external: boolean; category: string; location: string; headline: string; source: string; author: string | null; published: string | null };

export function TopFive({ stories, title }: { stories: Slide[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const touchX = useRef(0);
  const count = stories.length;
  const hold = userPaused || hoverPaused || focusPaused || hidden;
  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  useEffect(() => {
    if (count < 2 || hold) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [count, hold]);
  if (!count) return null;
  const story = stories[index] || stories[0];
  const go = (next: number) => setIndex((next + count) % count);
  return (
    <section
      className="story-stage overflow-hidden"
      aria-roledescription="carousel"
      aria-label={title}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setFocusPaused(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setFocusPaused(false);
      }}
      onTouchStart={(event) => { touchX.current = event.changedTouches[0]?.clientX || 0; }}
      onTouchEnd={(event) => {
        const delta = (event.changedTouches[0]?.clientX || 0) - touchX.current;
        if (delta > 48) go(index - 1);
        if (delta < -48) go(index + 1);
      }}
    >
      <div className="flex items-center justify-between gap-3 px-6 pt-6">
        <h2 className="font-serif text-2xl">{title}</h2>
        <button type="button" className="rounded-full border border-white/30 px-3 py-1 text-sm" onClick={() => setUserPaused((value) => !value)}>{userPaused ? "Play" : "Pause"}</button>
      </div>
      <a
        key={story.key}
        className="story-slide block px-6 py-8 focus-visible:outline"
        href={story.href}
        target={story.external ? "_blank" : undefined}
        rel={story.external ? "noopener noreferrer" : undefined}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#86A9D5]">{story.category} · {story.location}</p>
        <p className="mt-4 max-w-4xl font-serif text-4xl leading-[1.05] text-white md:text-6xl">{story.headline}</p>
        <p className="mt-5 text-sm text-[#DCE2EA]">{story.source}{story.author ? ` · ${story.author}` : ""} · {story.published ? story.published.slice(0, 16).replace("T", " ") : "time supplied by the source"} · Read the story</p>
      </a>
      {count > 1 ? (
        <div className="flex items-center gap-2 px-6 pb-6">
          <button type="button" className="rounded-full border border-white/30 px-3 py-1 text-sm" onClick={() => go(index - 1)} aria-label="Previous story">Previous</button>
          <button type="button" className="rounded-full border border-white/30 px-3 py-1 text-sm" onClick={() => go(index + 1)} aria-label="Next story">Next</button>
          <div className="ml-2 flex gap-2" aria-label="Story position">
            {stories.map((item, position) => (
              <button key={item.key} type="button" aria-label={`Story ${position + 1} of ${count}`} aria-current={position === index ? "true" : undefined} className={`h-2.5 w-2.5 rounded-full ${position === index ? "bg-[#F5F7FA]" : "bg-[#A9B7C9]"}`} onClick={() => setIndex(position)} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
