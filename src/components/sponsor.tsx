"use client";

import { useEffect, useRef, useState } from "react";

type Ad = { id: string; title: string; alt_text: string; destination_url: string | null };

export function ViewableAd({ ad }: { ad: Ad }) {
  const node = useRef<HTMLAnchorElement>(null);
  const sent = useRef(false);
  useEffect(() => {
    const element = node.current;
    if (!element) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.5 || sent.current) return;
      timer = setTimeout(() => {
        if (sent.current) return;
        sent.current = true;
        void fetch(`/api/v1/ads/${ad.id}/impression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ viewable: true }) });
      }, 1000);
    }, { threshold: [0.5] });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [ad.id]);
  return (
    <a ref={node} href={`/api/v1/ads/${ad.id}/click`} className="glass-card lift block p-5">
      <span className="text-xs font-bold uppercase tracking-widest text-forest">Sponsored</span>
      <span className="mt-2 block font-serif text-2xl">{ad.title}</span>
      <span className="mt-1 block text-sm">{ad.alt_text}</span>
    </a>
  );
}

export function PromoOffer() {
  const [ad, setAd] = useState<Ad | null>(null);
  const [open, setOpen] = useState(false);
  const counted = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/ads/popup?consent=yes").then(async (response) => {
      const body = await response.json();
      const campaign = body?.data?.campaign as Ad | null;
      if (!cancelled && campaign?.id) {
        setAd(campaign);
        setOpen(true);
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!open || !ad || counted.current) return;
    const timer = setTimeout(() => {
      counted.current = true;
      void fetch(`/api/v1/ads/${ad.id}/impression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ viewable: true }) });
      void fetch("/api/v1/ads/popup/shown", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ad.id }) });
    }, 1000);
    return () => clearTimeout(timer);
  }, [open, ad]);
  if (!open || !ad) return null;
  return (
    <div className="promo-pop fixed bottom-4 right-4 z-30 w-[min(22rem,calc(100vw-2rem))]" role="dialog" aria-label="Sponsored promotion">
      <article className="glass-card p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald">Sponsored</p>
          <button type="button" className="text-sm" onClick={() => setOpen(false)}>Close</button>
        </div>
        <h2 className="mt-2 font-serif text-2xl text-forest">{ad.title}</h2>
        <p className="mt-1 text-sm text-muted">{ad.alt_text}</p>
        {ad.destination_url ? <a className="mt-3 inline-block text-sm font-semibold" href={`/api/v1/ads/${ad.id}/click`}>Open promotion</a> : null}
      </article>
    </div>
  );
}
