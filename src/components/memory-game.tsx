"use client";

import { useEffect, useState } from "react";

const WORDS = ["Rustenburg", "Platinum", "Magalies", "Kloof", "Market", "Sunset"];

export function MemoryGame({ action, locale }: { action: (form: FormData) => void; locale: string }) {
  const [deck, setDeck] = useState(() => WORDS.flatMap((word) => [{ id: `${word}-a`, word }, { id: `${word}-b`, word }]));
  const [open, setOpen] = useState<number[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [started] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDeck((current) => [...current].sort(() => Math.random() - 0.5));
  }, []);

  function flip(index: number) {
    if (done || open.includes(index) || known.includes(deck[index].word) || open.length === 2) return;
    const next = [...open, index];
    setOpen(next);
    if (next.length === 2) {
      const attempt = moves + 1;
      setMoves(attempt);
      const [first, second] = next;
      if (deck[first].word === deck[second].word) {
        const matched = [...known, deck[first].word];
        setKnown(matched);
        setOpen([]);
        if (matched.length === WORDS.length) {
          setDone(true);
          const form = new FormData();
          form.set("locale", locale);
          form.set("moves", String(attempt));
          form.set("seconds", String(Math.max(1, Math.round((Date.now() - started) / 1000))));
          action(form);
        }
      } else {
        window.setTimeout(() => setOpen([]), 700);
      }
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm">Match the pairs. Moves: {moves}. {done ? "Round recorded." : "The board uses words, not colour alone."}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {deck.map((card, index) => {
          const shown = open.includes(index) || known.includes(card.word);
          return (
            <button key={card.id} type="button" className="h-16 rounded-2xl border bg-white/70 text-sm font-semibold" onClick={() => flip(index)} aria-pressed={shown}>
              {shown ? card.word : "Card"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
