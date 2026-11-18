"use client";

import { useEffect, useState } from "react";

export function SearchBox({ locale, initial }: { locale: string; initial: string }) {
  const [query, setQuery] = useState(initial);
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setItems([]);
      return;
    }
    const handle = setTimeout(() => {
      void fetch(`/api/v1/search/suggest?q=${encodeURIComponent(term)}`)
        .then((response) => response.json())
        .then((body: { data?: string[] }) => setItems(Array.isArray(body.data) ? body.data : []))
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);
  return (
    <form action={`/${locale}/search`} className="mb-6 flex gap-2">
      <label className="sr-only" htmlFor="q">Search</label>
      <input id="q" name="q" value={query} list="search-suggestions" onChange={(event) => setQuery(event.target.value)} className="w-full rounded-full border border-white/70 bg-white/70 px-4 py-3 text-graphite" />
      <datalist id="search-suggestions">{items.map((item) => <option key={item} value={item} />)}</datalist>
      <button className="rounded-full bg-forest px-4 font-semibold text-cloud">Search</button>
    </form>
  );
}
