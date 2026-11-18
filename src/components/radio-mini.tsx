"use client";

import { useState } from "react";

export function RadioMini({ name, state, stream, programme, reason }: { name: string; state: "offline" | "on_air"; stream: string | null; programme: string | null; reason: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <section className="glass-card p-5" aria-label="Rustenburg Today Radio">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">Rustenburg Today Radio</p>
      <h2 className="mt-1 font-serif text-3xl">{name}</h2>
      <p className="mt-2 text-sm">{programme ? `Scheduled now: ${programme}` : "No programme is scheduled for this minute."}</p>
      {state === "on_air" && stream && !failed ? (
        <audio className="mt-3 w-full" controls src={stream} onError={() => setFailed(true)} />
      ) : (
        <p className="mt-3 text-sm" role="status">{failed ? "The stream did not start. The station is shown as offline until it plays." : reason}</p>
      )}
      <p className="mt-2 text-xs text-muted">{state === "on_air" ? "Authorised stream" : "Not on air"}</p>
    </section>
  );
}
