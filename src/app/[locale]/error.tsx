"use client";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="feedback glass-card max-w-xl p-6">
      <h1 className="font-serif text-3xl">This page did not load</h1>
      <p className="mt-3 text-sm">{error.message || "The request failed before a page could be shown."}</p>
      <button type="button" className="mt-4 rounded-full bg-[#101827] px-4 py-2 text-sm font-semibold text-[#F5F7FA]" onClick={() => reset()}>Try again</button>
    </div>
  );
}
