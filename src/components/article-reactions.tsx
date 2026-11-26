"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ARTICLE_REACTIONS, type ArticleReactionId } from "@/lib/reactions";
import { reactionAction } from "@/server/actions";

type Props = {
  locale: string;
  articleId: string;
  back: string;
  signedIn: boolean;
  mine: ArticleReactionId | "";
  total: number;
  counts: Record<ArticleReactionId, number>;
};

export function ArticleReactions({ locale, articleId, back, signedIn, mine, total, counts }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const active = ARTICLE_REACTIONS.find((item) => item.id === mine);

  function submit(reaction: ArticleReactionId) {
    const data = new FormData();
    data.set("locale", locale);
    data.set("kind", "article");
    data.set("id", articleId);
    data.set("reaction", reaction);
    data.set("return", back);
    setOpen(false);
    startTransition(() => {
      void reactionAction(data);
    });
  }

  const summary = ARTICLE_REACTIONS.filter((item) => counts[item.id] > 0);

  return (
    <div className="reaction-panel">
      <div className="reaction-summary" aria-live="polite">
        {summary.length ? (
          <>
            <span className="reaction-summary-glyphs" aria-hidden="true">
              {summary.slice(0, 3).map((item) => (
                <span key={item.id}>{item.glyph}</span>
              ))}
            </span>
            <span>{total} {total === 1 ? "reaction" : "reactions"}</span>
          </>
        ) : (
          <span>Be the first to react</span>
        )}
      </div>

      {!signedIn ? (
        <p className="reaction-signin">
          <Link href={`/${locale}/auth/sign-in?next=${encodeURIComponent(back.replace(`/${locale}`, "") || "/news")}`}>Sign in</Link> to react like on Facebook.
        </p>
      ) : (
        <div
          className="reaction-controls"
          onMouseLeave={() => setOpen(false)}
        >
          <div className={`reaction-tray ${open ? "is-open" : ""}`} role="group" aria-label="Choose a reaction">
            {ARTICLE_REACTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`reaction-choice ${mine === item.id ? "is-active" : ""}`}
                aria-label={`${item.label}${counts[item.id] ? `, ${counts[item.id]}` : ""}`}
                aria-pressed={mine === item.id}
                disabled={pending}
                onClick={() => submit(item.id)}
                title={item.label}
              >
                <span aria-hidden="true">{item.glyph}</span>
                <span className="reaction-choice-label">{item.label}</span>
                {counts[item.id] ? <span className="reaction-choice-count">{counts[item.id]}</span> : null}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`reaction-main ${mine ? "is-active" : ""}`}
            aria-expanded={open}
            disabled={pending}
            onMouseEnter={() => setOpen(true)}
            onFocus={() => setOpen(true)}
            onClick={() => {
              if (open) submit(mine || "like");
              else setOpen(true);
            }}
          >
            <span aria-hidden="true">{active?.glyph || "👍"}</span>
            <span>{active?.label || "Like"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
