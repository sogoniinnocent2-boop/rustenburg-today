"use client";

import { useRef, useState } from "react";
import type { HeroScene } from "@/lib/hero-scenes";

export function ViewRail({ cards, locale }: { cards: HeroScene[]; locale: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, left: 0, active: false });
  const [filter, setFilter] = useState("All");
  const [notice, setNotice] = useState("");
  const categories = ["All", ...Array.from(new Set(cards.map((card) => card.category)))];
  const shown = filter === "All" ? cards : cards.filter((card) => card.category === filter);
  function step(direction: number) {
    const node = scroller.current;
    if (!node) return;
    const card = node.querySelector<HTMLElement>(".view-card");
    const amount = (card?.offsetWidth || 320) + 14;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollBy({ left: direction * amount, behavior: reduce ? "auto" : "smooth" });
  }
  async function share(card: HeroScene) {
    const url = `${window.location.origin}/${locale}#view-${card.id}`;
    try {
      if (navigator.share) await navigator.share({ title: card.label, url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice(`Link copied for ${card.label}.`);
      }
    } catch {
      setNotice("The link was not copied.");
    }
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Photograph categories">
        {categories.map((category) => (
          <button key={category} type="button" role="tab" aria-selected={filter === category} className={filter === category ? "view-filter is-on" : "view-filter"} onClick={() => { setFilter(category); if (scroller.current) scroller.current.scrollLeft = 0; }}>{category}</button>
        ))}
      </div>
      <div className="view-shell">
        <button type="button" className="view-arrow view-arrow-left" aria-label="Scroll photographs left" onClick={() => step(-1)}>‹</button>
        <div
          ref={scroller}
          className="view-rail"
          tabIndex={0}
          aria-label="Rustenburg in view"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
            if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            drag.current = { x: event.clientX, left: scroller.current?.scrollLeft || 0, active: true };
          }}
          onPointerMove={(event) => {
            if (!drag.current.active || !scroller.current) return;
            scroller.current.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
          }}
          onPointerUp={() => { drag.current.active = false; }}
          onPointerLeave={() => { drag.current.active = false; }}
        >
          {shown.map((card) => (
            <article key={card.id} id={`view-${card.id}`} className="view-card">
              <img src={card.src} alt={card.alt} draggable={false} />
              <div>
                <p className="view-kicker">{card.category} · {card.when}</p>
                <h3>{card.label}</h3>
                <p>{card.place}</p>
                <p>{card.note}</p>
                <p className="view-credit">{card.credit}. {card.scope}</p>
                <p className="view-actions">
                  <a href={`/${locale}${card.href}`}>Explore</a>
                  {card.map ? <a href={card.map}>Map of the photograph GPS</a> : null}
                  <button type="button" onClick={() => share(card)}>Share</button>
                  <a href={`/${locale}/saved`}>Saved</a>
                </p>
              </div>
            </article>
          ))}
          <article className="view-card view-card-note">
            <div>
              <p className="view-kicker">Still to be licensed</p>
              <h3>More of the city</h3>
              <p>Mining, dams, food, arts and the city centre are not in this row. A card is added only after an editor approves a photograph that shows that place.</p>
              <p className="view-actions"><a href={`/${locale}/history/rustenburg`}>Send a photograph for review</a></p>
            </div>
          </article>
        </div>
        <button type="button" className="view-arrow view-arrow-right" aria-label="Scroll photographs right" onClick={() => step(1)}>›</button>
      </div>
      {notice ? <p className="mt-2 text-sm" role="status">{notice}</p> : null}
    </div>
  );
}
