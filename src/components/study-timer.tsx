"use client";

import { useEffect, useState } from "react";

export function StudyTimer({ action, locale }: { action: (form: FormData) => void; locale: string }) {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [length, setLength] = useState(25);

  useEffect(() => {
    if (!running) return;
    if (seconds <= 0) {
      setRunning(false);
      const form = new FormData();
      form.set("locale", locale);
      form.set("minutes", String(length));
      action(form);
      return;
    }
    const timer = window.setTimeout(() => setSeconds((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [running, seconds, action, locale, length]);

  const label = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="glass-card space-y-3 p-4">
      <p className="font-serif text-4xl" aria-live="polite">{label}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-[#101827] px-4 py-2 text-sm text-[#F5F7FA]" onClick={() => setRunning(true)}>Start</button>
        <button type="button" className="rounded-full border px-4 py-2 text-sm" onClick={() => { setLength(5); setSeconds(5 * 60); setRunning(false); }}>5 minutes</button>
        <button type="button" className="rounded-full border px-4 py-2 text-sm" onClick={() => { setLength(25); setSeconds(25 * 60); setRunning(false); }}>25 minutes</button>
      </div>
      <p className="text-sm">A session is recorded only when this timer reaches zero. News, jobs and lessons stay free.</p>
    </div>
  );
}
