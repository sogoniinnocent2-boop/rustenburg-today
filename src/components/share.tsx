"use client";

import { useState } from "react";

export function ShareLink({ url, title, className }: { url: string; title: string; className: string }) {
  const [label, setLabel] = useState("Share");
  async function share() {
    const absolute = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: absolute });
        setLabel("Shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(absolute);
      setLabel("Copied");
    } catch {
      setLabel("Copy the address from the browser");
    }
  }
  return <button type="button" className={className} aria-live="polite" onClick={() => void share()}>{label}</button>;
}
