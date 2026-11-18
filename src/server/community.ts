import { containsSensitiveIdentity } from "@/lib/text";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { requirePermission } from "./permissions";
import { audit, indexDocument, rateLimit, removeIndex } from "./store";
import { notify } from "./alerts";

const POST_TYPES = ["update", "discussion", "question", "article", "poll", "safety_report", "lost_found", "tip"];

export function embedVideo(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0] || "";
      return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v") || "";
      return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
      return /^\d{6,12}$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function createPost(user: SessionUser, input: { body: string; postType?: string; locationId?: string | null; pollOptions?: string[]; media?: Array<{ url: string; alt?: string }>; mediaUrl?: string | null; videoUrl?: string | null; rightsConfirmed?: boolean; draft?: boolean }): { id: string; status: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "community.post");
  rateLimit(`post:${user.id}`, 30, 60 * 60 * 1000);
  const body = input.body.trim();
  const postType = POST_TYPES.includes(input.postType || "") ? input.postType! : "update";
  const limit = postType === "article" ? 12000 : 4000;
  if (body.length < 2 || body.length > limit) throw new AppError(400, `Write between 2 and ${limit} characters`);
  if (containsSensitiveIdentity(body)) throw new AppError(400, "Remove identity numbers before posting");
  if (postType === "poll" && (input.pollOptions || []).filter((option) => option.trim()).length < 2) throw new AppError(400, "A poll needs at least two options");
  if (postType === "tip" && !input.rightsConfirmed) throw new AppError(400, "Confirm you have the right to submit this report");
  const pictures = [...(input.media || [])];
  if (input.mediaUrl) pictures.unshift({ url: input.mediaUrl });
  if (pictures.length > 4) throw new AppError(400, "A post can carry four photographs");
  const embed = input.videoUrl ? embedVideo(input.videoUrl) : null;
  if (input.videoUrl && !embed) throw new AppError(400, "A video post needs an https YouTube or Vimeo link. This is one post, not a video feed.");
  const id = newId();
  const stamp = new Date().toISOString();
  const held = !input.draft && (postType === "safety_report" || postType === "tip" || user.isMinor || /\b(murder|killed|rape|sexual|accused|fraud|corrupt|assault|kidnap)\b/i.test(body));
  const status = input.draft ? "draft" : held ? "pending" : "published";
  transaction(() => {
    run(
      "INSERT INTO community_posts (id, author_id, post_type, body, location_id, visibility, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'public', ?, ?, ?)",
      id,
      user.id,
      postType,
      body,
      input.locationId || null,
      status,
      stamp,
      stamp,
    );
    pictures.forEach((picture, index) => run("INSERT INTO post_media (id, post_id, media_url, media_type, position, alt_text) VALUES (?, ?, ?, 'image', ?, ?)", newId(), id, picture.url, index, (picture.alt || "").slice(0, 180)));
    if (embed) run("INSERT INTO post_media (id, post_id, media_url, media_type, position, alt_text) VALUES (?, ?, ?, 'embed', ?, ?)", newId(), id, embed, pictures.length, "Embedded video");
    const tags = body.match(/#([a-z0-9_]{2,40})/gi) || [];
    for (const tag of [...new Set(tags.map((item) => item.slice(1).toLowerCase()))]) {
      run("INSERT OR IGNORE INTO post_hashtags (post_id, tag) VALUES (?, ?)", id, tag);
    }
    const mentions = body.match(/@([a-z0-9_]{3,24})/gi) || [];
    for (const mention of [...new Set(mentions.map((item) => item.slice(1).toLowerCase()))]) {
      const person = get<{ user_id: string }>("SELECT user_id FROM profiles WHERE username = ?", mention);
      if (person) {
        run("INSERT OR IGNORE INTO post_mentions (post_id, mentioned_user_id) VALUES (?, ?)", id, person.user_id);
        if (status === "published") notify(person.user_id, "mention", "You were mentioned", body.slice(0, 140), `/community/${id}`);
      }
    }
    if (postType === "poll") {
      const pollId = newId();
      run("INSERT INTO community_polls (id, post_id, question, closes_at) VALUES (?, ?, ?, ?)", pollId, id, body.slice(0, 180), null);
      input.pollOptions!.filter((option) => option.trim()).slice(0, 6).forEach((option, index) => {
        run("INSERT INTO poll_options (id, poll_id, option_text, position) VALUES (?, ?, ?, ?)", newId(), pollId, option.trim().slice(0, 80), index);
      });
    }
  });
  if (status === "published") indexDocument({ entityType: "post", entityId: id, language: user.language, title: body.slice(0, 80), body, publishedAt: stamp });
  audit(user.id, "post.create", "post", id, { status });
  return { id, status };
}

