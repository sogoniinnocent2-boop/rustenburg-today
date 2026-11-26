"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { randsToCents } from "@/lib/text";
import { loginAccount, logoutCookie, registerAccount, requestPasswordReset, resetPassword, updateProfile, verifyEmail, deleteAccount, changePassword, enableSelfServeRole, requestPrivilegedRole, exportAccount, userFromCookie, decideRoleRequest, setUserStatus, startSession } from "./auth";
import { safeReturn } from "@/lib/safe-return";
import {
  addArticleComment,
  approveTranslation,
  archiveArticle,
  createArticle,
  fileTranslation,
  publishDeskArticle,
  publishDeskStory,
  reactToArticle,
  restoreArticle,
  reviewArticle,
  submitArticle,
  unpublishArticle,
  updateArticle,
} from "./editorial";
import { assignAllManageableDepartments, assignDepartment, createDepartmentStaff, revokeDepartment, requireAssigned } from "./departments";
import { blockUser, commentOnPost, createPost, moderatePost, publishDraft, reactToPost, toggleFollow, voteInPoll } from "./community";
import { applyToJob, completeLesson, createCourse, createEvent, createJob, createRecord, enrol, issueCertificate, publishCourse, publishEvent, publishJob, publishRecord, registerForEvent, reportMapPoint, saveCandidate, signPetition, pledgeDonation, requestQuote, enterCompetition, saveDeal, submitQuiz, addMenuItem, addPlayer, addFixture, recordResult, createCreatorPost, publishCreatorPost, subscribeCreator, createRewardOffer, publishRewardOffer } from "./city";
import { cancelUnpaidOrder, createCampaign, createOrder, createProduct, enquireAboutBusiness, enquireAboutProduct, registerBusiness, reviewCampaign, verifyBusiness, verifyCampaignPayment, moderateProduct } from "./commerce";
import { redeemOffer, reportContent, resolveReport, sendMessage, toggleBookmark } from "./engage";
import { createPodcast, addEpisode, createVideo, moderateVideo, requestSong, submitMusic, upsertTalent, applyAudition, createAudition } from "./media";
import { subscribeAlert, setPreference, markNotificationsRead, followTopic, followStory, subscribeOfficialNews, unsubscribeOfficialNews } from "./alerts";
import { saveUploadBytes, saveUploadFile } from "./uploads";
import { decideAsset, placeAsset, registerAsset } from "./media-library";
import { AppError } from "./errors";
import { currentUser, writePreference, writeSession } from "./session";
import { cookies } from "next/headers";
import { beginOAuthLink, completeOAuthProfile, unlinkOAuthProvider, type OAuthProvider } from "./oauth";
import { addOrganisationStaff, createGroup, createOrganisation, createTicketOrder, joinGroup, requestAccommodation, requestTicketRefund, requestViewing, scanTicket, addTicketType, issueComplimentary } from "./platform";
import { clearSearchHistory, saveSearch } from "./search";
import { addNewsSource, confirmVacancy, fileComplaint, leaveRadioMessage, recordWeather, reviewNewsItem, saveRadioLicence, scheduleTopFive, setBlock, setSourceStatus, setStationAir, verifyEmployerIdentity, pullSource, reportVacancy } from "./citydesk";
import { setSourceDepartments } from "./multisource";
import { cancelScheduledMainEditorial, clearMainEditorial, restoreMainEditorial, scheduleMainEditorial, setArticleBreaking } from "./newsedition";
import { acceptInvite, accountIdByEmail, addEmergencyContact, checkIn, completeJourney, createHousehold, decideEmergencyAccess, discloseEmergencyAccess, disputeGuardianship, enableChildLocation, fileConcern, grantAccess, inviteAdult, markFound, openMissingIncident, raiseSos, registerDependant, requestEmergencyAccess, reviewGuardianship, revokeGrant, saveBirthDate, startJourney } from "./safetrack";
import { cancelPlan, featureDeal, markPractice, PRACTICE_TRACKS, practiceSet, recordFocus, recordMemoryRound, requestOpenQuote, respondToQuote, setPlanPrice, subscribe, type PracticeTrack } from "./commercial";
import { submitHistoryNote } from "./heritage";
import { fileDesk, reviewDesk, toggleDeskFollow } from "./desks";
import { endNotice, publishBook, scheduleNotice } from "./shelf";
import { addStamp, createDocument, createLoyaltyCard, decideAppointment, recordRedemption, removeStudyBlock, requestAppointment, saveStudyBlock, solveSudoku, solveWord } from "./studio";
import { createBackup } from "./backup";
import { get } from "./db";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./crypto";

function redirectError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT");
}

function text(form: FormData, key: string): string {
  return String(form.get(key) || "").trim();
}

function localeOf(form: FormData): string {
  const locale = text(form, "locale");
  return isLocale(locale) ? locale : "en";
}

function deskPath(locale: string, value: string): string | null {
  return safeReturn(locale, value);
}

function fail(locale: string, next: string, error: unknown): never {
  if (redirectError(error)) throw error;
  const message = error instanceof AppError || error instanceof Error ? error.message : "Something went wrong";
  redirect(`/${locale}${next}?error=${encodeURIComponent(message)}`);
}

async function clientIp(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

export async function signInAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  try {
    const result = loginAccount(text(form, "email"), String(form.get("password") || ""), { ip: await clientIp(), userAgent: (await headers()).get("user-agent") || undefined });
    await writeSession(result.cookie);
    redirect(deskPath(locale, text(form, "next")) || `/${locale}/account`);
  } catch (error) {
    fail(locale, "/auth/sign-in", error);
  }
}

