import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { t } from "../src/lib/i18n";
import { sections } from "../src/lib/sections";
import { randsToCents, videoEmbed } from "../src/lib/text";
import { decideRoleRequest, deleteAccount, enableSelfServeRole, loadUser, loginAccount, logoutCookie, registerAccount, requestPasswordReset, requestPrivilegedRole, resetPassword, userFromCookie, verifyEmail, type SessionUser } from "../src/server/auth";
import { applyToJob, completeLesson, confirmedTotal, createCourse, createEvent, createJob, createRecord, enrol, issueCertificate, listCreatorPosts, listJobs, listMenu, listRecords, pledgeDonation, publishCourse, publishCreatorPost, publishEvent, publishJob, publishRecord, publishRewardOffer, registerForEvent, reportMapPoint, signPetition, addFixture, addLesson, addMenuItem, addQuiz, createCreatorPost, createRewardOffer, recordResult, standings, submitQuiz } from "../src/server/city";
import { createCampaign, createOrder, createProduct, eligiblePopup, enquireAboutProduct, liveCampaigns, markPopupShown, moderateProduct, recordAdEvent, refuseBrowserPayment, registerBusiness, reviewCampaign, verifyBusiness, verifyCampaignPayment } from "../src/server/commerce";
import { blockUser, commentOnPost, createPost, getPost, moderatePost, reactToPost, toggleFollow, voteInPoll } from "../src/server/community";
import { get, newId, run } from "../src/server/db";
import { cityDiscovery } from "../src/server/discover";
import { acceptGoogleProfile, completeGoogleProfile } from "../src/server/google";
import { addArticleComment, approveTranslation, correctArticle, createArticle, fileTranslation, getArticle, listArticles, listCorrections, relatedStories, reviewArticle, submitArticle } from "../src/server/editorial";
import { askCity, awardPoints, briefingRss, namedBookmarks, pointsBalance, redeemOffer, reportContent, resolveReport, sendMessage, toggleBookmark } from "../src/server/engage";
import { useTestDatabase } from "../src/server/init";
import { deliverOutbox } from "../src/server/mail";
import { addEpisode, createPodcast, createTalentContest, createVideo, enterTalentContest, moderateVideo, submitMusic, upsertTalent } from "../src/server/media";
import { applyPaymentWebhook } from "../src/server/payments";
import { addOrganisationStaff, addTicketType, createGroup, createOrganisation, createTicketOrder, issueComplimentary, joinGroup, quoteTicket, releaseExpiredTicketHolds, requestViewing, scanTicket } from "../src/server/platform";
import { addNewsSource, classifyHttp, confirmVacancy, homeEdition, parseFeed, radioState, reviewNewsItem, saveRadioLicence, scheduleTopFive, setSourceStatus, setStationAir, storeFeedItems, topFive, verifyEmployerIdentity } from "../src/server/citydesk";
import { approvedHero, decideAsset, placeAsset, registerAsset } from "../src/server/media-library";
import { saveUploadBytes } from "../src/server/uploads";
import { SLIDE_MS } from "../src/components/top-five";
import { acceptInvite, addEmergencyContact, createHousehold, decideEmergencyAccess, discloseEmergencyAccess, disputeGuardianship, enableChildLocation, grantAccess, inviteAdult, latestPoint, listAllPoints, markFound, openMissingIncident, processOverdueJourneys, raiseSos, recordPoint, registerDependant, requestEmergencyAccess, reviewGuardianship, revokeGrant, startJourney, startSharing } from "../src/server/safetrack";
import { followStory, followTopic } from "../src/server/alerts";
import { listNotifications } from "../src/server/alerts";
import { grantRole } from "../src/server/permissions";
import { searchPlatform, searchSuggest } from "../src/server/search";

let writer: SessionUser;
let editor: SessionUser;
let resident: SessionUser;
let seller: SessionUser;
let buyer: SessionUser;
let admin: SessionUser;

function approve(user: SessionUser, roleName: string): void {
  requestPrivilegedRole(user, roleName);
  const request = get<{ id: string }>("SELECT id FROM role_requests WHERE user_id = ? AND role_name = ? AND status = 'pending'", user.id, roleName);
  decideRoleRequest(admin, request!.id, true);
}

function account(prefix: string, year = "1990-01-01", guardian = false): SessionUser {
  const email = `${prefix}-${Math.random().toString(16).slice(2)}@example.com`;
  const created = registerAccount({
    email,
    password: "password123",
    displayName: prefix,
    dateOfBirth: year,
    acceptedTerms: true,
    guardianConsent: guardian,
    locale: "en",
    ip: email,
  });
  verifyEmail(created.verifyToken);
  const user = loadUser(created.userId);
  if (!user) throw new Error("missing user");
  return user;
}

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-")));
  process.env.PAYMENT_WEBHOOK_SECRET = "test-secret";
  writer = account("writer");
  editor = account("editor");
  resident = account("resident");
  seller = account("seller");
  buyer = account("buyer");
  admin = account("admin");
  grantRole(writer.id, "journalist");
  grantRole(writer.id, "creator");
  grantRole(editor.id, "editor");
  grantRole(seller.id, "seller");
  grantRole(seller.id, "employer");
  grantRole(seller.id, "business_owner");
  grantRole(seller.id, "service_provider");
  grantRole(seller.id, "creator");
  grantRole(seller.id, "event_organiser");
  grantRole(buyer.id, "instructor");
  grantRole(admin.id, "administrator");
  writer = loadUser(writer.id)!;
  editor = loadUser(editor.id)!;
  seller = loadUser(seller.id)!;
  buyer = loadUser(buyer.id)!;
  admin = loadUser(admin.id)!;
});