export function listPendingPosts(): Array<{ id: string; body: string; post_type: string; display_name: string; created_at: string }> {
  ensureReady();
  return all("SELECT p.id, p.body, p.post_type, pr.display_name, p.created_at FROM community_posts p JOIN profiles pr ON pr.user_id = p.author_id WHERE p.status = 'pending' AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 30");
}

export function listPosts(viewerId?: string | null, page = 1, mode: "discover" | "following" = "discover"): { items: Array<Record<string, unknown>>; total: number } {
  ensureReady();
  const pageSize = 12;
  const following = mode === "following";
  const rows = all<Record<string, unknown>>(
    `SELECT p.id, p.body, p.post_type, p.created_at, p.status, pr.display_name, pr.username, pr.avatar_url, l.name as location_name,
            (SELECT COUNT(*) FROM post_reactions r WHERE r.post_id = p.id) as reactions,
            (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id AND c.status = 'published') as comments
     FROM community_posts p
     JOIN profiles pr ON pr.user_id = p.author_id
     LEFT JOIN locations l ON l.id = p.location_id
     WHERE p.status = 'published' AND p.deleted_at IS NULL AND p.visibility = 'public'
       AND (? IS NULL OR p.author_id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = ?))
       AND (? = 0 OR p.author_id IN (SELECT followed_id FROM user_follows WHERE follower_id = ?))
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    viewerId || null,
    viewerId || null,
    following ? 1 : 0,
    viewerId || "",
    pageSize,
    (page - 1) * pageSize,
  );
  const total = get<{ count: number }>(
    `SELECT COUNT(*) as count FROM community_posts p
     WHERE p.status = 'published' AND p.deleted_at IS NULL AND p.visibility = 'public'
       AND (? = 0 OR p.author_id IN (SELECT followed_id FROM user_follows WHERE follower_id = ?))`,
    following ? 1 : 0,
    viewerId || "",
  )?.count ?? 0;
  return { items: rows.map((row) => decorate(row, viewerId)), total };
}

export function listByTag(tag: string, viewerId?: string | null): Array<Record<string, unknown>> {
  ensureReady();
  const clean = tag.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (clean.length < 2) return [];
  const rows = all<Record<string, unknown>>(
    `SELECT p.id, p.body, p.post_type, p.created_at, pr.display_name, pr.username,
            (SELECT COUNT(*) FROM post_reactions r WHERE r.post_id = p.id) as reactions,
            (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id AND c.status = 'published') as comments
     FROM post_hashtags h
     JOIN community_posts p ON p.id = h.post_id
     JOIN profiles pr ON pr.user_id = p.author_id
     WHERE h.tag = ? AND p.status = 'published' AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC LIMIT 30`,
    clean,
  );
  return rows.map((row) => decorate(row, viewerId));
}

export function listDrafts(userId: string): Array<{ id: string; body: string; post_type: string; created_at: string }> {
  ensureReady();
  return all("SELECT id, body, post_type, created_at FROM community_posts WHERE author_id = ? AND status = 'draft' AND deleted_at IS NULL ORDER BY created_at DESC", userId);
}

export function publishDraft(user: SessionUser, postId: string): string {
  ensureReady();
  assertActive(user);
  const post = get<{ body: string; post_type: string; author_id: string }>("SELECT body, post_type, author_id FROM community_posts WHERE id = ? AND status = 'draft' AND deleted_at IS NULL", postId);
  if (!post || post.author_id !== user.id) throw new AppError(404, "Draft not found");
  const held = post.post_type === "safety_report" || post.post_type === "tip" || user.isMinor || /\b(murder|killed|rape|sexual|accused|fraud|corrupt|assault|kidnap)\b/i.test(post.body);
  const status = held ? "pending" : "published";
  const stamp = new Date().toISOString();
  run("UPDATE community_posts SET status = ?, updated_at = ? WHERE id = ?", status, stamp, postId);
  if (status === "published") indexDocument({ entityType: "post", entityId: postId, language: user.language, title: post.body.slice(0, 80), body: post.body, publishedAt: stamp });
  return status;
}

export function isFollowing(viewerId: string, username: string): boolean {
  ensureReady();
  return Boolean(get("SELECT 1 as ok FROM user_follows f JOIN profiles p ON p.user_id = f.followed_id WHERE f.follower_id = ? AND p.username = ?", viewerId, username));
}

export function followCounts(userId: string): { followers: number; following: number } {
  ensureReady();
  return {
    followers: get<{ count: number }>("SELECT COUNT(*) as count FROM user_follows WHERE followed_id = ?", userId)?.count ?? 0,
    following: get<{ count: number }>("SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?", userId)?.count ?? 0,
  };
}

function decorate(row: Record<string, unknown>, viewerId?: string | null): Record<string, unknown> {
  const id = String(row.id);
  return { ...row, poll: pollState(id, viewerId), media: postMedia(id), tags: all<{ tag: string }>("SELECT tag FROM post_hashtags WHERE post_id = ? ORDER BY tag", id).map((item) => item.tag) };
}

function postMedia(postId: string): Array<{ media_url: string; media_type: string; alt_text: string | null }> {
  return all("SELECT media_url, media_type, alt_text FROM post_media WHERE post_id = ? ORDER BY position", postId);
}

function pollState(postId: string, viewerId?: string | null): { question: string; options: Array<{ id: string; text: string; votes: number }>; voted: string | null } | null {
  const poll = get<{ id: string; question: string }>("SELECT id, question FROM community_polls WHERE post_id = ?", postId);
  if (!poll) return null;
  const options = all<{ id: string; option_text: string; votes: number }>(
    `SELECT o.id, o.option_text, (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) as votes
     FROM poll_options o WHERE o.poll_id = ? ORDER BY o.position`,
    poll.id,
  );
  const voted = viewerId ? get<{ option_id: string }>("SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?", poll.id, viewerId)?.option_id ?? null : null;
  return { question: poll.question, options: options.map((option) => ({ id: option.id, text: option.option_text, votes: option.votes })), voted };
}

export function reactToPost(user: SessionUser, postId: string, reaction: string): void {
  ensureReady();
  assertActive(user);
  const kind = ["like", "useful", "support"].includes(reaction) ? reaction : "like";
  const existing = get<{ id: string; reaction_type: string }>("SELECT id, reaction_type FROM post_reactions WHERE post_id = ? AND user_id = ?", postId, user.id);
  if (existing && existing.reaction_type === kind) run("DELETE FROM post_reactions WHERE id = ?", existing.id);
  else if (existing) run("UPDATE post_reactions SET reaction_type = ? WHERE id = ?", kind, existing.id);
  else run("INSERT INTO post_reactions (id, post_id, user_id, reaction_type, created_at) VALUES (?, ?, ?, ?, ?)", newId(), postId, user.id, kind, new Date().toISOString());
}

export function commentOnPost(user: SessionUser, postId: string, body: string, parentId?: string | null): void {
  ensureReady();
  assertActive(user);
  const text = body.trim();
  if (text.length < 1 || text.length > 2000) throw new AppError(400, "Write a shorter comment");
  if (containsSensitiveIdentity(text)) throw new AppError(400, "Remove identity numbers before posting");
  if (!get("SELECT id FROM community_posts WHERE id = ? AND status = 'published'", postId)) throw new AppError(404, "Post not found");
  if (parentId && !get("SELECT id FROM post_comments WHERE id = ? AND post_id = ?", parentId, postId)) throw new AppError(400, "Reply to a comment on this post");
  run(
    "INSERT INTO post_comments (id, post_id, user_id, parent_id, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    postId,
    user.id,
    parentId || null,
    text,
    user.isMinor ? "pending" : "published",
    new Date().toISOString(),
  );
}

export function voteInPoll(user: SessionUser, optionId: string): void {
  ensureReady();
  assertActive(user);
  const option = get<{ poll_id: string }>("SELECT poll_id FROM poll_options WHERE id = ?", optionId);
  if (!option) throw new AppError(404, "Option not found");
  try {
    run("INSERT INTO poll_votes (id, poll_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)", newId(), option.poll_id, optionId, user.id, new Date().toISOString());
  } catch {
    throw new AppError(409, "You have already voted in this poll");
  }
}

export function toggleFollow(user: SessionUser, username: string): boolean {
  ensureReady();
  assertActive(user);
  const other = get<{ user_id: string }>("SELECT user_id FROM profiles WHERE username = ?", username);
  if (!other) throw new AppError(404, "Person not found");
  if (other.user_id === user.id) throw new AppError(400, "You cannot follow yourself");
  if (get("SELECT 1 as ok FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?", user.id, other.user_id)) throw new AppError(403, "Unblock this person first");
  const existing = get("SELECT 1 as ok FROM user_follows WHERE follower_id = ? AND followed_id = ?", user.id, other.user_id);
  if (existing) {
    run("DELETE FROM user_follows WHERE follower_id = ? AND followed_id = ?", user.id, other.user_id);
    return false;
  }
  run("INSERT INTO user_follows (follower_id, followed_id, created_at) VALUES (?, ?, ?)", user.id, other.user_id, new Date().toISOString());
  notify(other.user_id, "follow", "New follower", `${user.displayName} followed you`, `/people/${user.username}`);
  return true;
}

export function blockUser(user: SessionUser, username: string): void {
  ensureReady();
  assertActive(user);
  const other = get<{ user_id: string }>("SELECT user_id FROM profiles WHERE username = ?", username);
  if (!other || other.user_id === user.id) throw new AppError(404, "Person not found");
  run("INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", user.id, other.user_id, new Date().toISOString());
  run("DELETE FROM user_follows WHERE (follower_id = ? AND followed_id = ?) OR (follower_id = ? AND followed_id = ?)", user.id, other.user_id, other.user_id, user.id);
}

export function moderatePost(user: SessionUser, postId: string, action: "publish" | "remove"): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "community.moderate");
  if (action === "remove") {
    run("UPDATE community_posts SET status = 'removed', deleted_at = ?, updated_at = ? WHERE id = ?", new Date().toISOString(), new Date().toISOString(), postId);
    removeIndex("post", postId);
  } else {
    const stamp = new Date().toISOString();
    const post = get<{ body: string }>("SELECT body FROM community_posts WHERE id = ? AND deleted_at IS NULL", postId);
    if (!post) throw new AppError(404, "Post not found");
    run("UPDATE community_posts SET status = 'published', updated_at = ? WHERE id = ?", stamp, postId);
    indexDocument({ entityType: "post", entityId: postId, language: "en", title: post.body.slice(0, 80), body: post.body, publishedAt: stamp });
  }
  run("INSERT INTO moderation_actions (id, moderator_id, content_type, content_id, action, reason, created_at) VALUES (?, ?, 'post', ?, ?, ?, ?)", newId(), user.id, postId, action, action, new Date().toISOString());
  audit(user.id, `post.${action}`, "post", postId);
}

export function getPost(id: string, viewerId?: string | null): Record<string, unknown> | null {
  ensureReady();
  const row = get<Record<string, unknown>>(
    `SELECT p.*, pr.display_name, pr.username FROM community_posts p JOIN profiles pr ON pr.user_id = p.author_id
     WHERE p.id = ? AND p.deleted_at IS NULL AND p.status = 'published'`,
    id,
  );
  if (!row) return null;
  const comments = all("SELECT c.id, c.parent_id, c.body, c.created_at, pr.display_name, pr.username FROM post_comments c JOIN profiles pr ON pr.user_id = c.user_id WHERE c.post_id = ? AND c.status = 'published' AND c.deleted_at IS NULL ORDER BY c.created_at", id);
  const mine = viewerId ? get<{ reaction_type: string }>("SELECT reaction_type FROM post_reactions WHERE post_id = ? AND user_id = ?", id, viewerId) : null;
  const counts = all<{ reaction_type: string; total: number }>("SELECT reaction_type, COUNT(*) as total FROM post_reactions WHERE post_id = ? GROUP BY reaction_type", id);
  return { ...row, comments, reaction: mine?.reaction_type || "", reactionCounts: Object.fromEntries(counts.map((item) => [item.reaction_type, item.total])), poll: pollState(id, viewerId), media: postMedia(id), tags: all<{ tag: string }>("SELECT tag FROM post_hashtags WHERE post_id = ? ORDER BY tag", id).map((item) => item.tag) };
}