export async function signUpAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const next = deskPath(locale, text(form, "next"));
  try {
    const result = registerAccount({
      email: text(form, "email"),
      password: String(form.get("password") || ""),
      displayName: text(form, "displayName"),
      dateOfBirth: text(form, "dateOfBirth"),
      phone: text(form, "phone"),
      acceptedTerms: form.get("terms") === "yes",
      guardianConsent: form.get("guardian") === "yes",
      locale,
      ip: await clientIp(),
    });
    const nextQuery = next ? `&next=${encodeURIComponent(next)}` : "";
    if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
      redirect(`/${locale}/auth/verify?token=${result.verifyToken}&dev=1${nextQuery}`);
    }
    redirect(`/${locale}/auth/verify${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  } catch (error) {
    fail(locale, "/auth/sign-up", error);
  }
}

export async function verifyAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  try {
    const verified = verifyEmail(text(form, "token"));
    await writeSession(startSession(verified.id, { ip: await clientIp(), userAgent: (await headers()).get("user-agent") || undefined }));
    const next = deskPath(locale, text(form, "next"));
    redirect(next || `/${locale}/account?notice=verified`);
  } catch (error) {
    fail(locale, "/auth/verify", error);
  }
}

export async function forgotAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const result = requestPasswordReset(text(form, "email"), locale);
  if (process.env.NODE_ENV !== "production" && result.token && !process.env.SMTP_HOST) {
    redirect(`/${locale}/auth/reset?token=${result.token}&dev=1`);
  }
  redirect(`/${locale}/auth/forgot?notice=sent`);
}

export async function resetAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  try {
    resetPassword(text(form, "token"), String(form.get("password") || ""));
    redirect(`/${locale}/auth/sign-in?notice=reset`);
  } catch (error) {
    fail(locale, `/auth/reset?token=${encodeURIComponent(text(form, "token"))}`, error);
  }
}

export async function signOutAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const jar = await cookies();
  logoutCookie(jar.get("rt_session")?.value);
  await writeSession(null);
  redirect(`/${locale}`);
}

export async function themeAction(form: FormData): Promise<void> {
  const theme = text(form, "theme") === "dark" ? "dark" : "light";
  await writePreference("rt_theme", theme);
  const user = await currentUser();
  if (user) updateProfile(user, { theme, language: user.language });
  redirect(text(form, "return") || "/en");
}

export async function profileAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const avatar = form.get("avatar");
    const avatarUrl = avatar instanceof File && avatar.size > 0 ? (await saveUploadFile(user, avatar, "image")).url : undefined;
    updateProfile(user, {
      displayName: text(form, "displayName"),
      biography: text(form, "biography"),
      language: text(form, "language"),
      visibility: text(form, "visibility"),
      phone: text(form, "phone"),
      messagePolicy: text(form, "messagePolicy"),
      theme: text(form, "theme") || "light",
      avatarUrl,
    });
    await writePreference("rt_locale", text(form, "language") || locale);
    redirect(`/${locale}/account/profile?notice=saved`);
  } catch (error) {
    fail(locale, "/account/profile", error);
  }
}

export async function passwordAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    changePassword(user, String(form.get("current") || ""), String(form.get("password") || ""));
    redirect(`/${locale}/account/security?notice=saved`);
  } catch (error) {
    fail(locale, "/account/security", error);
  }
}

export async function deleteAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    deleteAccount(user, String(form.get("password") || ""), text(form, "confirm"));
    await writeSession(null);
    redirect(`/${locale}?notice=closed`);
  } catch (error) {
    fail(locale, "/account/deletion", error);
  }
}

export async function roleAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const role = text(form, "role");
    if (text(form, "mode") === "request") requestPrivilegedRole(user, role);
    else enableSelfServeRole(user, role);
    redirect(`/${locale}/account?notice=saved`);
  } catch (error) {
    fail(locale, "/account", error);
  }
}

export async function newsAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    let imageUrl: string | null = null;
    const file = form.get("image");
    if (file instanceof File && file.size > 0) imageUrl = (await saveUploadFile(user, file, "image")).url;
    const created = createArticle(user, {
      categorySlug: text(form, "category"),
      language: text(form, "language") || locale,
      title: text(form, "title"),
      excerpt: text(form, "excerpt"),
      body: text(form, "body"),
      tags: text(form, "tags"),
      sourceName: text(form, "sourceName"),
      sourceUrl: text(form, "sourceUrl"),
      departmentSlug: text(form, "department") || null,
      metaTitle: text(form, "metaTitle") || null,
      metaDescription: text(form, "metaDescription") || null,
      locationId: text(form, "location") || null,
      imageUrl,
    });
    if (form.get("publishNow") === "yes") {
      reviewArticle(user, created.id, "publish");
      redirect(`/${locale}/news/${created.slug}?notice=published`);
    }
    if (form.get("submitReview") === "yes") {
      submitArticle(user, created.id);
      redirect(`/${locale}/admin/cms?status=in_review&notice=submitted`);
    }
    redirect(`/${locale}/admin/cms?status=draft&notice=draft-saved`);
  } catch (error) {
    fail(locale, "/news/new", error);
  }
}

export async function reviewNewsAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const decision = text(form, "decision");
    if (decision !== "approve" && decision !== "changes" && decision !== "publish" && decision !== "remove" && decision !== "schedule") throw new AppError(400, "Choose a review decision");
    reviewArticle(user, text(form, "id"), decision, text(form, "note"), text(form, "schedule") || null);
    redirect(`/${locale}/admin/cms?notice=saved`);
  } catch (error) {
    fail(locale, "/admin/cms", error);
  }
}

export async function cmsAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const back = text(form, "return") || "/admin/cms";
  try {
    const intent = text(form, "intent");
    if (intent === "lifecycle") {
      const mode = text(form, "mode");
      const id = text(form, "id");
      if (mode === "publish") reviewArticle(user, id, "publish");
      else if (mode === "unpublish") {
        if (text(form, "confirm") !== "YES") throw new AppError(400, "Confirm unpublishing this post");
        unpublishArticle(user, id);
      } else if (mode === "archive") {
        if (text(form, "confirm") !== "YES") throw new AppError(400, "Confirm archiving this post");
        archiveArticle(user, id);
      } else if (mode === "restore") restoreArticle(user, id);
      else if (mode === "remove") {
        if (text(form, "confirm") !== "YES") throw new AppError(400, "Confirm deleting this post");
        reviewArticle(user, id, "remove");
      } else throw new AppError(400, "Choose a content action");
      redirect(`/${locale}${back}?notice=saved`);
    }

    let imageUrl: string | undefined;
    const file = form.get("image");
    if (file instanceof File && file.size > 0) imageUrl = (await saveUploadFile(user, file, "image")).url;
    const mode = text(form, "mode") || "draft";
    const scheduleRaw = text(form, "schedule");
    const scheduleIso = scheduleRaw ? new Date(scheduleRaw).toISOString() : null;
    const headlineExpiresRaw = text(form, "headlineExpires");
    const headlineExpiresAt = headlineExpiresRaw ? new Date(headlineExpiresRaw).toISOString() : null;
    const displayType = text(form, "displayType") || "body";
    const priority = text(form, "priority") || "standard";

    if (intent === "update") {
      const id = text(form, "id");
      updateArticle(user, id, {
        title: text(form, "title"),
        excerpt: text(form, "excerpt"),
        body: text(form, "body"),
        language: text(form, "language") || "en",
        categorySlug: text(form, "category") || undefined,
        tags: text(form, "tags"),
        departmentSlug: text(form, "department") || null,
        metaTitle: text(form, "metaTitle") || null,
        metaDescription: text(form, "metaDescription") || null,
        locationId: text(form, "location") || null,
        imageUrl,
        keepPublished: mode === "update-live",
        displayType,
        priority,
        headlineExpiresAt,
      });
      if (mode === "submit") submitArticle(user, id);
      else if (mode === "publish") reviewArticle(user, id, "publish");
      else if (mode === "schedule") {
        if (!scheduleIso) throw new AppError(400, "Choose a schedule time");
        reviewArticle(user, id, "schedule", "Scheduled from CMS", scheduleIso);
      }
      redirect(`/${locale}${back}?notice=saved&edit=${encodeURIComponent(id)}`);
    }

    const created = createArticle(user, {
      categorySlug: text(form, "category") || "local-news",
      language: text(form, "language") || "en",
      title: text(form, "title"),
      excerpt: text(form, "excerpt"),
      body: text(form, "body"),
      tags: text(form, "tags"),
      departmentSlug: text(form, "department") || null,
      metaTitle: text(form, "metaTitle") || null,
      metaDescription: text(form, "metaDescription") || null,
      locationId: text(form, "location") || null,
      imageUrl: imageUrl || null,
      displayType,
      priority,
      headlineExpiresAt,
    });
    if (mode === "submit") submitArticle(user, created.id);
    else if (mode === "publish") reviewArticle(user, created.id, "publish");
    else if (mode === "schedule") {
      if (!scheduleIso) throw new AppError(400, "Choose a schedule time");
      reviewArticle(user, created.id, "schedule", "Scheduled from CMS", scheduleIso);
    }
    redirect(`/${locale}${back}?notice=saved&status=${mode === "publish" ? "published" : mode === "schedule" ? "scheduled" : mode === "submit" ? "in_review" : "draft"}`);
  } catch (error) {
    fail(locale, back, error);
  }
}

export async function postAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    if (text(form, "intent") === "publish") {
      const status = publishDraft(user, text(form, "id"));
      redirect(status === "published" ? `/${locale}/community/${text(form, "id")}` : `/${locale}/community?notice=held`);
    }
    const media: Array<{ url: string; alt?: string }> = [];
    for (const entry of form.getAll("image")) {
      if (entry instanceof File && entry.size > 0) media.push({ url: (await saveUploadFile(user, entry, "image")).url, alt: text(form, "alt") });
    }
    const created = createPost(user, {
      body: text(form, "body"),
      postType: text(form, "postType") || "update",
      pollOptions: [text(form, "optionA"), text(form, "optionB"), text(form, "optionC")].filter(Boolean),
      media,
      videoUrl: text(form, "videoUrl") || null,
      rightsConfirmed: form.get("consent") === "yes",
      draft: form.get("draft") === "yes",
    });
    if (created.status === "draft") redirect(`/${locale}/community?view=drafts&notice=draft`);
    if (created.status === "pending") redirect(`/${locale}/community?notice=held`);
    redirect(`/${locale}/community/${created.id}`);
  } catch (error) {
    fail(locale, "/community/new", error);
  }
}

export async function commentAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const back = text(form, "return") || `/${locale}`;
  try {
    if (text(form, "kind") === "post") commentOnPost(user, text(form, "id"), text(form, "body"), text(form, "parent") || null);
    else addArticleComment(user, text(form, "id"), text(form, "body"));
    redirect(back);
  } catch (error) {
    fail(locale, back.replace(`/${locale}`, "") || "/", error);
  }
}

export async function reactionAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const back = text(form, "return") || `/${locale}/community`;
  try {
    if (text(form, "kind") === "article") reactToArticle(user, text(form, "id"), text(form, "reaction") || "like");
    else reactToPost(user, text(form, "id"), text(form, "reaction") || "like");
    redirect(back);
  } catch (error) {
    fail(locale, localPath(locale, back), error);
  }
}

export async function voteAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const back = text(form, "return") || `/${locale}/community`;
  try {
    voteInPoll(user, text(form, "option"));
    redirect(back);
  } catch (error) {
    fail(locale, localPath(locale, back), error);
  }
}

export async function blockAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const username = text(form, "username");
  try {
    blockUser(user, username);
    redirect(`/${locale}/people/${username}?notice=blocked`);
  } catch (error) {
    fail(locale, `/people/${username}`, error);
  }
}

export async function bookAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const book = publishBook(user, {
      title: text(form, "title"),
      description: text(form, "description"),
      language: text(form, "language") || locale,
      sample: text(form, "sample"),
      body: text(form, "body"),
      priceCents: text(form, "price") ? randsToCents(text(form, "price")) : 0,
      rights: form.get("rights") === "yes",
    });
    redirect(`/${locale}/books/${book.slug}?notice=${book.status}`);
  } catch (error) {
    fail(locale, "/books", error);
  }
}

export async function liveAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    if (text(form, "intent") === "end") endNotice(user, text(form, "id"));
    else scheduleNotice(user, { title: text(form, "title"), category: text(form, "category"), startsAt: text(form, "starts"), note: text(form, "note") });
    redirect(`/${locale}/live?notice=saved`);
  } catch (error) {
    fail(locale, "/live", error);
  }
}

export async function followAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    toggleFollow(user, text(form, "username"));
    redirect(`/${locale}/people/${text(form, "username")}`);
  } catch (error) {
    fail(locale, `/people/${text(form, "username")}`, error);
  }
}

function localPath(locale: string, value: string): string {
  const path = value.startsWith("/") ? value : `/${value}`;
  const prefix = `/${locale}`;
  return path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path;
}

export async function topicAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const back = text(form, "return") || `/${locale}/news`;
  try {
    followTopic(user.id, text(form, "category"));
    redirect(back);
  } catch (error) {
    fail(locale, localPath(locale, back), error);
  }
}

export async function newsSubscribeAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  const back = text(form, "return") || `/${locale}`;
  if (!user) redirect(`/${locale}/auth/sign-up?next=${encodeURIComponent(back)}`);
  try {
    const intent = text(form, "intent");
    if (intent === "unsubscribe") unsubscribeOfficialNews(user.id);
    else {
      subscribeOfficialNews(user.id, "in_app");
      if (form.get("email") === "yes") subscribeOfficialNews(user.id, "email");
    }
    const department = text(form, "department");
    if (department) subscribeAlert(user.id, `desk:${department}`, "in_app");
    redirect(`${back}${back.includes("?") ? "&" : "?"}notice=${intent === "unsubscribe" ? "unsubscribed" : "subscribed"}`);
  } catch (error) {
    fail(locale, back, error);
  }
}

export async function translationAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const back = text(form, "return") || `/${locale}/news`;
  try {
    if (text(form, "intent") === "approve") approveTranslation(user, text(form, "id"), text(form, "language"));
    else fileTranslation(user, text(form, "id"), text(form, "language"), text(form, "title"), text(form, "excerpt"), text(form, "body"));
    redirect(back);
  } catch (error) {
    fail(locale, localPath(locale, back), error);
  }
}

export async function storyAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const back = text(form, "return") || `/${locale}/news`;
  try {
    followStory(user.id, text(form, "kind"), text(form, "id"));
    redirect(back);
  } catch (error) {
    fail(locale, localPath(locale, back), error);
  }
}

export async function bookmarkAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  toggleBookmark(user, text(form, "type"), text(form, "id"));
  redirect(text(form, "return") || `/${locale}/account/saved`);
}

export async function reportAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const back = text(form, "return") || `/${locale}`;
  try {
    reportContent(user, text(form, "type"), text(form, "id"), text(form, "reason"), text(form, "description"));
    redirect(`${back}${back.includes("?") ? "&" : "?"}notice=reported`);
  } catch (error) {
    fail(locale, back.replace(`/${locale}`, "") || "/", error);
  }
}

export async function messageAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    if (text(form, "recipientId") && !text(form, "conversationId")) throw new AppError(403, "Private messages are closed. Comment on the public post.");
    const id = sendMessage(user, { recipientId: text(form, "recipientId") || undefined, conversationId: text(form, "conversationId") || undefined, body: text(form, "body") });
    redirect(`/${locale}/account/messages?conversation=${id}`);
  } catch (error) {
    fail(locale, "/account/messages", error);
  }
}

export async function recordAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const section = text(form, "section");
  try {
    const input: Record<string, string> = {};
    for (const [key, value] of form.entries()) if (typeof value === "string") input[key] = value;
    const id = createRecord(user, text(form, "module"), input);
    redirect(`/${locale}/admin?notice=pending&id=${id}&section=${section}`);
  } catch (error) {
    fail(locale, `/${section}/new`, error);
  }
}

export async function publishModuleAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    publishRecord(user, text(form, "module"), text(form, "id"));
    redirect(`/${locale}/admin?notice=published`);
  } catch (error) {
    fail(locale, "/admin", error);
  }
}

export async function jobAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const id = createJob(user, { title: text(form, "title"), description: text(form, "description"), jobType: text(form, "jobType"), closing: text(form, "closing") || undefined });
    redirect(`/${locale}/admin?notice=pending&id=${id}`);
  } catch (error) {
    fail(locale, "/jobs/new", error);
  }
}

export async function applyAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    let cvUrl: string | undefined;
    const file = form.get("cv");
    if (file instanceof File && file.size > 0) cvUrl = (await saveUploadFile(user, file, "document")).url;
    applyToJob(user, text(form, "id"), text(form, "coverLetter"), cvUrl);
    redirect(`/${locale}/account/applications?notice=submitted`);
  } catch (error) {
    fail(locale, `/jobs/${text(form, "id")}`, error);
  }
}

export async function cvAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    saveCandidate(user, { headline: text(form, "headline"), skills: text(form, "skills"), experience: text(form, "experience"), education: text(form, "education") });
    redirect(`/${locale}/account?notice=saved`);
  } catch (error) {
    fail(locale, "/jobs/cv", error);
  }
}

export async function businessAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    registerBusiness(user, { name: text(form, "name"), description: text(form, "description"), categorySlug: text(form, "category"), phone: text(form, "phone"), address: text(form, "address"), website: text(form, "website") });
    redirect(`/${locale}/account/business?notice=pending`);
  } catch (error) {
    fail(locale, "/business/new", error);
  }
}

export async function productAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    let imageUrl: string | undefined;
    const file = form.get("image");
    if (file instanceof File && file.size > 0) imageUrl = (await saveUploadFile(user, file, "image")).url;
    createProduct(user, { title: text(form, "title"), description: text(form, "description"), priceRands: text(form, "price"), condition: text(form, "condition"), categorySlug: text(form, "category"), imageUrl });
    redirect(`/${locale}/account/listings?notice=pending`);
  } catch (error) {
    fail(locale, "/marketplace/new", error);
  }
}

export async function orderAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    if (text(form, "intent") === "cancel") {
      cancelUnpaidOrder(user, text(form, "id"));
      redirect(`/${locale}/account/orders?notice=cancelled`);
    }
    const order = createOrder(user, text(form, "id"), Number(text(form, "quantity") || 1), text(form, "fulfilment") === "delivery" ? "delivery" : "collection", text(form, "notes"));
    redirect(`/${locale}/account/orders?notice=unpaid&order=${order.id}`);
  } catch (error) {
    fail(locale, `/marketplace/${text(form, "slug")}`, error);
  }
}

export async function campaignAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    let mediaUrl = text(form, "mediaUrl");
    const file = form.get("image");
    if (file instanceof File && file.size > 0) mediaUrl = (await saveUploadFile(user, file, "image")).url;
    createCampaign(user, { productPlacement: text(form, "placement"), businessId: text(form, "businessId") || undefined, title: text(form, "title"), destinationUrl: text(form, "destination"), start: text(form, "start"), end: text(form, "end"), budgetRands: text(form, "budget"), altText: text(form, "alt"), mediaUrl, kind: text(form, "kind") || undefined, targetCategory: text(form, "category") || undefined, targetLocationId: text(form, "location") || undefined, frequencyHours: Number(text(form, "frequency") || 24) });
    redirect(`/${locale}/account/advertisements?notice=pending`);
  } catch (error) {
    fail(locale, "/advertising/new", error);
  }
}

export async function courseAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const course = createCourse(user, { title: text(form, "title"), description: text(form, "description"), priceRands: text(form, "price") || undefined });
    redirect(`/${locale}/learn/${course.slug}?notice=draft`);
  } catch (error) {
    fail(locale, "/learn/new", error);
  }
}

export async function enrolAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const result = enrol(user, text(form, "id"));
    redirect(`/${locale}/account/courses?notice=${result.status}`);
  } catch (error) {
    fail(locale, `/learn/${text(form, "slug")}`, error);
  }
}

export async function eventAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    createEvent(user, { title: text(form, "title"), description: text(form, "description"), category: text(form, "category"), start: text(form, "start"), venue: text(form, "venue") });
    redirect(`/${locale}/admin?notice=pending`);
  } catch (error) {
    fail(locale, "/events/new", error);
  }
}

export async function attendAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    registerForEvent(user, text(form, "id"));
    redirect(`/${locale}/account/events?notice=registered`);
  } catch (error) {
    fail(locale, `/events/${text(form, "slug")}`, error);
  }
}

export async function quizAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const count = Number(text(form, "count"));
  const answers = Array.from({ length: count }, (_, index) => Number(form.get(`answer${index}`)));
  try {
    const result = submitQuiz(user, text(form, "id"), answers);
    redirect(`/${locale}/learn/${text(form, "slug")}?notice=${result.passed ? "passed" : "score"}-${result.score}`);
  } catch (error) {
    fail(locale, `/learn/${text(form, "slug")}`, error);
  }
}

export async function lessonAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const progress = completeLesson(user, text(form, "id"));
    redirect(`/${locale}/learn/${text(form, "slug")}?notice=progress-${progress}`);
  } catch (error) {
    fail(locale, `/learn/${text(form, "slug")}`, error);
  }
}

export async function certificateAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const issued = issueCertificate(user, text(form, "id"));
    redirect(`/${locale}/learn/${text(form, "slug")}?notice=${issued.number}`);
  } catch (error) {
    fail(locale, `/learn/${text(form, "slug")}`, error);
  }
}

export async function enquiryAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const id = text(form, "kind") === "business" ? enquireAboutBusiness(user, text(form, "id"), text(form, "message")) : enquireAboutProduct(user, text(form, "id"), text(form, "message"));
    redirect(`/${locale}/account/messages?conversation=${id}`);
  } catch (error) {
    fail(locale, text(form, "return").replace(`/${locale}`, "") || "/", error);
  }
}

export async function deskAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const intent = text(form, "intent");
  const back = text(form, "return") || `/${locale}`;
  try {
    if (intent === "menu") addMenuItem(user, text(form, "id"), { name: text(form, "name"), description: text(form, "description"), priceRands: text(form, "price") });
    else if (intent === "player") addPlayer(user, text(form, "id"), { name: text(form, "name"), position: text(form, "position"), biography: text(form, "biography") });
    else if (intent === "fixture") addFixture(user, { homeTeamId: text(form, "home"), awayTeamId: text(form, "away"), start: text(form, "start"), venue: text(form, "venue") });
    else if (intent === "result") recordResult(user, text(form, "id"), Number(text(form, "homeScore")), Number(text(form, "awayScore")), text(form, "summary"));
    else if (intent === "creator") createCreatorPost(user, { title: text(form, "title"), body: text(form, "body"), contentType: text(form, "contentType"), sponsored: form.get("sponsored") === "yes", sponsorLabel: text(form, "sponsor") });
    else if (intent === "follow-creator") subscribeCreator(user, text(form, "id"));
    else if (intent === "reward") createRewardOffer(user, { businessId: text(form, "businessId"), title: text(form, "title"), description: text(form, "description"), points: Number(text(form, "points")) });
    else if (intent === "redeem") redeemOffer(user, text(form, "id"));
    else throw new AppError(400, "Unknown action");
    redirect(`${back}${back.includes("?") ? "&" : "?"}notice=saved`);
  } catch (error) {
    fail(locale, back.startsWith(`/${locale}`) ? back.slice(locale.length + 1) : back, error);
  }
}

export async function simpleAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const intent = text(form, "intent");
  const back = text(form, "return") || `/${locale}`;
  try {
    if (intent === "sign-petition") signPetition(user, text(form, "id"));
    else if (intent === "pledge") pledgeDonation(user, text(form, "id"), text(form, "amount"));
    else if (intent === "quote") requestQuote(user, text(form, "id"), text(form, "message"));
    else if (intent === "enter") enterCompetition(user, text(form, "id"), text(form, "answer"));
    else if (intent === "save-deal") saveDeal(user, text(form, "id"));
    else if (intent === "song") requestSong(user, { artist: text(form, "artist"), title: text(form, "title"), message: text(form, "message") });
    else if (intent === "music") submitMusic(user, { title: text(form, "title"), artistName: text(form, "artist"), audioUrl: text(form, "audioUrl"), rightsConfirmed: form.get("rights") === "yes" });
    else if (intent === "talent") upsertTalent(user, { category: text(form, "category"), stageName: text(form, "stageName"), biography: text(form, "biography") });
    else if (intent === "audition") createAudition(user, { title: text(form, "title"), description: text(form, "description"), category: text(form, "category") });
    else if (intent === "apply-audition") applyAudition(user, text(form, "id"), text(form, "message"));
    else if (intent === "podcast") {
      const show = createPodcast(user, { title: text(form, "title"), description: text(form, "description"), programmeKey: text(form, "programme") });
      if (text(form, "audioUrl")) addEpisode(user, show.id, { title: text(form, "episode"), description: text(form, "episodeDescription") || text(form, "description"), audioUrl: text(form, "audioUrl"), transcript: text(form, "transcript") });
    } else if (intent === "video") createVideo(user, { title: text(form, "title"), description: text(form, "description"), category: text(form, "category"), provider: text(form, "provider"), providerId: text(form, "providerId"), captionsUrl: text(form, "captions") });
    else if (intent === "alert") subscribeAlert(user.id, text(form, "category"), text(form, "channel") === "email" ? "email" : "in_app");
    else if (intent === "notify-pref") setPreference(user.id, text(form, "channel"), text(form, "category"), form.get("enabled") === "yes");
    else if (intent === "read-notes") markNotificationsRead(user.id);
    else throw new AppError(400, "Unknown action");
    redirect(`${back}${back.includes("?") ? "&" : "?"}notice=saved`);
  } catch (error) {
    fail(locale, back.startsWith(`/${locale}`) ? back.slice(locale.length + 1) : back, error);
  }
}

export async function moderateAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const kind = text(form, "kind");
    const approve = text(form, "approve");
    const chosen = approve === "yes" ? true : approve === "no" ? false : null;
    if (kind === "business" || kind === "campaign" || kind === "video" || kind === "post" || kind === "report" || kind === "role-request") {
      if (chosen === null) throw new AppError(400, "Choose approve or decline");
    }
    if (kind === "business") verifyBusiness(user, text(form, "id"), chosen === true);
    else if (kind === "product") {
      if (approve !== "yes" && approve !== "no" && approve !== "unpublish") throw new AppError(400, "Choose publish, unpublish, or remove");
      moderateProduct(user, text(form, "id"), approve === "yes" ? "publish" : approve === "unpublish" ? "unpublish" : "remove");
    }
    else if (kind === "campaign") reviewCampaign(user, text(form, "id"), chosen === true);
    else if (kind === "campaign-pay") verifyCampaignPayment(user, text(form, "id"), text(form, "reference"));
    else if (kind === "job" || kind === "event" || kind === "module" || kind === "course" || kind === "creator" || kind === "reward") {
      if (approve !== "yes") throw new AppError(400, "Decline did not change this item");
      if (kind === "job") publishJob(user, text(form, "id"));
      else if (kind === "event") publishEvent(user, text(form, "id"));
      else if (kind === "module") publishRecord(user, text(form, "module"), text(form, "id"));
      else if (kind === "course") publishCourse(user, text(form, "id"));
      else if (kind === "creator") publishCreatorPost(user, text(form, "id"));
      else publishRewardOffer(user, text(form, "id"));
    }
    else if (kind === "video") moderateVideo(user, text(form, "id"), chosen === true);
    else if (kind === "post") moderatePost(user, text(form, "id"), chosen === true ? "publish" : "remove");
    else if (kind === "report") resolveReport(user, text(form, "id"), chosen === true ? "remove" : "dismiss", text(form, "note") || "Reviewed");
    else if (kind === "user") {
      const status = text(form, "status");
      if (status !== "active" && status !== "suspended") throw new AppError(400, "Choose a status");
      setUserStatus(user, text(form, "id"), status);
    }
    else if (kind === "role-request") decideRoleRequest(user, text(form, "id"), chosen === true);
    else throw new AppError(400, "Unknown moderation action");
    redirect(`/${locale}/admin?notice=saved`);
  } catch (error) {
    fail(locale, "/admin", error);
  }
}

export async function backupAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user?.roles.includes("administrator")) redirect(`/${locale}/auth/sign-in`);
  try {
    createBackup();
    redirect(`/${locale}/admin?notice=backup`);
  } catch (error) {
    fail(locale, "/admin", error);
  }
}

export async function exportAction(): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/en/auth/sign-in");
  const payload = exportAccount(user.id);
  const file = path.join(dataDir(), "exports", `${user.id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  redirect(`/${user.language}/account/privacy?notice=export`);
}

void userFromCookie;

export async function mapReportAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    reportMapPoint(user, text(form, "point"), text(form, "note"));
    redirect(`/${locale}/map?notice=reported`);
  } catch (error) {
    fail(locale, "/map", error);
  }
}