test("registration, session and password reset", () => {
  assert.throws(() => account("child", "2020-01-01"), /under 13/);
  const teen = account("teen", "2012-06-01", true);
  assert.equal(teen.isMinor, true);
  assert.throws(() => sendMessage(teen, { recipientId: resident.id, body: "Hello from a minor" }), /under 18/);
  const logged = loginAccount(resident.email, "password123", { ip: "login-a" });
  assert.equal(userFromCookie(logged.cookie)?.id, resident.id);
  logoutCookie(logged.cookie);
  assert.equal(userFromCookie(logged.cookie), null);
  const reset = requestPasswordReset(resident.email, "af");
  assert.ok(reset.token);
  resetPassword(reset.token!, "newpassword123");
  assert.throws(() => loginAccount(resident.email, "password123", { ip: "login-b" }), /incorrect/);
  const fresh = loginAccount(resident.email, "newpassword123", { ip: "login-c" });
  run("UPDATE sessions SET expires_at = ? WHERE user_id = ?", "2000-01-01T00:00:00.000Z", resident.id);
  assert.equal(userFromCookie(fresh.cookie), null);
});

test("editorial workflow and search", () => {
  assert.throws(() => createArticle(resident, {
    categorySlug: "local-news",
    language: "en",
    title: "Resident tries to publish news",
    excerpt: "This should be refused by permissions.",
    body: "A long enough body for the article validation to pass before the permission check.",
  }), /permission/);
  const created = createArticle(writer, {
    categorySlug: "local-news",
    language: "en",
    title: "Rustenburg water project demonstration",
    excerpt: "A test article about a labelled demonstration, not a live report.",
    body: "This body explains a test publication workflow for the Rustenburg newsroom. It is stored, reviewed and then published.",
    sourceName: "Test desk",
  });
  submitArticle(writer, created.id);
  reviewArticle(editor, created.id, "publish");
  const article = getArticle(created.slug, "tn");
  assert.equal(article?.fallback, true);
  assert.match(article?.title || "", /Rustenburg water/);
  assert.equal(listArticles({ locale: "en" }).items.some((item) => item.slug === created.slug), true);
  addArticleComment(resident, article!.id, "A real comment from another account.");
  correctArticle(editor, article!.id, "Corrected a test detail in the copy.");
  assert.equal(getArticle(created.slug, "en")?.corrections.length, 1);
  assert.equal(searchPlatform("Rustenbrug water", { locale: "en" }).items.some((item) => item.entityId === created.slug), true);
});

test("community interaction and moderation", () => {
  const post = createPost(resident, { body: "Street market this Saturday in Tlhabane. Bring a hat. #market" });
  reactToPost(buyer, post.id, "like");
  commentOnPost(buyer, post.id, "We will be there.");
  assert.equal(toggleFollow(buyer, resident.username), true);
  const poll = createPost(resident, { body: "Which park needs shade first?", postType: "poll", pollOptions: ["Tlhabane", "Boitekong"] });
  const state = getPost(poll.id, buyer.id);
  const optionId = (state?.poll as { options: Array<{ id: string }> }).options[0].id;
  voteInPoll(buyer, optionId);
  assert.throws(() => voteInPoll(buyer, optionId), /already voted/);
  reportContent(buyer, "post", post.id, "spam", "Please review this test report");
  const open = get<{ id: string }>("SELECT id FROM content_reports WHERE content_id = ?", post.id);
  resolveReport(admin, open!.id, "remove", "Removed in test");
  const gone = get<{ status: string }>("SELECT status FROM community_posts WHERE id = ?", post.id);
  assert.equal(gone?.status, "removed");
  const held = createPost(resident, { body: "A resident says the councillor is accused of fraud in this test report." });
  assert.equal(held.status, "pending");
  assert.equal(getPost(held.id), null);
  assert.throws(() => createPost(resident, { body: "A tip without the rights confirmation on the form.", postType: "tip" }), /right to submit/);
  const tip = createPost(resident, { body: "A labelled community tip about a broken street light.", postType: "tip", rightsConfirmed: true });
  assert.equal(tip.status, "pending");
  moderatePost(admin, tip.id, "publish");
  assert.equal(getPost(tip.id)?.status, "published");
});

