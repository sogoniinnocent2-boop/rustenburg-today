import { safeExternalUrl, videoEmbed } from "@/lib/text";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { all, get, newId, run } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { requirePermission } from "./permissions";
import { audit, indexDocument } from "./store";
import { uniqueSlug } from "./editorial";

export function createPodcast(user: SessionUser, input: { title: string; description: string; programmeKey?: string }): { id: string; slug: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "media.create");
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 3 || description.length < 12) throw new AppError(400, "Add a title and description");
  const id = newId();
  const slug = uniqueSlug("podcasts", title);
  const stamp = new Date().toISOString();
  run(
    "INSERT INTO podcasts (id, creator_id, title, slug, description, programme_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)",
    id,
    user.id,
    title,
    slug,
    description,
    input.programmeKey || null,
    stamp,
    stamp,
  );
  indexDocument({ entityType: "podcast", entityId: slug, language: "en", title, body: description, publishedAt: stamp });
  audit(user.id, "podcast.create", "podcast", id);
  return { id, slug };
}

export function addEpisode(user: SessionUser, podcastId: string, input: { title: string; description: string; audioUrl?: string; transcript?: string; duration?: number; downloadAllowed?: boolean }): { id: string } {
  ensureReady();
  assertActive(user);
  const show = get<{ creator_id: string; slug: string }>("SELECT creator_id, slug FROM podcasts WHERE id = ?", podcastId);
  if (!show) throw new AppError(404, "Podcast not found");
  if (show.creator_id !== user.id) requirePermission(user.id, "media.moderate");
  if (!input.audioUrl?.trim()) throw new AppError(400, "Add an audio address before publishing an episode");
  const id = newId();
  const slug = uniqueSlug("podcasts", input.title).slice(0, 60);
  const stamp = new Date().toISOString();
  run(
    `INSERT INTO podcast_episodes (id, podcast_id, title, slug, description, audio_url, transcript, duration_seconds, download_allowed, published_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
    id,
    podcastId,
    input.title.trim(),
    `${slug}-${id.slice(0, 8)}`,
    input.description.trim(),
    input.audioUrl.trim(),
    input.transcript || null,
    input.duration || 0,
    input.downloadAllowed ? 1 : 0,
    stamp,
    stamp,
    stamp,
  );
  indexDocument({ entityType: "episode", entityId: id, language: "en", title: input.title.trim(), body: input.description, publishedAt: stamp });
  return { id };
}

export function rememberPlayback(user: SessionUser, mediaType: string, mediaId: string, seconds: number): void {
  ensureReady();
  assertActive(user, { verified: false });
  run(
    `INSERT INTO media_playback (id, user_id, media_type, media_id, progress_seconds, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, media_type, media_id) DO UPDATE SET progress_seconds = excluded.progress_seconds, updated_at = excluded.updated_at`,
    newId(),
    user.id,
    mediaType,
    mediaId,
    Math.max(0, Math.floor(seconds)),
    new Date().toISOString(),
  );
}

export function followMedia(user: SessionUser, mediaType: string, mediaId: string): void {
  ensureReady();
  assertActive(user);
  const existing = get("SELECT id FROM media_subscriptions WHERE user_id = ? AND media_type = ? AND media_id = ?", user.id, mediaType, mediaId);
  if (existing) run("DELETE FROM media_subscriptions WHERE user_id = ? AND media_type = ? AND media_id = ?", user.id, mediaType, mediaId);
  else run("INSERT INTO media_subscriptions (id, user_id, media_type, media_id, created_at) VALUES (?, ?, ?, ?, ?)", newId(), user.id, mediaType, mediaId, new Date().toISOString());
}

export function listPodcasts(): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT id, title, slug, description, artwork_url, programme_key, is_demo
     FROM podcasts
     WHERE status = 'published' AND deleted_at IS NULL AND IFNULL(is_demo, 0) = 0
     ORDER BY created_at DESC`,
  );
}

export function getPodcast(slug: string): Record<string, unknown> | null {
  ensureReady();
  const show = get<Record<string, unknown>>(
    "SELECT * FROM podcasts WHERE slug = ? AND status = 'published' AND deleted_at IS NULL AND IFNULL(is_demo, 0) = 0",
    slug,
  );
  if (!show) return null;
  const episodes = all(
    "SELECT id, title, slug, description, audio_url, transcript, duration_seconds, download_allowed, published_at, is_demo FROM podcast_episodes WHERE podcast_id = ? AND status = 'published' AND IFNULL(is_demo, 0) = 0 ORDER BY published_at DESC",
    show.id,
  );
  return { ...show, episodes };
}

