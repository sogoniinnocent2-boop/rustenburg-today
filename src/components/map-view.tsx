"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mapReportAction } from "@/server/actions";

export type MapPoint = {
  id: string;
  title: string;
  summary: string;
  category: string;
  latitude: number;
  longitude: number;
  source: string;
  sourceType: string;
  sourceId: string;
  verified: boolean;
};

const CATEGORIES = ["business", "restaurant", "event", "accommodation", "property", "school", "clinic", "pharmacy", "transport", "tourism", "shop", "service", "traffic", "alert"];

export function MapView({ points, locale, signedIn }: { points: MapPoint[]; locale: string; signedIn: boolean }) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void; setView: (center: [number, number], zoom: number) => void } | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState<"map" | "list">("map");
  const [selected, setSelected] = useState<string | null>(null);
  const [near, setNear] = useState<{ latitude: number; longitude: number } | null>(null);
  const [zoom, setZoom] = useState(12);
  const selectRef = useRef(setSelected);
  selectRef.current = setSelected;

  const visible = useMemo(() => {
    return points.filter((point) => {
      if (category && point.category !== category) return false;
      if (query && !`${point.title} ${point.summary}`.toLowerCase().includes(query.toLowerCase())) return false;
      if (near && distance(near.latitude, near.longitude, point.latitude, point.longitude) > 20) return false;
      return point.verified;
    });
  }, [points, category, query, near]);

  const chosen = visible.find((point) => point.id === selected) || null;

  useEffect(() => {
    let map: { remove: () => void } | null = null;
    let cancelled = false;
    if (mode !== "map") return;
    (async () => {
      const leaflet = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !node.current) return;
      const view = leaflet.map(node.current).setView([-25.6544, 27.2429], 12);
      if (cancelled) {
        view.remove();
        return;
      }
      map = view;
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(view);
      view.on("zoomend", () => setZoom(view.getZoom()));
      const groups = cluster(visible, view.getZoom());
      for (const group of groups) {
        if (group.points.length > 1) {
          leaflet.circleMarker([group.latitude, group.longitude], { radius: 14, color: "#07111f", fillColor: "#1d4e89", fillOpacity: 0.9 })
            .addTo(view)
            .bindTooltip(`${group.points.length} places`)
            .on("click", () => view.setView([group.latitude, group.longitude], Math.min(view.getZoom() + 2, 16)));
        } else {
          const point = group.points[0];
          leaflet.circleMarker([point.latitude, point.longitude], { radius: 8, color: "#07111f", fillColor: "#e7eef8", fillOpacity: 0.95 })
            .addTo(view)
            .on("click", () => selectRef.current(point.id));
        }
      }
      mapRef.current = view;
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [visible, mode]);

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap gap-2 p-3">
        <label className="sr-only" htmlFor="place-search">Search places</label>
        <input id="place-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search places" className="min-w-40 flex-1 rounded-full border border-white/70 bg-white/70 px-3 py-2 text-graphite" />
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category" className="rounded-full border border-white/70 bg-white/70 px-3 py-2 text-graphite">
          <option value="">All categories</option>
          {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" className="rounded-full bg-forest px-3 py-2 text-sm text-cloud" onClick={() => {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition((position) => {
            setNear({ latitude: position.coords.latitude, longitude: position.coords.longitude });
            mapRef.current?.setView([position.coords.latitude, position.coords.longitude], 13);
          });
        }}>Near me</button>
        <button type="button" className="rounded-full border px-3 py-2 text-sm" onClick={() => setMode(mode === "map" ? "list" : "map")}>{mode === "map" ? "List" : "Map"}</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        {mode === "map" ? <div ref={node} className="map-canvas h-[32rem] w-full overflow-hidden rounded-[2rem] border border-white/40" role="region" aria-label="Rustenburg map" /> : (
          <ul className="glass-card max-h-[32rem] space-y-1 overflow-auto p-3">
            {visible.length ? visible.map((point) => (
              <li key={point.id}><button type="button" className="nav-link w-full text-left" onClick={() => setSelected(point.id)}><span className="block font-semibold">{point.title}</span><span className="text-xs uppercase text-emerald">{point.category}</span></button></li>
            )) : <li className="p-4 text-sm text-muted">No verified places match.</li>}
          </ul>
        )}
        <aside className="glass-card p-4">
          {chosen ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald">{chosen.verified ? "Verified" : "Unverified"} · {chosen.category}</p>
              <h2 className="mt-2 font-serif text-3xl text-forest">{chosen.title}</h2>
              <p className="mt-2 text-sm">{chosen.summary}</p>
              <p className="mt-2 text-xs text-muted">Source: {chosen.source}</p>
              <a className="mt-3 inline-block text-sm font-semibold" href={`https://www.openstreetmap.org/directions?to=${chosen.latitude}%2C${chosen.longitude}`}>Directions</a>
              {profileHref(locale, chosen) ? <a className="mt-2 block text-sm font-semibold" href={profileHref(locale, chosen) || "#"}>Open place</a> : null}
              {signedIn ? (
                <form action={mapReportAction} className="mt-4 space-y-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="point" value={chosen.id} />
                  <label className="block text-sm font-semibold">Report incorrect information<textarea name="note" required minLength={8} className="mt-1 w-full rounded-2xl border border-white/70 bg-white/70 px-3 py-2 font-normal" /></label>
                  <button className="rounded-full bg-forest px-3 py-2 text-sm text-cloud">Send report</button>
                </form>
              ) : <p className="mt-4 text-sm"><a href={`/${locale}/auth/sign-in`}>Sign in</a> to report incorrect information.</p>}
            </div>
          ) : <p className="text-sm text-muted">Choose a marker or a place in the list. Only verified, non-sensitive places are shown. The base map is OpenStreetMap.</p>}
          <p className="mt-4 text-xs text-muted">{visible.length} places · zoom {zoom}</p>
        </aside>
      </div>
    </div>
  );
}

function profileHref(locale: string, point: MapPoint): string | null {
  if (point.sourceType === "business") return `/${locale}/business/${point.sourceId}`;
  if (point.sourceType === "event") return `/${locale}/events/${point.sourceId}`;
  if (point.sourceType === "property") return `/${locale}/property/${point.sourceId}`;
  if (point.sourceType === "food") return `/${locale}/food/${point.sourceId}`;
  return null;
}

function distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cluster(points: MapPoint[], zoom: number): Array<{ latitude: number; longitude: number; points: MapPoint[] }> {
  if (zoom >= 15) return points.map((point) => ({ latitude: point.latitude, longitude: point.longitude, points: [point] }));
  const digits = zoom < 12 ? 1 : 2;
  const groups = new Map<string, MapPoint[]>();
  for (const point of points) {
    const key = `${point.latitude.toFixed(digits)}:${point.longitude.toFixed(digits)}`;
    groups.set(key, [...(groups.get(key) || []), point]);
  }
  return [...groups.values()].map((group) => ({
    latitude: group.reduce((sum, point) => sum + point.latitude, 0) / group.length,
    longitude: group.reduce((sum, point) => sum + point.longitude, 0) / group.length,
    points: group,
  }));
}