test("orders and campaigns do not go live from the browser", () => {
  approve(seller, "seller");
  const product = createProduct(seller, {
    title: "Second-hand kettle",
    description: "A test listing for a kettle, not a real offer.",
    priceRands: "250.00",
    condition: "used",
    categorySlug: "electronics",
  });
  moderateProduct(admin, product.id, "publish");
  const order = createOrder(buyer, product.id, 1, "collection");
  assert.equal(order.paymentStatus, "unpaid");
  assert.throws(() => refuseBrowserPayment(), /provider/);
  const body = JSON.stringify({
    event_id: "evt_order_1",
    type: "payment.succeeded",
    reference_type: "order",
    reference_id: order.id,
    amount_cents: 25000,
    currency: "ZAR",
  });
  const signature = createHmac("sha256", "test-secret").update(body).digest("hex");
  assert.throws(() => applyPaymentWebhook(body, "00"), /signature|Invalid/);
  assert.equal(applyPaymentWebhook(body, signature).status, "processed");
  assert.equal(applyPaymentWebhook(body, signature).status, "duplicate");
  assert.equal(get<{ payment_status: string }>("SELECT payment_status FROM marketplace_orders WHERE id = ?", order.id)?.payment_status, "paid");

  const business = registerBusiness(seller, { name: "Test Hardware", description: "A test hardware shop used only by the automated test.", categorySlug: "retail" });
  verifyBusiness(admin, business.id, true);
  const campaign = createCampaign(admin, {
    productPlacement: "homepage-banner",
    businessId: business.id,
    title: "Test banner",
    destinationUrl: "https://example.com",
    start: "2026-01-01",
    end: "2026-12-31",
    budgetRands: "2500",
    altText: "Test hardware banner",
    mediaUrl: "/brand/banner.svg",
  });
  assert.equal(liveCampaigns("homepage-banner").length, 0);
  reviewCampaign(admin, campaign, true);
  assert.equal(liveCampaigns("homepage-banner").length, 0);
  verifyCampaignPayment(admin, campaign, "manual-ref-1");
  assert.equal(liveCampaigns("homepage-banner").length, 1);
  assert.equal(recordAdEvent(campaign, "impression", { viewerKey: "suite-viewer" }).recorded, false);
  assert.equal(recordAdEvent(campaign, "impression", { viewerKey: "suite-viewer", viewable: true }).recorded, true);
  assert.equal(recordAdEvent(campaign, "impression", { viewerKey: "suite-viewer", viewable: true }).recorded, false);
  assert.equal(recordAdEvent(campaign, "click", { viewerKey: "suite-viewer" }).recorded, true);
  assert.equal(recordAdEvent(campaign, "click", { viewerKey: "suite-viewer" }).recorded, false);
});

test("jobs, courses, events and directories", () => {
  const job = createJob(seller, { title: "Test reporter internship", description: "This vacancy exists only inside the automated test.", jobType: "internship" });
  publishJob(admin, job);
  applyToJob(resident, job, "I am applying inside the automated test with a long enough letter.");
  assert.equal(listJobs().some((item) => item.id === job), true);
  const course = createCourse(buyer, { title: "Test CV workshop", description: "A short test course that is not an accredited qualification." });
  const lesson = addLesson(buyer, course.id, "Open with your name", "Write your name and the work you want.");
  const quiz = addQuiz(buyer, course.id, "Check", [{ prompt: "Where is the platform based?", options: ["Rustenburg", "Durban"], correctIndex: 0 }]);
  publishCourse(buyer, course.id);
  assert.equal(enrol(resident, course.id).status, "active");
  assert.equal(completeLesson(resident, lesson), 100);
  assert.equal(submitQuiz(resident, quiz, [0]).passed, true);
  assert.match(issueCertificate(resident, course.id).number, /^RT-/);
  const event = createEvent(seller, { title: "Test park clean-up", description: "A test event, not a public booking.", category: "community", start: "2026-12-01T09:00:00.000Z" });
  publishEvent(admin, event.id);
  registerForEvent(buyer, event.id);
  assert.throws(() => createRecord(resident, "notice", {
    notice_type: "funeral",
    title: "A funeral notice",
    description: "Details withheld until consent is recorded for this test.",
    consent: "no",
  }), /consent/);
  assert.throws(() => createPost(resident, { body: "My ID is 8001015009087 and should never be stored." }), /identity/);
  const room = createRecord(seller, "property", {
    title: "Test room in Cashan",
    listing_type: "room",
    property_type: "Room",
    description: "Automated test listing, not a real room for rent.",
    price_cents: "1800",
    area_label: "Cashan",
  });
  assert.equal(listRecords("property").some((row) => row.id === room), false);
  publishRecord(admin, "property", room);
  assert.equal(listRecords("property").some((row) => row.id === room), true);
  const petition = createRecord(resident, "petition", { title: "Test shade for the rank", description: "A test petition asking for shade. It is not a live civic petition.", target: "Test target" });
  publishRecord(admin, "petition", petition);
  assert.equal(signPetition(buyer, petition), 1);
  const drive = createRecord(resident, "campaign", { title: "Test blanket drive", description: "A test campaign. Pledges are not collected money.", category: "clothing", goal_cents: "500" });
  publishRecord(admin, "campaign", drive);
  pledgeDonation(buyer, drive, "50");
  assert.equal(confirmedTotal(drive), 0);
});