export async function promoConsentAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const jar = await cookies();
  jar.set("rt_promos", form.get("allow") === "yes" ? "yes" : "no", { path: "/", sameSite: "lax", maxAge: 31536000 });
  redirect(`/${locale}`);
}

export async function googleProfileAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const email = text(form, "email") || undefined;
    completeOAuthProfile(user, text(form, "dateOfBirth"), form.get("terms") === "yes", form.get("guardian") === "yes", email);
    redirect(`/${locale}?notice=welcome`);
  } catch (error) {
    fail(locale, "/auth/google-profile", error);
  }
}

export async function linkOAuthAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const provider = text(form, "provider");
  if (provider !== "google" && provider !== "facebook") redirect(`/${locale}/account/security?error=${encodeURIComponent("Choose Google or Facebook")}`);
  try {
    const ticket = beginOAuthLink(user, text(form, "password"), provider as OAuthProvider);
    const jar = await cookies();
    jar.set("rt_oauth_link", ticket, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
    redirect(`/api/auth/${provider}?locale=${locale}`);
  } catch (error) {
    fail(locale, "/account/security", error);
  }
}

export async function unlinkOAuthAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const provider = text(form, "provider");
    if (provider !== "google" && provider !== "facebook" && provider !== "apple") throw new Error("Invalid provider");
    unlinkOAuthProvider(user, provider as OAuthProvider);
    redirect(`/${locale}/account/security?notice=${encodeURIComponent("Sign-in provider unlinked")}`);
  } catch (error) {
    fail(locale, "/account/security", error);
  }
}

