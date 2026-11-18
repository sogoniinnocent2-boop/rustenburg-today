"use client";

import { useEffect, useState } from "react";

type Place = { id: string; label: string; latitude: number; longitude: number };
type Forecast = {
  place: string;
  temperature: number;
  feelsLike: number | null;
  condition: string;
  wind: number | null;
  high: number | null;
  low: number | null;
  rain: number | null;
  hours: Array<{ time: string; temperature: number }>;
  days: Array<{ day: string; high: number; low: number }>;
  fetchedAt: string;
  source: string;
};

const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", weekday: "long" });
const dateLine = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", day: "numeric", month: "long", year: "numeric" });
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function LivePanel({ places, initialId }: { places: Place[]; initialId: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [placeId, setPlaceId] = useState(initialId);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const place = places.find((item) => item.id === placeId) || places[0];
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 30_000);
    const onHide = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);
  useEffect(() => {
    if (!place) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ lat: String(place.latitude), lon: String(place.longitude), name: place.label });
    fetch(`/api/v1/weather?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error?.message || "Weather is unavailable");
        setForecast(body.data as Forecast);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setForecast(null);
        setError("Weather is not available right now.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [place, attempt]);
  return (
    <aside className="live-panel" aria-label="Local time and weather">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#DCE2EA]">Rustenburg Today Live</p>
      <p className="mt-2 font-serif text-4xl text-white">{now ? clock.format(now) : "—"}</p>
      <p className="text-sm text-[#F4F6F9]">{now ? `${weekday.format(now)}, ${dateLine.format(now)}` : "Africa/Johannesburg"}</p>
      <p className="text-xs text-[#DCE2EA]">24-hour time · Africa/Johannesburg</p>
      <label className="mt-3 block text-xs text-[#DCE2EA]" htmlFor="weather-place">Weather place</label>
      <select id="weather-place" className="mt-1 w-full rounded-full bg-white/90 px-3 py-1.5 text-sm text-[#101827]" value={place?.id || ""} onChange={(event) => setPlaceId(event.target.value)}>
        {places.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      {loading ? <p className="mt-3 text-sm text-[#F4F6F9]">Checking the forecast…</p> : null}
      {error ? <p className="mt-3 text-sm text-[#F4F6F9]" role="alert">{error} <button type="button" className="underline" onClick={() => setAttempt((value) => value + 1)}>Retry</button></p> : null}
      {forecast && !loading ? (
        <div className="mt-3 text-sm text-[#F4F6F9]">
          <p className="font-serif text-3xl text-white">{Math.round(forecast.temperature)}°</p>
          <p>{forecast.condition}{forecast.feelsLike != null ? ` · feels like ${Math.round(forecast.feelsLike)}°` : ""}</p>
          <p>{forecast.high != null && forecast.low != null ? `High ${Math.round(forecast.high)}° · Low ${Math.round(forecast.low)}°` : ""}{forecast.wind != null ? ` · Wind ${Math.round(forecast.wind)} km/h` : ""}{forecast.rain != null ? ` · Rain ${forecast.rain}%` : ""}</p>
          {forecast.hours.length ? <p className="mt-2">{forecast.hours.map((hour) => `${hour.time} ${Math.round(hour.temperature)}°`).join(" · ")}</p> : null}
          {forecast.days.length ? <p className="mt-1">{forecast.days.map((day) => `${day.day} ${Math.round(day.high)}/${Math.round(day.low)}`).join(" · ")}</p> : null}
          <p className="mt-2 text-xs text-[#DCE2EA]">{forecast.source} · updated {forecast.fetchedAt.slice(11, 16)} UTC</p>
        </div>
      ) : null}
    </aside>
  );
}