test("assistant, uploads, rewards, media and blocks", () => {
  const answer = askCity("a job that does not exist called purple astronaut", "en");
  assert.equal(answer.grounded, true);
  assert.equal(answer.items.some((item) => /purple astronaut/i.test(item.title)), false);
  assert.throws(() => saveUploadBytes(resident, Buffer.from("not an image"), "note.txt", "image"), /not allowed/);
  assert.equal(awardPoints(resident.id, "test-award", 20, "Test award"), true);
  assert.equal(awardPoints(resident.id, "test-award", 20, "Test award"), false);
  assert.throws(() => awardPoints(resident.id, "too-much", -50, "Overspend"), /enough points/);
  assert.equal(pointsBalance(resident.id), 20);
  assert.equal(videoEmbed("youtube", "abcdefghij"), "https://www.youtube-nocookie.com/embed/abcdefghij");
  assert.equal(videoEmbed("file", "../etc/passwd"), null);
  assert.equal(randsToCents("19.95"), 1995);
  assert.notEqual(t("en", "tagline"), t("af", "tagline"));
  assert.notEqual(t("en", "tagline"), t("tn", "tagline"));
  assert.ok(sections.length >= 30);
  const video = createVideo(writer, { title: "Test interview", description: "A test video record that points at a provider id.", category: "interviews", provider: "youtube", providerId: "abcdefghij" });
  moderateVideo(admin, video.id, true);
  const show = createPodcast(writer, { title: "Test Talk", description: "A test podcast created by the automated suite." });
  addEpisode(writer, show.id, { title: "Episode one", description: "An episode record.", audioUrl: "/audio/demo-tone.wav" });
  assert.throws(() => submitMusic(resident, { title: "Song", artistName: "Tester", audioUrl: "/audio/demo-tone.wav", rightsConfirmed: false }), /rights/);
  upsertTalent(seller, { category: "musicians", stageName: "Test Act", biography: "A test talent profile, not a booking offer." });
  const contest = createTalentContest(admin, { title: "Test talent round", description: "Automated contest", rules: "One entry each", start: "2026-01-01", end: "2026-12-31" });
  enterTalentContest(seller, contest, "Test entry");
  blockUser(resident, buyer.username);
  assert.throws(() => sendMessage(buyer, { recipientId: resident.id, body: "Can you see this message?" }), /blocked|not accepting/);
});

test("menus, fixtures, creators, rewards and mail stay honest", async () => {
  approve(seller, "creator");
  const place = createRecord(seller, "food", { name: "Test kitchen", kind: "restaurant", description: "A test kitchen, not a real restaurant." });
  publishRecord(admin, "food", place);
  addMenuItem(seller, place, { name: "Pap and sauce", priceRands: "25.00" });
  assert.equal(listMenu(place).length, 1);
  grantRole(writer.id, "service_provider");
  const home = createRecord(seller, "team", { name: "Test Home", sport: "football", description: "A test club, not a real fixture list." });
  const away = createRecord(writer, "team", { name: "Test Away", sport: "football", description: "A second test club." });
  publishRecord(admin, "team", home);
  publishRecord(admin, "team", away);
  const fixture = addFixture(seller, { homeTeamId: home, awayTeamId: away, start: "2026-12-02T15:00" });
  recordResult(seller, fixture, 2, 1, "Test score");
  assert.equal(Number(standings().find((row) => row.id === home)?.wins), 1);
  const note = createCreatorPost(seller, { title: "Test creator note", body: "A labelled test post from the automated suite.", contentType: "note" });
  assert.equal(listCreatorPosts().some((row) => row.id === note), false);
  publishCreatorPost(admin, note);
  assert.equal(listCreatorPosts().some((row) => row.id === note), true);
  const business = registerBusiness(seller, { name: "Test rewards counter", description: "A test business used only by the suite." });
  verifyBusiness(admin, business.id, true);
  const offer = createRewardOffer(seller, { businessId: business.id, title: "Test coffee", description: "Not a real voucher.", points: 10 });
  publishRewardOffer(admin, offer);
  awardPoints(buyer.id, "reward-coffee", 10, "Test points");
  redeemOffer(buyer, offer);
  assert.equal(pointsBalance(buyer.id), 0);
  const kettle = get<{ id: string }>("SELECT id FROM products WHERE title = 'Second-hand kettle'");
  assert.ok(kettle);
  const conversation = enquireAboutProduct(buyer, kettle.id, "Is the test kettle still available?");
  assert.ok(conversation);
  delete process.env.SMTP_HOST;
  const mail = await deliverOutbox();
  assert.equal(mail.mode, "queued");
  assert.equal(mail.delivered, 0);
});