export async function locationAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const id = text(form, "location");
  const jar = await cookies();
  if (!id || !get("SELECT id FROM locations WHERE id = ? AND active = 1", id)) jar.delete("rt_location");
  else jar.set("rt_location", id, { path: "/", sameSite: "lax", maxAge: 31536000 });
  redirect(text(form, "return") || `/${locale}`);
}

export async function groupAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    if (text(form, "intent") === "join") joinGroup(user, text(form, "id"));
    else createGroup(user, { name: text(form, "name"), description: text(form, "description"), locationId: text(form, "location") || null });
    redirect(`/${locale}/community?notice=saved`);
  } catch (error) {
    fail(locale, "/community", error);
  }
}

export async function ticketOrderAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const order = createTicketOrder(user, text(form, "ticket"), Number(text(form, "quantity") || 1));
    redirect(`/${locale}/tickets?notice=${order.amountCents === 0 ? "issued" : "unpaid"}`);
  } catch (error) {
    fail(locale, "/tickets", error);
  }
}

export async function ticketScanAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const eventId = text(form, "event") || undefined;
  try {
    if (text(form, "intent") === "refund") requestTicketRefund(user, text(form, "code"), text(form, "reason"));
    else scanTicket(user, text(form, "code"), eventId);
    redirect(`/${locale}/tickets?notice=checked-in`);
  } catch (error) {
    fail(locale, "/tickets", error);
  }
}

