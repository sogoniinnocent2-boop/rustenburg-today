import type { ReactNode } from "react";

export function ExploreIcon({ name }: { name: string }) {
  return (
    <span className={`xi-wrap xi-${name}`}>
      <svg className="xi" viewBox="0 0 32 32" aria-hidden="true">
        {paths[name] || paths.news}
      </svg>
    </span>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const paths: Record<string, ReactNode> = {
  news: <><path {...stroke} d="M8 7h12a3 3 0 0 1 3 3v14H11a3 3 0 0 1-3-3V7z" /><path {...stroke} d="M11 12h8M11 16h8M11 20h5" /></>,
  business: <><path {...stroke} d="M7 26V12l9-5 9 5v14" /><path {...stroke} d="M13 26v-6h6v6M7 16h18" /></>,
  market: <><path {...stroke} d="M7 12h18l-1.5 12h-15z" /><path {...stroke} d="M11 12a5 5 0 0 1 10 0" /></>,
  work: <><path {...stroke} d="M10 13h12v11H10z" /><path {...stroke} d="M13 13V10h6v3M10 18h12" /></>,
  events: <><path {...stroke} d="M9 8h14v16H9z" /><path {...stroke} d="M9 13h14M13 6v4M19 6v4" /></>,
  property: <><path {...stroke} d="M6 15 16 7l10 8" /><path {...stroke} d="M9 14v10h14V14" /></>,
  learn: <><path {...stroke} d="M6 11 16 7l10 4-10 4z" /><path {...stroke} d="M10 13.5V20c2 2 10 2 12 0v-6.5" /></>,
  places: <><path {...stroke} d="M16 27s8-7 8-13a8 8 0 1 0-16 0c0 6 8 13 8 13z" /><circle {...stroke} cx="16" cy="14" r="2.4" /></>,
  food: <><path {...stroke} d="M9 14h14v3a7 7 0 0 1-14 0z" /><path {...stroke} d="M12 14V8M16 14V7M20 14V8" /></>,
  community: <><circle {...stroke} cx="11" cy="12" r="2.2" /><circle {...stroke} cx="21" cy="12" r="2.2" /><path {...stroke} d="M6.5 22c.6-3 2.4-4.5 4.5-4.5s3.9 1.5 4.5 4.5M16.5 22c.6-3 2.4-4.5 4.5-4.5s3.9 1.5 4.5 4.5" /></>,
  heritage: <><path {...stroke} d="M8 26h16M10 26V14M16 26V14M22 26V14M7 14h18L16 7z" /></>,
  tools: <><circle {...stroke} cx="16" cy="16" r="3" /><path {...stroke} d="M16 6v3M16 23v3M6 16h3M23 16h3M8.8 8.8l2.1 2.1M21.1 21.1l2.1 2.1M23.2 8.8l-2.1 2.1M10.9 21.1l-2.1 2.1" /></>,
  watch: <><circle {...stroke} cx="16" cy="16" r="8" /><path {...stroke} d="M16 12v5l3 2" /></>,
  story: <><path {...stroke} d="M8 6h11l5 5v15H8z" /><path {...stroke} d="M18 6v6h6M12 16h8M12 20h6" /></>,
  safety: <><path {...stroke} d="M16 6 26 10v7c0 6-4.2 9-10 11-5.8-2-10-5-10-11v-7z" /><path {...stroke} d="M12.5 16.5 15 19l5-5.5" /></>,
  desks: <><path {...stroke} d="M7 8h7v7H7zM18 8h7v7h-7zM7 19h7v7H7zM18 19h7v7h-7z" /></>,
};