test("discovery, map reports, popup caps and Google linking", () => {
  const city = cityDiscovery();
  assert.ok(Array.isArray(city.breaking));
  assert.ok(Array.isArray(city.places));
  const popup = createCampaign(admin, {
    productPlacement: "popup",
    title: "Test popup",
    destinationUrl: "https://example.com/popup",
    start: "2026-01-01",
    end: "2026-12-31",
    budgetRands: "1800",
    altText: "A labelled test promotion",
    mediaUrl: "/brand/banner.svg",
    kind: "event",
    frequencyHours: 24,
  });
  reviewCampaign(admin, popup, true);
  verifyCampaignPayment(admin, popup, "popup-ref");
  assert.equal(eligiblePopup("viewer-popup-1", false), null);
  assert.equal(String(eligiblePopup("viewer-popup-1", true)?.id), popup);
  markPopupShown(popup, "viewer-popup-1");
  assert.equal(eligiblePopup("viewer-popup-1", true), null);

  const point = newId();
  const stamp = new Date().toISOString();
  run(
    "INSERT INTO map_points (id, source_type, source_id, title, summary, category, latitude, longitude, source_name, verification_status, moderation_status, sensitive, created_at, updated_at) VALUES (?, 'business', ?, 'Test place', 'A test map point', 'business', -25.65, 27.24, 'test', 'verified', 'approved', 0, ?, ?)",
    point,
    point,
    stamp,
    stamp,
  );
  assert.throws(() => reportMapPoint(resident, point, "short"), /incorrect/);
  reportMapPoint(resident, point, "The entrance shown on this place is on the wrong street.");
  assert.equal(get<{ status: string }>("SELECT status FROM map_reports WHERE point_id = ?", point)?.status, "open");

  const email = `google-${Math.random().toString(16).slice(2)}@example.com`;
  const created = acceptGoogleProfile({ sub: `sub-${email}`, email, email_verified: true, name: "Google Tester" }, "en");
  assert.equal(created.next, "profile");
  const pending = userFromCookie(created.cookie);
  assert.ok(pending);
  assert.throws(() => completeGoogleProfile(pending, "2020-01-01", true, true), /under 13/);
  completeGoogleProfile(pending, "1992-04-04", true, false);
  assert.equal(loadUser(pending.id)?.status, "active");
  const linked = acceptGoogleProfile({ sub: `link-${resident.email}`, email: resident.email, email_verified: true, name: "Resident" }, "en");
  assert.equal(linked.next, "home");
  assert.equal(acceptGoogleProfile({ sub: `link-${resident.email}`, email: resident.email, email_verified: true, name: "Resident" }, "en").next, "home");
  assert.equal(get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE email = ?", resident.email)?.count, 1);
  assert.throws(() => acceptGoogleProfile({ sub: "unverified-google", email: "unverified-google@example.com", email_verified: false, name: "No" }, "en"), /verified/);
});

test("roles, geography, tickets, groups and property requests", () => {
  assert.throws(() => enableSelfServeRole(resident, "seller"), /approved/);
  const country = get<{ id: string }>("SELECT id FROM locations WHERE slug = 'south-africa'");
  const province = get<{ parent_location_id: string }>("SELECT parent_location_id FROM locations WHERE slug = 'north-west'");
  assert.equal(province?.parent_location_id, country?.id);
  const city = get<{ id: string }>("SELECT id FROM locations WHERE slug = 'johannesburg'");
  assert.ok(city);
  assert.equal(cityDiscovery(city.id).businesses.length, 0);
  assert.equal(searchSuggest("purple astronaut").some((title) => /purple astronaut/i.test(title)), false);

  const event = createEvent(seller, { title: "Test concert", description: "A test event used only by the automated suite.", category: "music", start: "2026-12-12T18:00:00.000Z" });
  publishEvent(admin, event.id);
  const ticketId = newId();
  run("INSERT INTO event_tickets (id, event_id, ticket_type, price_cents, currency, capacity, reserved_count) VALUES (?, ?, 'General', 15000, 'ZAR', 1, 0)", ticketId, event.id);
  const held = createTicketOrder(buyer, ticketId, 1);
  assert.equal(held.amountCents, 15000);
  assert.throws(() => createTicketOrder(resident, ticketId, 1), /enough tickets/);
  assert.throws(() => createTicketOrder(buyer, ticketId, 1), /enough tickets/);
  const body = JSON.stringify({ event_id: "evt_ticket_1", type: "payment.succeeded", reference_type: "ticket", reference_id: held.id, amount_cents: 15000, currency: "ZAR" });
  const signature = createHmac("sha256", "test-secret").update(body).digest("hex");
  assert.equal(applyPaymentWebhook(body, signature).status, "processed");
  const issued = get<{ code: string }>("SELECT code FROM issued_tickets WHERE order_id = ?", held.id);
  assert.ok(issued?.code);
  assert.equal(scanTicket(admin, issued.code).status, "checked_in");
  assert.throws(() => scanTicket(admin, issued.code), /already checked in/);
  const other = createEvent(seller, { title: "Other test night", description: "A second test event used only by the automated suite.", category: "music", start: "2026-12-13T18:00:00.000Z" });
  publishEvent(admin, other.id);
  assert.throws(() => scanTicket(admin, issued.code, other.id), /another event/);
  assert.equal(quoteTicket(ticketId, 1).feeCents, 0);
  assert.equal(quoteTicket(ticketId, 1).totalCents, 15000);
  assert.throws(() => addTicketType(resident, event.id, { name: "VIP", priceCents: 5000, capacity: 2 }), /permission/);
  const vip = addTicketType(seller, event.id, { name: "VIP", priceCents: 5000, capacity: 2 });
  const guest = issueComplimentary(seller, vip, 1, buyer.email, "Media guest for the test event");
  assert.equal(guest.codes.length, 1);
  assert.equal(scanTicket(admin, guest.codes[0], event.id).status, "checked_in");
  const holdType = addTicketType(seller, event.id, { name: "Hold", priceCents: 1000, capacity: 1 });
  const parked = createTicketOrder(buyer, holdType, 1);
  run("UPDATE ticket_orders SET created_at = ? WHERE id = ?", "2000-01-01T00:00:00.000Z", parked.id);
  assert.equal(releaseExpiredTicketHolds() >= 1, true);
  assert.equal(createTicketOrder(buyer, holdType, 1).amountCents, 1000);

  const groupId = createGroup(resident, { name: "Test neighbours", description: "A test group for the automated suite." });
  joinGroup(buyer, groupId);
  assert.equal(get<{ count: number }>("SELECT COUNT(*) as count FROM group_members WHERE group_id = ?", groupId)?.count, 2);
  const propertyId = createRecord(seller, "property", { title: "Test room", listing_type: "room", property_type: "room", description: "A test room, not a real letting.", price_cents: "500.00" });
  publishRecord(admin, "property", propertyId);
  const viewing = requestViewing(buyer, propertyId, "2026-12-03T10:00", "Test viewing");
  assert.equal(get<{ status: string }>("SELECT status FROM viewing_requests WHERE id = ?", viewing)?.status, "requested");
  const organisation = createOrganisation(seller, "Test Organisation");
  addOrganisationStaff(seller, organisation, resident.id, "staff");
  assert.equal(get<{ member_role: string }>("SELECT member_role FROM organisation_members WHERE organisation_id = ? AND user_id = ?", organisation, resident.id)?.member_role, "staff");
});

test("news desk, vacancies, radio and advertising limits", () => {
  const long = "A".repeat(400);
  const parsed = parseFeed(`<rss><channel><item><title>Water supply restored on the main road</title><link>https://example.com/water?utm_source=feed</link><description><![CDATA[${long}]]></description></item></channel></rss>`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].link, "https://example.com/water");
  assert.ok(parsed[0].summary.length <= 280);
  assert.equal(classifyHttp(404, parsed[0].link, null), "broken");

  const source = addNewsSource(editor, { name: "Example emergency", kind: "official_emergency", publisher: "Example Authority", region: "rustenburg", categorySlug: "local-news", rightsNote: "Headline and link only, recorded for this test.", permittedUse: "headline_link", autoBreaking: true });
  setSourceStatus(editor, source, "active");
  const first = storeFeedItems(source, parsed);
  assert.equal(first.inserted, 1);
  assert.equal(get<{ status: string }>("SELECT status FROM news_items WHERE canonical_url = ?", parsed[0].link)?.status, "published");
  const again = storeFeedItems(source, parsed);
  assert.equal(again.duplicates, 1);
  assert.equal(get<{ count: number }>("SELECT COUNT(*) as count FROM news_items WHERE canonical_url = ?", parsed[0].link)?.count, 1);

  const sensitive = storeFeedItems(source, [{ title: "Court hears a fraud claim in town", link: "https://example.com/court-claim", published: null, author: "Desk", summary: "A short permitted summary." }]);
  assert.equal(sensitive.held, 1);
  const held = get<{ id: string; status: string }>("SELECT id, status FROM news_items WHERE canonical_url = 'https://example.com/court-claim'");
  assert.equal(held?.status, "in_review");
  reviewNewsItem(editor, held!.id, "reject");

  const wire = addNewsSource(editor, { name: "Official wire", kind: "official", publisher: "SAnews", region: "national", categorySlug: "government", rightsNote: "Headline and link only for this test.", permittedUse: "headline_link" });
  setSourceStatus(editor, wire, "active");
  const calm = storeFeedItems(wire, [{ title: "Water project opens in the province", link: "https://example.com/water-project", published: new Date().toUTCString(), author: null, summary: "A short permitted summary of a public works update." }]);
  assert.equal(calm.inserted, 1);
  assert.equal(calm.held, 0);
  assert.equal(get<{ status: string }>("SELECT status FROM news_items WHERE canonical_url = 'https://example.com/water-project'")?.status, "published");
  const violent = storeFeedItems(wire, [{ title: "Police condemn a shooting in the city", link: "https://example.com/shooting-report", published: new Date().toUTCString(), author: null, summary: "A short permitted summary." }]);
  assert.equal(violent.held, 1);
  assert.equal(get<{ status: string }>("SELECT status FROM news_items WHERE canonical_url = 'https://example.com/shooting-report'")?.status, "in_review");

  scheduleTopFive(editor, { date: "2026-11-17", position: 1, newsItemId: get<{ id: string }>("SELECT id FROM news_items WHERE canonical_url = ?", parsed[0].link)!.id });
  assert.equal(topFive("2026-11-17").length, 1);
  assert.equal(SLIDE_MS, 15_000);
  const edition = homeEdition();
  assert.ok(edition.slides.length >= 1 && edition.slides.length <= 5);
  assert.equal(new Set(edition.slides.map((story) => story.headline.toLowerCase())).size, edition.slides.length);
  assert.equal(edition.slides.some((story) => /shooting/i.test(story.headline)), false);
  assert.equal(edition.latest.some((story) => edition.slides.some((slide) => slide.headline === story.headline)), false);

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
  const upload = saveUploadBytes(editor, jpeg, "ridge.jpg", "image");
  assert.throws(() => registerAsset(editor, { uploadId: upload.id, bytes: jpeg, ownerName: "A", licenceBasis: "commissioned", credit: "Desk", altText: "A ridge", acquiredOn: "2026-11-17" }), /owner|credit|description|permission/i);
  const asset = registerAsset(editor, { uploadId: upload.id, bytes: jpeg, ownerName: "Rustenburg Today", licenceBasis: "commissioned", credit: "Rustenburg Today", altText: "Magaliesberg ridge above the city", acquiredOn: "2026-11-17" });
  assert.equal(approvedHero(), null);
  assert.throws(() => placeAsset(editor, asset, "homepage_hero"), /approved/);
  decideAsset(editor, asset, "approve");
  placeAsset(editor, asset, "homepage_hero");
  const hero = approvedHero();
  assert.equal(hero?.alt, "Magaliesberg ridge above the city");
  assert.equal(hero?.credit, "Rustenburg Today");
  decideAsset(editor, asset, "withdraw");
  assert.equal(approvedHero(), null);
  assert.throws(() => saveUploadBytes(resident, Buffer.from("not-an-image"), "note.txt", "image"), /type/);
  assert.throws(() => createJob(seller, { title: "Paid placement", description: "A test vacancy that must not charge applicants.", jobType: "permanent", applicationFee: 100 }), /fee/);

  const jobId = createJob(seller, { title: "Test apprenticeship", description: "A test vacancy with no application fee.", jobType: "apprenticeship" });
  assert.throws(() => confirmVacancy(admin, jobId, "vacancy_confirmed", "short"), /confirmed/);
  confirmVacancy(admin, jobId, "vacancy_confirmed", "Called the official switchboard and matched the listing.", "https://example.com/apply");
  verifyEmployerIdentity(admin, seller.id, "Checked the company registration number on file.");
  assert.equal(get<{ badge: string }>("SELECT badge FROM job_verifications WHERE job_id = ?", jobId)?.badge, "vacancy_confirmed");

  assert.throws(() => setStationAir(admin, "on_air", "https://example.com/stream"), /licence/);
  saveRadioLicence(admin, { licenceType: "talk", holder: "Rustenburg Today", reference: "TEST-1", territory: "South Africa", startsOn: "2026-01-01", endsOn: "2026-12-31" });
  setStationAir(admin, "on_air", "https://example.com/stream");
  assert.equal(radioState().state, "on_air");
  setStationAir(admin, "offline");
  assert.equal(radioState().state, "offline");
  assert.throws(() => createCampaign(seller, { productPlacement: "homepage-banner", title: "Tobacco test", destinationUrl: "https://example.com", start: "2026-11-01", end: "2026-11-30", budgetRands: "10", altText: "A test creative", mediaUrl: "https://example.com/ad.png", kind: "tobacco" }), /not accepted/);
});