export async function ticketTypeAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    addTicketType(user, text(form, "event"), { name: text(form, "name"), priceCents: text(form, "price") ? randsToCents(text(form, "price")) : 0, capacity: Number(text(form, "capacity") || 0) });
    redirect(`/${locale}/tickets?notice=saved`);
  } catch (error) {
    fail(locale, "/tickets", error);
  }
}

export async function complimentaryAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    issueComplimentary(user, text(form, "ticket"), Number(text(form, "quantity") || 1), text(form, "email"), text(form, "reason"));
    redirect(`/${locale}/tickets?notice=issued`);
  } catch (error) {
    fail(locale, "/tickets", error);
  }
}

export async function propertyVisitAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const back = text(form, "return") || `/${locale}/property`;
  try {
    if (text(form, "intent") === "stay") requestAccommodation(user, text(form, "id"), text(form, "arrive"), text(form, "depart"));
    else requestViewing(user, text(form, "id"), text(form, "when"), text(form, "note"));
    redirect(`${back}?notice=saved`);
  } catch (error) {
    fail(locale, back.replace(`/${locale}`, "") || "/property", error);
  }
}

export async function organisationAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    if (text(form, "intent") === "staff") addOrganisationStaff(user, text(form, "id"), text(form, "staff"), text(form, "memberRole") || "staff");
    else createOrganisation(user, text(form, "name"));
    redirect(`/${locale}/account?notice=saved`);
  } catch (error) {
    fail(locale, "/account", error);
  }
}