export function createVideo(user: SessionUser, input: { title: string; description: string; category: string; provider: string; providerId: string; captionsUrl?: string }): { id: string; slug: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "media.create");
  if (!videoEmbed(input.provider, input.providerId)) throw new AppError(400, "Use a YouTube, Vimeo or Mux id. Video files are not hosted on this server.");
  let channel = get<{ id: string }>("SELECT id FROM video_channels WHERE owner_id = ?", user.id);
  if (!channel) {
    const channelId = newId();
    run("INSERT INTO video_channels (id, owner_id, title, slug, description, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)", channelId, user.id, `${user.displayName} TV`, uniqueSlug("video_channels", user.username), "Channel", new Date().toISOString());
    channel = { id: channelId };
  }
  const id = newId();
  const slug = uniqueSlug("videos", input.title);
  const stamp = new Date().toISOString();
  run(
    `INSERT INTO videos (id, channel_id, title, slug, description, category, video_provider, video_provider_id, captions_url, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    id,
    channel.id,
    input.title.trim(),
    slug,
    input.description.trim(),
    input.category.trim() || "community",
    input.provider,
    input.providerId,
    safeExternalUrl(input.captionsUrl),
    stamp,
    stamp,
  );
  audit(user.id, "video.create", "video", id);
  return { id, slug };
}

export function moderateVideo(user: SessionUser, id: string, publish: boolean): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "media.moderate");
  const video = get<{ title: string; description: string; slug: string }>("SELECT title, description, slug FROM videos WHERE id = ?", id);
  if (!video) throw new AppError(404, "Video not found");
  const stamp = new Date().toISOString();
  run("UPDATE videos SET status = ?, published_at = ?, updated_at = ? WHERE id = ?", publish ? "published" : "removed", publish ? stamp : null, stamp, id);
  if (publish) indexDocument({ entityType: "video", entityId: video.slug, language: "en", title: video.title, body: video.description, publishedAt: stamp });
  audit(user.id, publish ? "video.publish" : "video.remove", "video", id);
}

export function listVideos(): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, title, slug, description, category, video_provider, video_provider_id, thumbnail_url, captions_url, duration_seconds, published_at FROM videos WHERE status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC");
}

export function getVideo(slug: string): (Record<string, unknown> & { embed: string | null }) | null {
  ensureReady();
  const video = get<Record<string, unknown>>("SELECT * FROM videos WHERE slug = ? AND status = 'published' AND deleted_at IS NULL", slug);
  if (!video) return null;
  run("UPDATE videos SET view_count = view_count + 1 WHERE id = ?", String(video.id));
  return { ...video, embed: videoEmbed(String(video.video_provider), String(video.video_provider_id)) };
}

export function saveProgramme(user: SessionUser, input: { title: string; description?: string; weekday: number; start: string; end: string }): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "media.create");
  const station = get<{ id: string }>("SELECT id FROM radio_stations LIMIT 1");
  if (!station) throw new AppError(500, "Radio station is not configured");
  if (!/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end)) throw new AppError(400, "Use 24-hour times, such as 18:00");
  run(
    "INSERT INTO radio_programmes (id, station_id, title, description, presenter_id, weekday, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')",
    newId(),
    station.id,
    input.title.trim(),
    input.description || null,
    user.id,
    input.weekday,
    input.start,
    input.end,
  );
}

export function requestSong(user: SessionUser, input: { artist: string; title: string; message?: string; programmeId?: string }): void {
  ensureReady();
  assertActive(user);
  if (input.artist.trim().length < 2 || input.title.trim().length < 1) throw new AppError(400, "Name the artist and the song");
  run(
    "INSERT INTO song_requests (id, programme_id, user_id, artist_name, song_title, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    newId(),
    input.programmeId || null,
    user.id,
    input.artist.trim(),
    input.title.trim(),
    input.message?.slice(0, 280) || null,
    new Date().toISOString(),
  );
}

export function submitMusic(user: SessionUser, input: { title: string; artistName: string; audioUrl: string; rightsConfirmed: boolean }): void {
  ensureReady();
  assertActive(user);
  if (!input.rightsConfirmed) throw new AppError(400, "Confirm that you have the rights to this recording");
  if (!input.audioUrl.trim()) throw new AppError(400, "Add an audio address");
  run(
    "INSERT INTO music_submissions (id, artist_user_id, title, artist_name, audio_url, rights_confirmed, status, created_at) VALUES (?, ?, ?, ?, ?, 1, 'pending', ?)",
    newId(),
    user.id,
    input.title.trim(),
    input.artistName.trim(),
    input.audioUrl.trim(),
    new Date().toISOString(),
  );
  audit(user.id, "music.submit", "music", user.id);
}

export function radioDesk(): { station: Record<string, unknown> | null; programmes: Array<Record<string, unknown>> } {
  ensureReady();
  return {
    station: get<Record<string, unknown>>("SELECT id, name, description, stream_url, status, rights_note FROM radio_stations LIMIT 1") ?? null,
    programmes: all("SELECT id, title, description, weekday, start_time, end_time, status FROM radio_programmes ORDER BY weekday, start_time"),
  };
}

export function upsertTalent(user: SessionUser, input: { category: string; stageName: string; biography: string; locationId?: string | null }): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "talent.create");
  if (input.stageName.trim().length < 2 || input.biography.trim().length < 12) throw new AppError(400, "Add a stage name and biography");
  const existing = get<{ id: string }>("SELECT id FROM talent_profiles WHERE user_id = ?", user.id);
  const stamp = new Date().toISOString();
  if (existing) {
    run("UPDATE talent_profiles SET talent_category = ?, stage_name = ?, biography = ?, location_id = ?, updated_at = ? WHERE id = ?", input.category, input.stageName.trim(), input.biography.trim(), input.locationId || null, stamp, existing.id);
    return existing.id;
  }
  const id = newId();
  run(
    "INSERT INTO talent_profiles (id, user_id, talent_category, stage_name, biography, location_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    user.id,
    input.category,
    input.stageName.trim(),
    input.biography.trim(),
    input.locationId || null,
    stamp,
    stamp,
  );
  indexDocument({ entityType: "talent", entityId: id, language: "en", title: input.stageName.trim(), body: `${input.category} ${input.biography}`, publishedAt: stamp });
  return id;
}

export function listTalent(category?: string): Array<Record<string, unknown>> {
  ensureReady();
  if (category) return all("SELECT id, stage_name, talent_category, biography, verification_status, availability_status, featured FROM talent_profiles WHERE status = 'published' AND talent_category = ? ORDER BY featured DESC, stage_name", category);
  return all("SELECT id, stage_name, talent_category, biography, verification_status, availability_status, featured FROM talent_profiles WHERE status = 'published' ORDER BY featured DESC, stage_name");
}

export function createAudition(user: SessionUser, input: { title: string; description: string; category: string; closingDate?: string; locationId?: string | null }): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "talent.create");
  const id = newId();
  run(
    "INSERT INTO auditions (id, title, description, category, organiser_id, location_id, closing_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)",
    id,
    input.title.trim(),
    input.description.trim(),
    input.category,
    user.id,
    input.locationId || null,
    input.closingDate || null,
    new Date().toISOString(),
  );
  return id;
}

export function applyAudition(user: SessionUser, auditionId: string, message: string): void {
  ensureReady();
  assertActive(user);
  if (message.trim().length < 8) throw new AppError(400, "Tell the organiser why you are applying");
  try {
    run("INSERT INTO audition_applications (id, audition_id, applicant_id, message, status, created_at) VALUES (?, ?, ?, ?, 'submitted', ?)", newId(), auditionId, user.id, message.trim(), new Date().toISOString());
  } catch {
    throw new AppError(409, "You have already applied");
  }
}

export function createTalentContest(user: SessionUser, input: { title: string; description: string; rules: string; start: string; end: string }): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "talent.manage");
  const id = newId();
  run(
    "INSERT INTO talent_competitions (id, title, description, rules, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)",
    id,
    input.title.trim(),
    input.description.trim(),
    input.rules.trim(),
    input.start,
    input.end,
    new Date().toISOString(),
  );
  return id;
}

export function enterTalentContest(user: SessionUser, competitionId: string, caption: string): void {
  ensureReady();
  assertActive(user);
  const profile = get<{ id: string }>("SELECT id FROM talent_profiles WHERE user_id = ?", user.id);
  if (!profile) throw new AppError(400, "Create a talent profile first");
  const contest = get<{ status: string; end_date: string }>("SELECT status, end_date FROM talent_competitions WHERE id = ?", competitionId);
  if (!contest || contest.status !== "open" || contest.end_date < new Date().toISOString().slice(0, 10)) throw new AppError(400, "Entries are closed");
  try {
    run("INSERT INTO talent_entries (id, competition_id, talent_profile_id, caption, status, created_at) VALUES (?, ?, ?, ?, 'approved', ?)", newId(), competitionId, profile.id, caption.slice(0, 280), new Date().toISOString());
  } catch {
    throw new AppError(409, "You have already entered");
  }
}

export function voteTalent(user: SessionUser, entryId: string): void {
  ensureReady();
  assertActive(user);
  const entry = get<{ talent_profile_id: string }>("SELECT talent_profile_id FROM talent_entries WHERE id = ? AND status = 'approved'", entryId);
  if (!entry) throw new AppError(404, "Entry not found");
  const mine = get("SELECT id FROM talent_profiles WHERE id = ? AND user_id = ?", entry.talent_profile_id, user.id);
  if (mine) throw new AppError(400, "You cannot vote for yourself");
  try {
    run("INSERT INTO talent_votes (id, entry_id, voter_id, created_at) VALUES (?, ?, ?, ?)", newId(), entryId, user.id, new Date().toISOString());
  } catch {
    throw new AppError(409, "You have already voted");
  }
}