test("safetrack consent, sos honesty and emergency access", () => {
  const home = createHousehold(resident, "Test household");
  const invite = inviteAdult(resident, home, buyer.email);
  acceptInvite(buyer, invite);
  assert.equal(get<{ count: number }>("SELECT COUNT(*) as count FROM st_grants WHERE subject_user_id = ?", buyer.id)?.count, 0);
  assert.throws(() => inviteAdult(buyer, createHousehold(writer, "Second household"), resident.email), /not an active member/);

  const session = startSharing(resident);
  recordPoint(resident, session, { latitude: -25.67, longitude: 27.24, accuracyM: 25, capturedAt: new Date().toISOString() });
  assert.throws(() => latestPoint(buyer, resident.id), /permission/);
  assert.throws(() => latestPoint(admin, resident.id), /permission/);
  assert.throws(() => listAllPoints(), /directory/);
  assert.ok(get("SELECT id FROM st_audit WHERE action = 'location.read' AND outcome = 'denied'"));
  const grant = grantAccess(resident, buyer.id, "view_live_location");
  assert.equal(latestPoint(buyer, resident.id).fresh, true);
  revokeGrant(resident, grant);
  assert.throws(() => latestPoint(buyer, resident.id), /permission/);
  run("UPDATE st_points SET received_at = ?, captured_at = ? WHERE user_id = ?", new Date(Date.now() - 10 * 60 * 1000).toISOString(), new Date(Date.now() - 10 * 60 * 1000).toISOString(), resident.id);
  grantAccess(resident, buyer.id, "view_last_known");
  const stale = latestPoint(buyer, resident.id);
  assert.equal(stale.fresh, false);
  assert.match(stale.note, /older report/);

  addEmergencyContact(resident, buyer.id);
  const silent = raiseSos(resident, "idempotency-key-1");
  assert.equal(silent.queued, 0);
  assert.equal(silent.delivered, false);
  grantAccess(resident, buyer.id, "receive_sos");
  const sos = raiseSos(resident, "idempotency-key-2");
  assert.equal(sos.queued, 1);
  assert.equal(raiseSos(resident, "idempotency-key-2").id, sos.id);
  assert.equal(get<{ delivery_status: string }>("SELECT delivery_status FROM st_notifications WHERE incident_id = ?", sos.id)?.delivery_status, "queued");
  assert.equal(get<{ count: number }>("SELECT COUNT(*) as count FROM st_guardians WHERE guardian_user_id = ?", buyer.id)?.count, 0);

  const child = registerDependant(resident, home, { preferredName: "Aya", legalName: "Aya Example", dateOfBirth: "2016-04-02", relationship: "parent" });
  assert.throws(() => enableChildLocation(resident, child), /Verified guardian/);
  assert.throws(() => openMissingIncident(resident, { dependantId: child, clothing: "blue jacket" }), /Verified guardian/);
  const relationship = get<{ id: string }>("SELECT id FROM st_guardians WHERE dependant_id = ?", child);
  reviewGuardianship(admin, relationship!.id, true, "Reviewed the recorded birth evidence in this test.");
  enableChildLocation(resident, child);
  assert.equal(get<{ location_shared: number }>("SELECT location_shared FROM st_dependants WHERE id = ?", child)?.location_shared, 1);
  disputeGuardianship(buyer, child);
  assert.equal(get<{ location_shared: number }>("SELECT location_shared FROM st_dependants WHERE id = ?", child)?.location_shared, 0);
  assert.throws(() => reviewGuardianship(admin, relationship!.id, true, "A family admin cannot clear a dispute from this screen."), /frozen/);

  const missing = openMissingIncident(resident, { clothing: "blue jacket" });
  assert.match(missing.guidance, /Do not wait 24 hours/);
  markFound(resident, missing.id);
  assert.equal(get<{ status: string }>("SELECT status FROM st_incidents WHERE id = ?", missing.id)?.status, "person_located");

  const denied = requestEmergencyAccess(seller, { organisation: "SAPS", legalBasis: "Criminal Procedure Act", reason: "A person claims to need the last known position", scope: "last_known_location" });
  assert.equal(denied.status, "denied");
  run("INSERT INTO st_agencies (id, name, status) VALUES (?, 'Test Authority', 'verified')", newId());
  const request = requestEmergencyAccess(seller, { organisation: "Test Authority", legalBasis: "Immediate life-threatening emergency", reason: "Credible report of serious harm to this account holder", scope: "last_known_location", incidentId: sos.id });
  grantRole(editor.id, "emergency_reviewer");
  grantRole(writer.id, "emergency_reviewer");
  decideEmergencyAccess(editor, request.id, true, "First review records a life-threatening basis.");
  assert.equal(get<{ status: string }>("SELECT status FROM st_access_requests WHERE id = ?", request.id)?.status, "first_approval");
  assert.throws(() => decideEmergencyAccess(editor, request.id, true, "The same reviewer cannot approve twice."), /already reviewed/);
  decideEmergencyAccess(writer, request.id, true, "Second reviewer agrees the scope is limited.");
  const disclosed = discloseEmergencyAccess(writer, request.id);
  assert.equal(disclosed.scope, "last_known_location");
  assert.equal(disclosed.point?.fresh, false);

  assert.throws(() => startJourney(resident, { destination: "School", expectedArrival: new Date(Date.now() + 3600000).toISOString(), contactIds: [buyer.id] }), /journey-alert/);
  const journey = startJourney(resident, { destination: "Taxi rank", expectedArrival: new Date(Date.now() - 1000).toISOString(), contactIds: [] });
  processOverdueJourneys();
  assert.equal(get<{ status: string }>("SELECT status FROM st_journeys WHERE id = ?", journey)?.status, "checkin_due");
  assert.equal(get<{ result: string }>("SELECT result FROM st_checkins WHERE journey_id = ?", journey)?.result, "asked_subject");
  assert.equal(get<{ count: number }>("SELECT COUNT(*) as count FROM st_incidents WHERE incident_type = 'missing' AND id = ?", journey)?.count, 0);
});