export async function searchLibraryAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    if (text(form, "intent") === "clear") clearSearchHistory(user.id);
    else saveSearch(user.id, text(form, "q"), text(form, "location") || null);
    redirect(`/${locale}/search?q=${encodeURIComponent(text(form, "q"))}&notice=saved`);
  } catch (error) {
    fail(locale, "/search", error);
  }
}

export async function mediaLibraryAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const intent = text(form, "intent");
  try {
    if (intent === "register") {
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError(400, "Choose a photograph");
      const bytes = Buffer.from(await file.arrayBuffer());
      const saved = saveUploadBytes(user, bytes, file.name || "photograph", "image");
      registerAsset(user, {
        uploadId: saved.id,
        bytes,
        ownerName: text(form, "owner"),
        licenceBasis: text(form, "licence"),
        credit: text(form, "credit"),
        altText: text(form, "alt"),
        sourceUrl: text(form, "source"),
        acquiredOn: text(form, "acquired"),
        expiresOn: text(form, "expires"),
      });
    } else if (intent === "decide") {
      const decision = text(form, "decision");
      if (decision !== "approve" && decision !== "reject" && decision !== "withdraw") throw new AppError(400, "Choose a decision");
      decideAsset(user, text(form, "id"), decision);
    } else if (intent === "place") placeAsset(user, text(form, "id"), "homepage_hero");
    else throw new AppError(400, "Unknown photograph action");
    redirect(`/${locale}/admin/media?notice=saved`);
  } catch (error) {
    fail(locale, "/admin/media", error);
  }
}

export async function cityDeskAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const intent = text(form, "intent");
  const next = text(form, "return") || "/admin";
  try {
    if (intent === "source") {
      const sourceId = addNewsSource(user, {
        name: text(form, "name"),
        kind: text(form, "kind"),
        feedUrl: text(form, "feedUrl"),
        publisher: text(form, "publisher"),
        region: text(form, "region"),
        categorySlug: text(form, "category") || "local-news",
        rightsNote: text(form, "rights"),
        permittedUse: text(form, "permitted"),
        autoBreaking: form.get("breaking") === "yes",
      });
      const departments = form.getAll("departments").map((item) => String(item));
      if (departments.length) setSourceDepartments(sourceId, departments);
    } else if (intent === "source-status") setSourceStatus(user, text(form, "id"), text(form, "status") === "active" ? "active" : text(form, "status") === "blocked" ? "blocked" : "paused");
    else if (intent === "ingest") await pullSource(text(form, "id"));
    else if (intent === "article-breaking") setArticleBreaking(user, text(form, "id"), text(form, "breaking") === "1");
    else if (intent === "review-item") reviewNewsItem(user, text(form, "id"), text(form, "decision") as "publish" | "reject" | "breaking" | "withdraw", text(form, "note"));
    else if (intent === "top-five") scheduleTopFive(user, { date: text(form, "date"), position: Number(text(form, "position")), newsItemId: text(form, "newsItem") || undefined, articleId: text(form, "article") || undefined });
    else if (intent === "main-editorial") {
      const mode = text(form, "mode");
      if (mode === "clear") {
        if (text(form, "confirm") && text(form, "confirm") !== "REMOVE") throw new AppError(400, "Confirm removal of the homepage main story");
        clearMainEditorial(user, text(form, "slot") || undefined);
      }
      else if (mode === "cancel") cancelScheduledMainEditorial(user, text(form, "slot"));
      else if (mode === "restore") restoreMainEditorial(user, text(form, "slot"));
      else {
        scheduleMainEditorial(user, {
          articleId: text(form, "article"),
          startsAt: text(form, "starts") || undefined,
          endsAt: text(form, "ends") || null,
          locationId: text(form, "location") || null,
        });
      }
    }
    else if (intent === "block") setBlock(user, text(form, "key"), form.get("enabled") === "yes");
    else if (intent === "complaint") fileComplaint(user, { kind: text(form, "kind"), subjectType: text(form, "subject") || "general", subjectId: text(form, "id"), body: text(form, "body") });
    else if (intent === "weather") recordWeather(user, { summary: text(form, "summary"), sourceName: text(form, "source"), sourceUrl: text(form, "url"), observedAt: text(form, "observed") });
    else if (intent === "vacancy") confirmVacancy(user, text(form, "id"), text(form, "badge") === "official_government" ? "official_government" : "vacancy_confirmed", text(form, "evidence"), text(form, "destination"));
    else if (intent === "employer") verifyEmployerIdentity(user, text(form, "id"), text(form, "evidence"));
    else if (intent === "report-vacancy") reportVacancy(user, text(form, "id"), text(form, "reason"));
    else if (intent === "licence") saveRadioLicence(user, { licenceType: text(form, "licenceType"), holder: text(form, "holder"), reference: text(form, "reference"), territory: text(form, "territory"), startsOn: text(form, "starts"), endsOn: text(form, "ends"), notes: text(form, "notes") });
    else if (intent === "station") setStationAir(user, text(form, "status") === "on_air" ? "on_air" : "offline", text(form, "stream"));
    else if (intent === "radio-message") leaveRadioMessage(user, text(form, "body"));
    else throw new AppError(400, "Unknown desk action");
    redirect(`/${locale}${next}?notice=saved`);
  } catch (error) {
    fail(locale, next, error);
  }
}

