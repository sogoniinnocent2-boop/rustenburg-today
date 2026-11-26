export const ARTICLE_REACTIONS = [
  { id: "like", label: "Like", glyph: "👍" },
  { id: "love", label: "Love", glyph: "❤️" },
  { id: "care", label: "Care", glyph: "🤗" },
  { id: "haha", label: "Haha", glyph: "😆" },
  { id: "wow", label: "Wow", glyph: "😮" },
  { id: "sad", label: "Sad", glyph: "😢" },
  { id: "angry", label: "Angry", glyph: "😡" },
] as const;

export type ArticleReactionId = (typeof ARTICLE_REACTIONS)[number]["id"];

export function isArticleReaction(value: string): value is ArticleReactionId {
  return ARTICLE_REACTIONS.some((item) => item.id === value);
}