test("saved titles, topic alerts, translations, closing dates and account closure", () => {
  const title = `Local desk note ${Math.random().toString(16).slice(2, 8)}`;
  const created = createArticle(writer, {
    categorySlug: "local-news",
    language: "en",
    title,
    excerpt: "A labelled test story used to check alerts and translations.",
    body: "This body is long enough to calculate a reading time from the actual words in the original article.",
  });
  assert.equal(followTopic(resident.id, "local-news"), true);
  assert.throws(() => followTopic(resident.id, "not-a-real-topic"), /Unknown topic/);
  submitArticle(writer, created.id);
  reviewArticle(editor, created.id, "publish");
  const published = getArticle(created.slug, "en");
  assert.ok((published?.readingMinutes || 0) >= 1);
  assert.equal(listNotifications(resident.id).some((item) => item.title === title), true);
  assert.throws(() => fileTranslation(resident, created.id, "tn", title, "A Setswana excerpt that is long enough.", "A Setswana body that is long enough to pass the article length check for a draft."), /permission/);
  fileTranslation(editor, created.id, "tn", `${title} tn`, "Setswana excerpt for the same original article.", "Setswana body for the same original article, kept as a draft until an editor approves it.");
  assert.equal(getArticle(created.slug, "tn")?.fallback, true);
  approveTranslation(editor, created.id, "tn");
  assert.equal(getArticle(created.slug, "tn")?.language, "tn");
  toggleBookmark(resident, "article", created.id);
  const saved = namedBookmarks(resident.id);
  assert.equal(saved.some((item) => item.title === title && item.href === `/news/${created.slug}`), true);
  assert.equal(relatedStories("local-news", { articleId: created.id }).some((item) => item.href === `/news/${created.slug}`), false);
  assert.equal(followStory(resident.id, "article", created.id), true);
  correctArticle(editor, created.id, "Corrected a labelled test detail.");
  assert.equal(listNotifications(resident.id).some((item) => item.title === "Correction"), true);
  assert.equal(listCorrections().some((item) => item.slug === created.slug), true);
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const near = createJob(seller, { title: "Near closing learnership", description: "A real test vacancy with a close deadline.", jobType: "learnership", closing: soon });
  const far = createJob(seller, { title: "Later closing learnership", description: "A real test vacancy with a distant deadline.", jobType: "learnership", closing: later });
  publishJob(admin, near);
  publishJob(admin, far);
  const closing = listJobs({ withinDays: 14 });
  assert.equal(closing.some((item) => item.id === near), true);
  assert.equal(closing.some((item) => item.id === far), false);
  const feed = briefingRss("http://localhost:3000");
  assert.match(feed, /<rss version="2.0">/);
  assert.match(feed, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const gone = account("closer");
  deleteAccount(gone, "password123", "DELETE");
  assert.throws(() => loginAccount(gone.email, "password123", { ip: "closed-account" }));
});
