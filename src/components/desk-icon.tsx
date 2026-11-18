import type { DeskGroup } from "@/lib/desk-catalog";

const glyph: Record<DeskGroup, string> = {
  study: "M6 8h14v16H6z M9 12h8 M9 16h6",
  youth: "M8 20c1-4 4-6 8-6s7 2 8 6 M16 8a3 3 0 1 1 0 6a3 3 0 0 1 0-6",
  stories: "M7 6h12l6 6v14H7z M18 6v6h6",
  people: "M8 14a3 3 0 1 1 0-6a3 3 0 0 1 0 6 M20 14a3 3 0 1 1 0-6a3 3 0 0 1 0 6 M5 24c.8-3 3-5 6-5s5 2 6 5 M15 24c.8-3 3-5 6-5s5 2 6 5",
  business: "M6 26V12l10-6 10 6v14 M12 26v-7h8v7",
  income: "M8 16h16 M12 12h8a4 4 0 0 1 0 8h-8",
  city: "M6 26V12l6-4v18 M14 26V8l12 6v12 M18 16h4 M18 20h4",
};

export function DeskIcon({ group }: { group: DeskGroup }) {
  return (
    <span className={`desk-icon desk-icon-${group}`} aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path d={glyph[group]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
