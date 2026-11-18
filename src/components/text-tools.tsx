"use client";

import { useState } from "react";

export function TextTools() {
  const [text, setText] = useState("");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  function download(name: string, body: string, type: string) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }
  function csv() {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed) || !parsed.length || typeof parsed[0] !== "object" || parsed[0] === null) throw new Error("Paste a JSON array of objects");
    const rows = parsed as Array<Record<string, unknown>>;
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(",")];
    for (const row of rows) lines.push(headers.map((key) => JSON.stringify(row[key] ?? "")).join(","));
    download("table.csv", lines.join("\n"), "text/csv");
  }
  return (
    <div className="space-y-3">
      <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-40 w-full rounded-2xl border px-3 py-2" placeholder="Paste text, or a JSON array of objects" />
      <p className="text-sm">{words} words · {text.length} characters{words ? ` · about ${Math.max(1, Math.round(words / 200))} minute${words > 200 ? "s" : ""} to read` : ""}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full border px-4 py-2 text-sm" onClick={() => download("notes.txt", text, "text/plain")}>Download text</button>
        <button type="button" className="rounded-full border px-4 py-2 text-sm" onClick={() => { try { csv(); } catch { window.alert("Paste a JSON array of objects, such as [{\"name\":\"A\"}]"); } }}>JSON array to CSV</button>
      </div>
      <p className="text-sm">These tools run in the browser. PDF, Word and image conversion are not connected. No AI provider is connected, so nothing here rewrites your text.</p>
    </div>
  );
}