export async function safeTrackAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const intent = text(form, "intent");
  const next = text(form, "return") || "/safetrack";
  try {
    if (intent === "birth") saveBirthDate(user, text(form, "dob"));
    else if (intent === "household") createHousehold(user, text(form, "name"));
    else if (intent === "invite") inviteAdult(user, text(form, "household"), text(form, "email"));
    else if (intent === "accept") acceptInvite(user, text(form, "id"));
    else if (intent === "dependant") {
      registerDependant(user, text(form, "household"), {
        preferredName: text(form, "preferred"),
        legalName: text(form, "legal"),
        dateOfBirth: text(form, "dob"),
        relationship: text(form, "relationship"),
      });
    } else if (intent === "dispute") disputeGuardianship(user, text(form, "dependant"));
    else if (intent === "review") reviewGuardianship(user, text(form, "id"), text(form, "decision") === "approve", text(form, "note"));
    else if (intent === "grant") grantAccess(user, accountIdByEmail(text(form, "email")), text(form, "permission"));
    else if (intent === "revoke") revokeGrant(user, text(form, "id"));
    else if (intent === "contact") addEmergencyContact(user, accountIdByEmail(text(form, "email")));
    else if (intent === "child-location") enableChildLocation(user, text(form, "dependant"));
    else if (intent === "journey") {
      const emails = text(form, "contacts").split(",").map((item) => item.trim()).filter(Boolean);
      startJourney(user, { destination: text(form, "destination"), expectedArrival: text(form, "arrival"), contactIds: emails.map((email) => accountIdByEmail(email)) });
    }
    else if (intent === "checkin") checkIn(user, text(form, "id"));
    else if (intent === "complete") completeJourney(user, text(form, "id"));
    else if (intent === "sos") {
      const result = raiseSos(user, text(form, "key"), text(form, "note"));
      redirect(`/${locale}/safetrack?notice=sos&ref=${encodeURIComponent(result.reference)}&queued=${result.queued}`);
    } else if (intent === "missing") {
      const result = openMissingIncident(user, {
        dependantId: text(form, "dependant") || undefined,
        clothing: text(form, "clothing"),
        policeStation: text(form, "station"),
        caseReference: text(form, "case"),
        lastSeenAt: text(form, "seen") || undefined,
      });
      redirect(`/${locale}/safetrack?notice=missing&ref=${encodeURIComponent(result.reference)}`);
    } else if (intent === "found") markFound(user, text(form, "id"));
    else if (intent === "access") requestEmergencyAccess(user, { organisation: text(form, "organisation"), legalBasis: text(form, "basis"), reason: text(form, "reason"), scope: text(form, "scope"), incidentId: text(form, "incident") || undefined });
    else if (intent === "decide") decideEmergencyAccess(user, text(form, "id"), text(form, "decision") === "approve", text(form, "note"));
    else if (intent === "disclose") discloseEmergencyAccess(user, text(form, "id"));
    else if (intent === "concern") fileConcern(user, text(form, "body"));
    else throw new AppError(400, "Unknown safety action");
    redirect(`/${locale}${next}?notice=saved`);
  } catch (error) {
    fail(locale, next, error);
  }
}

export async function planAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const intent = text(form, "intent");
    if (intent === "cancel") cancelPlan(user);
    else if (intent === "price") setPlanPrice(user, text(form, "plan"), Number(text(form, "cents")));
    else if (intent === "feature") featureDeal(user, text(form, "deal"));
    else subscribe(user, text(form, "plan"));
    redirect(`/${locale}/plans?notice=saved`);
  } catch (error) {
    fail(locale, "/plans", error);
  }
}

export async function quoteBoardAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    if (text(form, "intent") === "respond") respondToQuote(user, text(form, "quote"), text(form, "business"), text(form, "message"));
    else requestOpenQuote(user, text(form, "category"), text(form, "message"));
    redirect(`/${locale}/network?notice=saved`);
  } catch (error) {
    fail(locale, "/network", error);
  }
}

export async function practiceAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  const requested = text(form, "track");
  const track: PracticeTrack = (PRACTICE_TRACKS as readonly string[]).includes(requested) ? requested as PracticeTrack : "k53";
  const next = track === "language" ? "/languages" : track === "k53" ? "/k53" : `/practice/${track}`;
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const answers = practiceSet(track).map((question) => {
      const raw = form.get(question.id);
      return raw === null || raw === "" ? -1 : Number(raw);
    });
    const result = markPractice(user, track, answers);
    redirect(`/${locale}${next}?notice=${result.correct}-of-${result.total}`);
  } catch (error) {
    fail(locale, next, error);
  }
}

export async function studyAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    recordFocus(user, Number(text(form, "minutes")));
    redirect(`/${locale}/study?notice=saved`);
  } catch (error) {
    fail(locale, "/study", error);
  }
}

export async function memoryAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    recordMemoryRound(user, Number(text(form, "moves")), Number(text(form, "seconds")));
    redirect(`/${locale}/play?notice=saved`);
  } catch (error) {
    fail(locale, "/play", error);
  }
}

