"use client";

import { useRouter } from "next/navigation";

export type DeskSwitcherItem = {
  slug: string;
  label: string;
  division: string;
};

export function DeskSwitcher({
  locale,
  active,
  desks,
}: {
  locale: string;
  active: string;
  desks: DeskSwitcherItem[];
}) {
  const router = useRouter();
  const grouped = new Map<string, DeskSwitcherItem[]>();
  for (const desk of desks) {
    const list = grouped.get(desk.division) || [];
    list.push(desk);
    grouped.set(desk.division, list);
  }

  return (
    <div className="mb-6 space-y-3" aria-label="Department desk switcher">
      <label className="block text-sm font-semibold">
        Switch department desk
        <select
          className="mt-1 w-full max-w-xl rounded-2xl border border-white/70 bg-white/80 px-3 py-2 text-sm font-normal text-graphite backdrop-blur dark:border-white/15 dark:bg-white/10 dark:text-cloud"
          value={active}
          onChange={(event) => {
            const next = event.target.value;
            if (next && next !== active) router.push(`/${locale}/department/${next}`);
          }}
        >
          {[...grouped.entries()].map(([division, items]) => (
            <optgroup key={division} label={division}>
              {items.map((desk) => (
                <option key={desk.slug} value={desk.slug}>
                  {desk.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="text-sm text-muted">
        {desks.length} desks on this login · content stays separate per department · your name stays on every action.
      </p>
    </div>
  );
}