export async function studioAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  const next = text(form, "return");
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/features";
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const intent = text(form, "intent");
    if (intent === "document") {
      const lines = [1, 2, 3].flatMap((index) => {
        const description = text(form, `item${index}`);
        if (!description) return [];
        return [{ description, quantity: Number(text(form, `qty${index}`) || 1), unitCents: randsToCents(text(form, `price${index}`) || "0") }];
      });
      const document = createDocument(user, { businessId: text(form, "business"), kind: text(form, "kind"), clientName: text(form, "client"), note: text(form, "note"), lines });
      redirect(`/${locale}/invoices/${document.id}?notice=saved`);
    }
    if (intent === "appointment") requestAppointment(user, text(form, "business"), text(form, "when"), text(form, "note"));
    else if (intent === "confirm") decideAppointment(user, text(form, "id"), true);
    else if (intent === "decline") decideAppointment(user, text(form, "id"), false);
    else if (intent === "study") saveStudyBlock(user, Number(text(form, "weekday")), text(form, "subject"), Number(text(form, "minutes")));
    else if (intent === "forget") removeStudyBlock(user, text(form, "id"));
    else if (intent === "card") createLoyaltyCard(user, text(form, "business"), text(form, "title"), Number(text(form, "stamps")), text(form, "reward"));
    else if (intent === "stamp") {
      const count = addStamp(user, text(form, "card"), text(form, "email"));
      redirect(`/${locale}${safe}?notice=${count}-stamps`);
    } else if (intent === "redeem") {
      const count = recordRedemption(user, text(form, "deal"), text(form, "note"));
      redirect(`/${locale}${safe}?notice=${count}-redeemed`);
    } else if (intent === "word") {
      const correct = solveWord(user, text(form, "token"), text(form, "guess"));
      redirect(`/${locale}/play?notice=${correct ? "word-correct" : "word-wrong"}`);
    } else if (intent === "sudoku") {
      const cells = Array.from({ length: 16 }, (_, index) => Number(text(form, `c${index}`)));
      const correct = solveSudoku(user, cells);
      redirect(`/${locale}/play?notice=${correct ? "sudoku-correct" : "sudoku-wrong"}`);
    } else if (intent === "history") {
      submitHistoryNote(user, { kind: text(form, "kind"), body: text(form, "body"), source: text(form, "source"), consent: form.get("consent") === "yes" });
      redirect(`/${locale}/story?notice=held`);
    } else throw new AppError(400, "Unknown studio action");
    redirect(`/${locale}${safe}?notice=saved`);
  } catch (error) {
    fail(locale, safe, error);
  }
}

export async function boardAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const kind = text(form, "kind");
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const intent = text(form, "intent");
    if (intent === "follow") {
      const on = toggleDeskFollow(user, kind);
      redirect(`/${locale}/desks/${kind}?notice=${on ? "following" : "unfollowed"}`);
    }
    if (intent === "review") {
      reviewDesk(user, text(form, "id"), text(form, "decision") === "close" ? "close" : "publish");
      redirect(`/${locale}/desks/${kind}?notice=reviewed`);
    }
    const amount = text(form, "amount");
    const filed = fileDesk(user, {
      kind,
      title: text(form, "title"),
      body: text(form, "body"),
      place: text(form, "place"),
      startsOn: text(form, "starts"),
      endsOn: text(form, "ends"),
      sourceUrl: text(form, "source"),
      priceCents: amount ? randsToCents(amount) : null,
    });
    const notice = filed.status === "published" || filed.status === "personal" ? "saved" : filed.status === "preview" ? "preview" : filed.status === "unpaid" ? "unpaid" : "held";
    redirect(`/${locale}/desks/${kind}?notice=${notice}`);
  } catch (error) {
    fail(locale, `/desks/${kind}`, error);
  }
}

export async function departmentAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  try {
    const intent = text(form, "intent");
    if (intent === "create") {
      createDepartmentStaff(user, {
        email: text(form, "email"),
        displayName: text(form, "displayName"),
        section: text(form, "section"),
        password: text(form, "password") || undefined,
      });
      redirect(`/${locale}/admin/departments?notice=staff-created`);
    }
    if (intent === "assign") {
      assignDepartment(user, { email: text(form, "email"), section: text(form, "section") });
      redirect(`/${locale}/admin/departments?notice=assigned`);
    }
    if (intent === "assign-all") {
      const result = assignAllManageableDepartments(user, { email: text(form, "email") });
      redirect(`/${locale}/admin/departments?notice=assigned-all&count=${result.assigned}&total=${result.total}`);
    }
    if (intent === "revoke") {
      revokeDepartment(user, text(form, "userId"), text(form, "section"));
      redirect(`/${locale}/admin/departments?notice=revoked`);
    }
    throw new AppError(400, "Unknown department action");
  } catch (error) {
    fail(locale, "/admin/departments", error);
  }
}

export async function deskPublishAction(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in`);
  const section = text(form, "section");
  try {
    requireAssigned(user, section);
    if (text(form, "intent") === "story") {
      const file = form.get("image");
      if (!(file instanceof File) || file.size <= 0) throw new AppError(400, "Add a picture for this story update");
      const imageUrl = (await saveUploadFile(user, file, "image")).url;
      const created = publishDeskStory(user, {
        section,
        language: text(form, "language") || locale,
        headline: text(form, "headline") || text(form, "title"),
        summary: text(form, "summary") || text(form, "excerpt"),
        body: text(form, "body"),
        categorySlug: text(form, "category") || undefined,
        tags: text(form, "tags") || undefined,
        imageUrl,
        videoUrl: text(form, "videoUrl") || null,
      });
      redirect(`/${locale}/department/${section}?notice=published&id=${created.id}`);
    }
    if (section === "news") {
      let imageUrl: string | null = null;
      const file = form.get("image");
      if (file instanceof File && file.size > 0) imageUrl = (await saveUploadFile(user, file, "image")).url;
      const created = publishDeskArticle(user, {
        categorySlug: text(form, "category") || "local-news",
        language: text(form, "language") || locale,
        title: text(form, "title"),
        excerpt: text(form, "excerpt"),
        body: text(form, "body"),
        tags: text(form, "tags"),
        sourceName: text(form, "sourceName"),
        sourceUrl: text(form, "sourceUrl"),
        imageUrl,
        departmentSlug: "news",
      });
      redirect(`/${locale}/department/news?notice=published&id=${created.id}`);
    }
    if (section === "jobs") {
      const id = createJob(user, {
        title: text(form, "title"),
        description: text(form, "description"),
        jobType: text(form, "jobType") || "full-time",
        closing: text(form, "closing") || undefined,
      }, { publish: true });
      redirect(`/${locale}/department/jobs?notice=published&id=${id}`);
    }
    if (section === "events") {
      const created = createEvent(user, {
        title: text(form, "title"),
        description: text(form, "description"),
        category: text(form, "category") || "community",
        start: text(form, "start"),
        venue: text(form, "venue") || undefined,
      }, { publish: true });
      redirect(`/${locale}/department/events?notice=published&id=${created.id}`);
    }
    if (section === "learn") {
      const course = createCourse(user, { title: text(form, "title"), description: text(form, "description"), priceRands: text(form, "price") || undefined });
      redirect(`/${locale}/department/learn?notice=draft&id=${course.id}`);
    }
    if (section === "business") {
      const created = registerBusiness(user, {
        name: text(form, "name"),
        description: text(form, "description"),
        categorySlug: text(form, "category") || undefined,
        phone: text(form, "phone") || undefined,
        address: text(form, "address") || undefined,
        website: text(form, "website") || undefined,
      }, { publish: true });
      redirect(`/${locale}/department/business?notice=published&id=${created.id}`);
    }
    const moduleKey = text(form, "module");
    if (moduleKey) {
      const input: Record<string, string> = {};
      for (const [key, value] of form.entries()) if (typeof value === "string") input[key] = value;
      const id = createRecord(user, moduleKey, input, { publish: true });
      redirect(`/${locale}/department/${section}?notice=published&id=${id}`);
    }
    throw new AppError(400, "This department form is not wired for live publish yet");
  } catch (error) {
    fail(locale, `/department/${section || ""}`, error);
  }
}
