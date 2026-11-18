import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { ageFromDob } from "@/lib/text";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { sessionSecret } from "./crypto";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { hasPermission } from "./permissions";
import { rateLimit } from "./store";

const POLICY = "safetrack-2026-11";
const GUARDIAN_TYPES = new Set(["parent", "legal_guardian", "court_caregiver", "foster_caregiver"]);
const SAPS_GUIDANCE = "Report the missing person to the South African Police Service immediately. Do not wait 24 hours. SafeTrack does not contact SAPS for you.";

function key(): Buffer {
  return createHash("sha256").update(`safetrack:${process.env.SAFETRACK_DATA_KEY || sessionSecret()}`).digest();
}

export function seal(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function openSeal(value: string): string {
  const [iv, tag, body] = value.split(".");
  if (!iv || !tag || !body) throw new AppError(500, "Stored safety record could not be read");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

function audit(actor: string | null, action: string, resource: string, id: string | null, outcome: string, purpose?: string): void {
  run(
    "INSERT INTO st_audit (id, actor_user_id, action, resource_type, resource_id, purpose, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    newId(),
    actor,
    action,
    resource,
    id,
    purpose || null,
    outcome,
    new Date().toISOString(),
  );
}

function adult(user: SessionUser): void {
  ensureReady();
  assertActive(user);
  if (user.isMinor) throw new AppError(403, "This safety action is available to an adult account");
  const dob = get<{ date_of_birth: string | null }>("SELECT date_of_birth FROM profiles WHERE user_id = ?", user.id)?.date_of_birth;
  const age = dob ? ageFromDob(dob) : null;
  if (!dob || age === null) throw new AppError(403, "Add your date of birth before using SafeTrack");
  if (age < 18) throw new AppError(403, "This safety action is available to an adult account");
}

export function saveBirthDate(user: SessionUser, dateOfBirth: string): void {
  assertActive(user);
  const existing = get<{ date_of_birth: string | null }>("SELECT date_of_birth FROM profiles WHERE user_id = ?", user.id)?.date_of_birth;
  if (existing) throw new AppError(409, "A date of birth is already recorded");
  const age = ageFromDob(dateOfBirth);
  if (age === null) throw new AppError(400, "Enter a valid date of birth");
  if (age < 18) throw new AppError(403, "SafeTrack households are for adults");
  run("UPDATE profiles SET date_of_birth = ?, updated_at = ? WHERE user_id = ?", dateOfBirth, new Date().toISOString(), user.id);
  audit(user.id, "profile.birth", "user", user.id, "recorded");
}

function member(householdId: string, userId: string): { id: string } {
  const row = get<{ id: string }>("SELECT id FROM st_members WHERE household_id = ? AND user_id = ? AND membership_status = 'active'", householdId, userId);
  if (!row) throw new AppError(403, "You are not an active member of this household");
  return row;
}

export function createHousehold(user: SessionUser, name: string): string {
  adult(user);
  if (name.trim().length < 2 || name.trim().length > 80) throw new AppError(400, "Give the household a short name");
  const id = newId();
  const stamp = new Date().toISOString();
  transaction(() => {
    run("INSERT INTO st_households (id, name, created_by, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)", id, name.trim(), user.id, stamp, stamp);
    run("INSERT INTO st_members (id, household_id, user_id, relationship_type, membership_status, joined_at, created_at) VALUES (?, ?, ?, 'adult', 'active', ?, ?)", newId(), id, user.id, stamp, stamp);
  });
  audit(user.id, "household.create", "household", id, "allowed");
  return id;
}

export function inviteAdult(user: SessionUser, householdId: string, email: string): string {
  adult(user);
  member(householdId, user.id);
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new AppError(400, "Enter the adult's account email");
  const id = newId();
  run("INSERT INTO st_invitations (id, household_id, email, invited_by, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)", id, householdId, email.trim().toLowerCase(), user.id, new Date().toISOString());
  audit(user.id, "household.invite", "invitation", id, "allowed");
  return id;
}

export function acceptInvite(user: SessionUser, invitationId: string): void {
  adult(user);
  const invite = get<{ id: string; household_id: string; email: string; status: string }>("SELECT id, household_id, email, status FROM st_invitations WHERE id = ?", invitationId);
  if (!invite || invite.status !== "pending") throw new AppError(404, "Invitation not found");
  const account = get<{ email: string }>("SELECT email FROM users WHERE id = ?", user.id);
  if (!account || account.email.toLowerCase() !== invite.email) throw new AppError(403, "This invitation is for a different account");
  if (get("SELECT id FROM st_members WHERE household_id = ? AND user_id = ? AND membership_status = 'active'", invite.household_id, user.id)) throw new AppError(409, "You are already in this household");
  const stamp = new Date().toISOString();
  transaction(() => {
    run("UPDATE st_invitations SET status = 'accepted' WHERE id = ?", invite.id);
    run("INSERT INTO st_members (id, household_id, user_id, relationship_type, membership_status, joined_at, created_at) VALUES (?, ?, ?, 'adult', 'active', ?, ?)", newId(), invite.household_id, user.id, stamp, stamp);
  });
  audit(user.id, "household.join", "household", invite.household_id, "allowed", "Invitation does not grant location access");
}

export function registerDependant(user: SessionUser, householdId: string, input: { preferredName: string; legalName: string; dateOfBirth: string; relationship: string }): string {
  adult(user);
  member(householdId, user.id);
  if (!GUARDIAN_TYPES.has(input.relationship)) throw new AppError(400, "Choose a guardian relationship. A safety contact is not a guardian.");
  const age = ageFromDob(input.dateOfBirth);
  if (age === null || age >= 18 || age < 0) throw new AppError(400, "A dependant profile is for a person under 18");
  if (input.preferredName.trim().length < 2 || input.legalName.trim().length < 2) throw new AppError(400, "Enter the dependant's name");
  const id = newId();
  const stamp = new Date().toISOString();
  transaction(() => {
    run(
      "INSERT INTO st_dependants (id, household_id, preferred_name, legal_name_sealed, dob_sealed, location_shared, created_by, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
      id,
      householdId,
      input.preferredName.trim(),
      seal(input.legalName.trim()),
      seal(input.dateOfBirth),
      user.id,
      stamp,
    );
    run(
      "INSERT INTO st_guardians (id, dependant_id, guardian_user_id, relationship_type, authority_status, verification_status, created_at) VALUES (?, ?, ?, ?, 'pending', 'submitted', ?)",
      newId(),
      id,
      user.id,
      input.relationship,
      stamp,
    );
  });
  audit(user.id, "dependant.register", "dependant", id, "pending", "Guardian authority is not granted by the claim");
  return id;
}

export function disputeGuardianship(user: SessionUser, dependantId: string): void {
  adult(user);
  const dependant = get<{ household_id: string }>("SELECT household_id FROM st_dependants WHERE id = ?", dependantId);
  if (!dependant) throw new AppError(404, "Dependant profile not found");
  member(dependant.household_id, user.id);
  const stamp = new Date().toISOString();
  transaction(() => {
    run("UPDATE st_guardians SET authority_status = 'disputed', verification_status = 'disputed' WHERE dependant_id = ?", dependantId);
    run("UPDATE st_grants SET status = 'frozen', revoked_at = ? WHERE subject_dependant_id = ? AND status = 'active'", stamp, dependantId);
    run("UPDATE st_dependants SET location_shared = 0 WHERE id = ?", dependantId);
  });
  audit(user.id, "guardian.dispute", "dependant", dependantId, "frozen");
}

export function reviewGuardianship(reviewer: SessionUser, relationshipId: string, approve: boolean, note: string): void {
  assertActive(reviewer);
  if (!hasPermission(reviewer.id, "safetrack.verify")) throw new AppError(403, "Guardian evidence is reviewed by a verification officer");
  if (note.trim().length < 8) throw new AppError(400, "Record the review note");
  const row = get<{ id: string; guardian_user_id: string; dependant_id: string; authority_status: string }>("SELECT id, guardian_user_id, dependant_id, authority_status FROM st_guardians WHERE id = ?", relationshipId);
  if (!row) throw new AppError(404, "Guardian claim not found");
  if (row.guardian_user_id === reviewer.id) throw new AppError(403, "You cannot review your own guardian claim");
  if (row.authority_status === "disputed") throw new AppError(409, "Disputed authority stays frozen until the dispute is resolved with evidence");
  const stamp = new Date().toISOString();
  run(
    "UPDATE st_guardians SET authority_status = ?, verification_status = ?, evidence_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
    approve ? "verified" : "rejected",
    approve ? "verified" : "rejected",
    note.trim(),
    reviewer.id,
    stamp,
    row.id,
  );
  audit(reviewer.id, approve ? "guardian.approve" : "guardian.reject", "guardian", row.id, approve ? "allowed" : "denied");
}

export function grantAccess(subject: SessionUser, granteeId: string, permission: string): string {
  adult(subject);
  if (subject.id === granteeId) throw new AppError(400, "You cannot grant a permission to yourself");
  if (permission === "manage_child_safety" || GUARDIAN_TYPES.has(permission)) throw new AppError(400, "Guardian authority is not a permission you can give yourself or another adult");
  if (!["view_profile", "view_live_location", "view_last_known", "receive_sos", "receive_journey_alerts", "view_emergency_information"].includes(permission)) throw new AppError(400, "Choose a specific permission");
  if (!get("SELECT id FROM users WHERE id = ? AND status = 'active'", granteeId)) throw new AppError(404, "That person does not have an account");
  const stamp = new Date().toISOString();
  const id = newId();
  transaction(() => {
    run(
      "INSERT INTO st_grants (id, subject_user_id, grantee_user_id, permission, legal_basis, status, starts_at, created_at) VALUES (?, ?, ?, ?, 'consent', 'active', ?, ?)",
      id,
      subject.id,
      granteeId,
      permission,
      stamp,
      stamp,
    );
    run("INSERT INTO st_consent (id, subject_user_id, actor_user_id, consent_type, purpose, policy_version, granted_at) VALUES (?, ?, ?, ?, ?, ?, ?)", newId(), subject.id, subject.id, permission, permission, POLICY, stamp);
    run("INSERT INTO st_grant_history (id, grant_id, action, actor_user_id, reason, created_at) VALUES (?, ?, 'granted', ?, ?, ?)", newId(), id, subject.id, "Subject granted this permission", stamp);
  });
  audit(subject.id, "grant.create", "grant", id, "allowed", permission);
  return id;
}

export function revokeGrant(subject: SessionUser, grantId: string): void {
  adult(subject);
  const grant = get<{ id: string; subject_user_id: string | null; status: string }>("SELECT id, subject_user_id, status FROM st_grants WHERE id = ?", grantId);
  if (!grant || grant.subject_user_id !== subject.id) throw new AppError(403, "You can withdraw a permission you gave");
  const stamp = new Date().toISOString();
  transaction(() => {
    run("UPDATE st_grants SET status = 'revoked', revoked_at = ? WHERE id = ?", stamp, grant.id);
    run("UPDATE st_consent SET withdrawn_at = ? WHERE subject_user_id = ? AND withdrawn_at IS NULL AND purpose = (SELECT permission FROM st_grants WHERE id = ?)", stamp, subject.id, grant.id);
    run("INSERT INTO st_grant_history (id, grant_id, action, actor_user_id, reason, created_at) VALUES (?, ?, 'revoked', ?, 'Subject withdrew consent', ?)", newId(), grant.id, subject.id, stamp);
  });
  audit(subject.id, "grant.revoke", "grant", grant.id, "revoked");
}

export function addEmergencyContact(owner: SessionUser, contactId: string): string {
  adult(owner);
  if (owner.id === contactId) throw new AppError(400, "Choose another person");
  if (!get("SELECT id FROM users WHERE id = ?", contactId)) throw new AppError(404, "That person does not have an account");
  const id = newId();
  run("INSERT INTO st_contacts (id, owner_user_id, contact_user_id, kind, created_at) VALUES (?, ?, ?, 'emergency', ?)", id, owner.id, contactId, new Date().toISOString());
  audit(owner.id, "contact.add", "contact", id, "allowed", "Emergency contact is not a guardian and has no location access");
  return id;
}

export function enableChildLocation(guardian: SessionUser, dependantId: string): void {
  adult(guardian);
  const link = verifiedGuardian(guardian.id, dependantId);
  if (link.authority_status === "disputed") throw new AppError(409, "Location sharing stays off while guardianship is disputed");
  const stamp = new Date().toISOString();
  transaction(() => {
    run("UPDATE st_dependants SET location_shared = 1 WHERE id = ?", dependantId);
    run(
      "INSERT INTO st_grants (id, subject_dependant_id, grantee_user_id, permission, legal_basis, status, starts_at, created_at) VALUES (?, ?, ?, 'view_live_location', 'guardian_authority', 'active', ?, ?)",
      newId(),
      dependantId,
      guardian.id,
      stamp,
      stamp,
    );
    run(
      "INSERT INTO st_consent (id, subject_dependant_id, actor_user_id, consent_type, purpose, policy_version, granted_at) VALUES (?, ?, ?, 'child_location', 'view_live_location', ?, ?)",
      newId(),
      dependantId,
      guardian.id,
      POLICY,
      stamp,
    );
  });
  audit(guardian.id, "child.location.on", "dependant", dependantId, "allowed", "Shown to the household as sharing that is not hidden from the child");
}

export function startSharing(user: SessionUser): string {
  adult(user);
  const id = newId();
  run("INSERT INTO st_sessions (id, user_id, status, started_at) VALUES (?, ?, 'active', ?)", id, user.id, new Date().toISOString());
  audit(user.id, "location.session", "session", id, "allowed");
  return id;
}

export function recordPoint(user: SessionUser, sessionId: string, input: { latitude: number; longitude: number; accuracyM: number; capturedAt: string }): string {
  assertActive(user);
  const session = get<{ user_id: string; status: string }>("SELECT user_id, status FROM st_sessions WHERE id = ?", sessionId);
  if (!session || session.user_id !== user.id || session.status !== "active") throw new AppError(403, "This sharing session is not yours");
  if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) throw new AppError(400, "That position is not usable");
  if (!Number.isFinite(input.accuracyM) || input.accuracyM <= 0 || input.accuracyM > 5000) throw new AppError(400, "Include a location accuracy in metres");
  const captured = Date.parse(input.capturedAt);
  if (!Number.isFinite(captured) || captured > Date.now() + 2 * 60 * 1000) throw new AppError(400, "The position time is not valid");
  const id = newId();
  run(
    "INSERT INTO st_points (id, user_id, session_id, latitude_sealed, longitude_sealed, accuracy_m, captured_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    user.id,
    sessionId,
    seal(String(input.latitude)),
    seal(String(input.longitude)),
    Math.round(input.accuracyM),
    new Date(captured).toISOString(),
    new Date().toISOString(),
  );
  audit(user.id, "location.point", "session", sessionId, "stored");
  return id;
}

export type FreshPoint = { latitude: number; longitude: number; accuracyM: number; capturedAt: string; receivedAt: string; fresh: boolean; note: string };

export function latestPoint(viewer: SessionUser, subjectId: string): FreshPoint {
  assertActive(viewer);
  if (viewer.id !== subjectId && !activeGrant(subjectId, viewer.id, ["view_live_location", "view_last_known"])) {
    audit(viewer.id, "location.read", "user", subjectId, "denied");
    throw new AppError(403, "You do not have permission to see this person's location");
  }
  const point = get<{ latitude_sealed: string; longitude_sealed: string; accuracy_m: number; captured_at: string; received_at: string }>(
    "SELECT latitude_sealed, longitude_sealed, accuracy_m, captured_at, received_at FROM st_points WHERE user_id = ? ORDER BY received_at DESC LIMIT 1",
    subjectId,
  );
  if (!point) throw new AppError(404, "No location has been reported");
  audit(viewer.id, "location.read", "user", subjectId, "allowed");
  return present(point);
}

export function listAllPoints(): never {
  throw new AppError(403, "There is no directory of people's locations");
}

export function startJourney(user: SessionUser, input: { destination: string; expectedArrival: string; contactIds: string[] }): string {
  adult(user);
  if (input.destination.trim().length < 2) throw new AppError(400, "Name the destination");
  if (!Number.isFinite(Date.parse(input.expectedArrival))) throw new AppError(400, "Choose an expected arrival time");
  for (const contactId of input.contactIds) {
    if (!activeGrant(user.id, contactId, ["receive_journey_alerts"])) throw new AppError(403, "A journey contact needs a journey-alert permission. Household membership is not enough.");
  }
  const id = newId();
  const stamp = new Date().toISOString();
  transaction(() => {
    run("INSERT INTO st_journeys (id, user_id, destination, expected_arrival_at, status, started_at) VALUES (?, ?, ?, ?, 'active', ?)", id, user.id, input.destination.trim(), input.expectedArrival, stamp);
    for (const contactId of input.contactIds) run("INSERT INTO st_journey_contacts (journey_id, contact_user_id) VALUES (?, ?)", id, contactId);
  });
  audit(user.id, "journey.start", "journey", id, "allowed");
  return id;
}

export function checkIn(user: SessionUser, journeyId: string): void {
  assertActive(user);
  const journey = get<{ user_id: string; status: string }>("SELECT user_id, status FROM st_journeys WHERE id = ?", journeyId);
  if (!journey || journey.user_id !== user.id || journey.status !== "active") throw new AppError(403, "This journey is not active for you");
  run("INSERT INTO st_checkins (id, journey_id, result, recorded_at) VALUES (?, ?, 'ok', ?)", newId(), journeyId, new Date().toISOString());
  audit(user.id, "journey.checkin", "journey", journeyId, "allowed");
}

export function completeJourney(user: SessionUser, journeyId: string): void {
  assertActive(user);
  const journey = get<{ user_id: string }>("SELECT user_id FROM st_journeys WHERE id = ? AND status = 'active'", journeyId);
  if (!journey || journey.user_id !== user.id) throw new AppError(403, "This journey is not active for you");
  run("UPDATE st_journeys SET status = 'completed', completed_at = ? WHERE id = ?", new Date().toISOString(), journeyId);
}

export function raiseSos(user: SessionUser, idempotencyKey: string, note?: string): { id: string; reference: string; queued: number; delivered: false; serverAccepted: true } {
  assertActive(user);
  if (idempotencyKey.trim().length < 8) throw new AppError(400, "Include an idempotency key");
  const existing = get<{ id: string; reference_code: string }>("SELECT id, reference_code FROM st_incidents WHERE initiated_by = ? AND idempotency_key = ?", user.id, idempotencyKey.trim());
  if (existing) {
    const queued = get<{ count: number }>("SELECT COUNT(*) as count FROM st_notifications WHERE incident_id = ?", existing.id)?.count ?? 0;
    return { id: existing.id, reference: existing.reference_code, queued, delivered: false, serverAccepted: true };
  }
  rateLimit(`sos:${user.id}`, 5, 10 * 60 * 1000);
  const contacts = all<{ contact_user_id: string }>(
    `SELECT c.contact_user_id FROM st_contacts c
     JOIN st_grants g ON g.subject_user_id = c.owner_user_id AND g.grantee_user_id = c.contact_user_id
     WHERE c.owner_user_id = ? AND c.kind = 'emergency' AND g.permission = 'receive_sos' AND g.status = 'active' AND g.revoked_at IS NULL`,
    user.id,
  );
  const id = newId();
  const reference = `ST-${randomInt(100000, 999999)}`;
  const stamp = new Date().toISOString();
  transaction(() => {
    run(
      "INSERT INTO st_incidents (id, reference_code, idempotency_key, subject_user_id, initiated_by, incident_type, status, note_sealed, created_at) VALUES (?, ?, ?, ?, ?, 'sos', 'submitted', ?, ?)",
      id,
      reference,
      idempotencyKey.trim(),
      user.id,
      user.id,
      note ? seal(note.slice(0, 500)) : null,
      stamp,
    );
    for (const contact of contacts) {
      run("INSERT INTO st_notifications (id, incident_id, recipient_user_id, delivery_status, created_at) VALUES (?, ?, ?, 'queued', ?)", newId(), id, contact.contact_user_id, stamp);
    }
    if (contacts.length) run("UPDATE st_incidents SET status = 'contacts_queued' WHERE id = ?", id);
  });
  audit(user.id, "sos.create", "incident", id, "accepted", `${contacts.length} notifications queued, none marked delivered`);
  return { id, reference, queued: contacts.length, delivered: false, serverAccepted: true };
}

export function openMissingIncident(user: SessionUser, input: { dependantId?: string; lastSeenAt?: string; clothing?: string; policeStation?: string; caseReference?: string }): { id: string; reference: string; guidance: string } {
  adult(user);
  let dependantId: string | null = null;
  if (input.dependantId) {
    const link = verifiedGuardian(user.id, input.dependantId);
    if (link.authority_status !== "verified") throw new AppError(403, "A missing-person record for a child needs verified guardian authority");
    dependantId = input.dependantId;
  }
  const id = newId();
  const reference = `ST-${randomInt(100000, 999999)}`;
  const stamp = new Date().toISOString();
  transaction(() => {
    run(
      "INSERT INTO st_incidents (id, reference_code, subject_user_id, subject_dependant_id, initiated_by, incident_type, status, created_at) VALUES (?, ?, ?, ?, ?, 'missing', 'submitted', ?)",
      id,
      reference,
      dependantId ? null : user.id,
      dependantId,
      user.id,
      stamp,
    );
    run(
      "INSERT INTO st_missing (id, incident_id, last_seen_at, clothing_sealed, police_station, case_reference_sealed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      newId(),
      id,
      input.lastSeenAt || null,
      input.clothing ? seal(input.clothing.slice(0, 300)) : null,
      input.policeStation?.trim() || null,
      input.caseReference ? seal(input.caseReference.trim()) : null,
      stamp,
    );
  });
  audit(user.id, "missing.open", "incident", id, "accepted");
  return { id, reference, guidance: SAPS_GUIDANCE };
}

export function markFound(user: SessionUser, incidentId: string): void {
  assertActive(user);
  const incident = get<{ initiated_by: string; status: string }>("SELECT initiated_by, status FROM st_incidents WHERE id = ?", incidentId);
  if (!incident || incident.initiated_by !== user.id) throw new AppError(403, "You cannot change this incident");
  if (incident.status === "closed") throw new AppError(409, "This platform incident is already closed");
  run("UPDATE st_incidents SET status = 'person_located', resolved_at = ? WHERE id = ?", new Date().toISOString(), incidentId);
  audit(user.id, "missing.found", "incident", incidentId, "allowed", "This does not close a SAPS case");
}

export function requestEmergencyAccess(requester: SessionUser, input: { organisation: string; legalBasis: string; reason: string; scope: string; incidentId?: string }): { id: string; status: string } {
  assertActive(requester);
  if (input.reason.trim().length < 12 || input.legalBasis.trim().length < 8) throw new AppError(400, "Record the legal basis and why the information is necessary");
  if (!["last_known_location", "incident_summary"].includes(input.scope)) throw new AppError(400, "Request a specific set of records");
  const agency = get<{ id: string }>("SELECT id FROM st_agencies WHERE lower(name) = lower(?) AND status = 'verified'", input.organisation.trim());
  const id = newId();
  const stamp = new Date().toISOString();
  if (!agency) {
    run(
      "INSERT INTO st_access_requests (id, incident_id, organisation_name, requester_user_id, legal_basis, reason, scope, status, denial_reason, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'denied', ?, ?)",
      id,
      input.incidentId || null,
      input.organisation.trim(),
      requester.id,
      input.legalBasis.trim(),
      input.reason.trim(),
      input.scope,
      "The organisation is not a verified official requester. Claiming to be a police officer is not enough.",
      stamp,
    );
    audit(requester.id, "emergency_access.request", "access_request", id, "denied");
    return { id, status: "denied" };
  }
  run(
    "INSERT INTO st_access_requests (id, incident_id, organisation_name, requester_user_id, legal_basis, reason, scope, status, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?)",
    id,
    input.incidentId || null,
    input.organisation.trim(),
    requester.id,
    input.legalBasis.trim(),
    input.reason.trim(),
    input.scope,
    stamp,
  );
  audit(requester.id, "emergency_access.request", "access_request", id, "submitted");
  return { id, status: "submitted" };
}

export function decideEmergencyAccess(reviewer: SessionUser, requestId: string, approve: boolean, reason: string): void {
  assertActive(reviewer);
  if (!hasPermission(reviewer.id, "safetrack.review")) throw new AppError(403, "Emergency access is reviewed by an appointed reviewer");
  if (reason.trim().length < 8) throw new AppError(400, "Record the decision");
  const request = get<{ id: string; requester_user_id: string; status: string; legal_basis: string }>("SELECT id, requester_user_id, status, legal_basis FROM st_access_requests WHERE id = ?", requestId);
  if (!request || request.status === "denied") throw new AppError(409, "This request is not awaiting review");
  if (request.requester_user_id === reviewer.id) throw new AppError(403, "The requester cannot approve their own access");
  const prior = all<{ reviewer_user_id: string }>("SELECT reviewer_user_id FROM st_access_approvals WHERE request_id = ? AND decision = 'approved'", request.id);
  if (prior.some((row) => row.reviewer_user_id === reviewer.id)) throw new AppError(409, "You have already reviewed this request");
  const stamp = new Date().toISOString();
  run("INSERT INTO st_access_approvals (id, request_id, reviewer_user_id, decision, reason, decided_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), request.id, reviewer.id, approve ? "approved" : "denied", reason.trim(), stamp);
  if (!approve) {
    run("UPDATE st_access_requests SET status = 'denied', denial_reason = ? WHERE id = ?", reason.trim(), request.id);
    audit(reviewer.id, "emergency_access.deny", "access_request", request.id, "denied");
    return;
  }
  const life = /life|serious harm/i.test(request.legal_basis);
  const approvals = prior.length + 1;
  if (life && approvals < 2) {
    run("UPDATE st_access_requests SET status = 'first_approval' WHERE id = ?", request.id);
    audit(reviewer.id, "emergency_access.first", "access_request", request.id, "pending_second");
    return;
  }
  run("UPDATE st_access_requests SET status = 'approved' WHERE id = ?", request.id);
  audit(reviewer.id, "emergency_access.approve", "access_request", request.id, "approved");
}

export function discloseEmergencyAccess(reviewer: SessionUser, requestId: string): { expiresAt: string; scope: string; point: FreshPoint | null } {
  assertActive(reviewer);
  if (!hasPermission(reviewer.id, "safetrack.review")) throw new AppError(403, "Disclosure is limited to an appointed reviewer");
  const request = get<{ id: string; status: string; scope: string; incident_id: string | null; requester_user_id: string }>("SELECT id, status, scope, incident_id, requester_user_id FROM st_access_requests WHERE id = ?", requestId);
  if (!request || request.status !== "approved") throw new AppError(403, "Disclosure waits for the required approval");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const cap = new Date(Date.now() + 72 * 60 * 60 * 1000);
  if (expires > cap) expires.setTime(cap.getTime());
  let point: FreshPoint | null = null;
  if (request.scope === "last_known_location" && request.incident_id) {
    const incident = get<{ subject_user_id: string | null }>("SELECT subject_user_id FROM st_incidents WHERE id = ?", request.incident_id);
    const row = incident?.subject_user_id
      ? get<{ latitude_sealed: string; longitude_sealed: string; accuracy_m: number; captured_at: string; received_at: string }>("SELECT latitude_sealed, longitude_sealed, accuracy_m, captured_at, received_at FROM st_points WHERE user_id = ? ORDER BY received_at DESC LIMIT 1", incident.subject_user_id)
      : undefined;
    point = row ? present(row) : null;
  }
  const receipt = point ? `last point captured ${point.capturedAt}, fresh=${point.fresh}` : "no location record in scope";
  run(
    "INSERT INTO st_disclosures (id, request_id, scope, disclosed_by, disclosed_at, expires_at, receipt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    request.id,
    request.scope,
    reviewer.id,
    new Date().toISOString(),
    expires.toISOString(),
    receipt,
  );
  run("UPDATE st_access_requests SET status = 'disclosed' WHERE id = ?", request.id);
  audit(reviewer.id, "emergency_access.disclose", "access_request", request.id, "disclosed", request.scope);
  return { expiresAt: expires.toISOString(), scope: request.scope, point };
}

export function fileConcern(user: SessionUser, body: string): string {
  assertActive(user);
  if (body.trim().length < 12) throw new AppError(400, "Describe the safety concern");
  const id = newId();
  run("INSERT INTO st_concerns (id, reporter_user_id, body_sealed, status, created_at) VALUES (?, ?, ?, 'open', ?)", id, user.id, seal(body.trim().slice(0, 2000)), new Date().toISOString());
  audit(user.id, "concern.file", "concern", id, "accepted");
  return id;
}

export function mySafety(user: SessionUser): {
  households: Array<{ id: string; name: string }>;
  grants: Array<{ id: string; grantee_user_id: string; display_name: string; permission: string; status: string }>;
  contacts: Array<{ id: string; contact_user_id: string; display_name: string; kind: string }>;
  dependants: Array<{ id: string; preferred_name: string; location_shared: number; authority_status: string; verification_status: string; relationship_type: string; guardian_id: string }>;
  invites: Array<{ id: string; name: string }>;
  incidents: Array<{ id: string; reference_code: string; incident_type: string; status: string; created_at: string }>;
} {
  assertActive(user);
  return {
    households: all("SELECT h.id, h.name FROM st_households h JOIN st_members m ON m.household_id = h.id WHERE m.user_id = ? AND m.membership_status = 'active'", user.id),
    grants: all("SELECT g.id, g.grantee_user_id, p.display_name, g.permission, g.status FROM st_grants g JOIN profiles p ON p.user_id = g.grantee_user_id WHERE g.subject_user_id = ? ORDER BY g.created_at DESC", user.id),
    contacts: all("SELECT c.id, c.contact_user_id, p.display_name, c.kind FROM st_contacts c JOIN profiles p ON p.user_id = c.contact_user_id WHERE c.owner_user_id = ?", user.id),
    dependants: all(
      `SELECT d.id, d.preferred_name, d.location_shared, g.authority_status, g.verification_status, g.relationship_type, g.id as guardian_id
       FROM st_dependants d JOIN st_guardians g ON g.dependant_id = d.id
       WHERE g.guardian_user_id = ?`,
      user.id,
    ),
    invites: all("SELECT i.id, h.name FROM st_invitations i JOIN st_households h ON h.id = i.household_id JOIN users u ON lower(u.email) = i.email WHERE u.id = ? AND i.status = 'pending'", user.id),
    incidents: all("SELECT id, reference_code, incident_type, status, created_at FROM st_incidents WHERE initiated_by = ? OR subject_user_id = ? ORDER BY created_at DESC", user.id, user.id),
  };
}

export function accountIdByEmail(email: string): string {
  const row = get<{ id: string }>("SELECT id FROM users WHERE lower(email) = lower(?)", email.trim());
  if (!row) throw new AppError(404, "No account uses that email");
  return row.id;
}

export function openConcerns(user: SessionUser): Array<{ id: string; created_at: string; body: string }> {
  assertActive(user);
  if (!user.roles.includes("privacy_officer")) throw new AppError(403, "Safety concerns are opened by a privacy officer");
  return all<{ id: string; created_at: string; body_sealed: string }>("SELECT id, created_at, body_sealed FROM st_concerns WHERE status = 'open' ORDER BY created_at DESC").map((row) => ({
    id: row.id,
    created_at: row.created_at,
    body: openSeal(row.body_sealed),
  }));
}

export function desk(user: SessionUser): { claims: Array<Record<string, unknown>>; incidents: Array<Record<string, unknown>>; requests: Array<Record<string, unknown>> } {
  assertActive(user);
  const verify = hasPermission(user.id, "safetrack.verify");
  const incidents = hasPermission(user.id, "safetrack.incidents");
  const review = hasPermission(user.id, "safetrack.review");
  if (!verify && !incidents && !review) throw new AppError(403, "This desk is for appointed safety staff");
  return {
    claims: verify ? all("SELECT g.id, d.preferred_name, g.relationship_type, g.verification_status, g.authority_status FROM st_guardians g JOIN st_dependants d ON d.id = g.dependant_id WHERE g.verification_status IN ('submitted', 'disputed')") : [],
    incidents: incidents ? all("SELECT id, reference_code, incident_type, status, created_at FROM st_incidents ORDER BY created_at DESC LIMIT 50") : [],
    requests: review ? all("SELECT id, organisation_name, legal_basis, scope, status, denial_reason, submitted_at FROM st_access_requests ORDER BY submitted_at DESC LIMIT 50") : [],
  };
}

export function processOverdueJourneys(): number {
  ensureReady();
  const due = all<{ id: string; user_id: string }>("SELECT id, user_id FROM st_journeys WHERE status = 'active' AND expected_arrival_at < ?", new Date().toISOString());
  for (const journey of due) {
    run("UPDATE st_journeys SET status = 'checkin_due' WHERE id = ? AND status = 'active'", journey.id);
    run("INSERT INTO st_checkins (id, journey_id, result, recorded_at) VALUES (?, ?, 'asked_subject', ?)", newId(), journey.id, new Date().toISOString());
    audit(null, "journey.overdue", "journey", journey.id, "asked_subject", "A missed check-in is not a missing-person case");
  }
  return due.length;
}

export { SAPS_GUIDANCE };

function verifiedGuardian(userId: string, dependantId: string): { authority_status: string } {
  const link = get<{ authority_status: string; verification_status: string }>("SELECT authority_status, verification_status FROM st_guardians WHERE dependant_id = ? AND guardian_user_id = ?", dependantId, userId);
  if (!link || link.verification_status !== "verified" || link.authority_status !== "verified") throw new AppError(403, "Verified guardian authority is required");
  return link;
}

function activeGrant(subjectId: string, granteeId: string, permissions: string[]): boolean {
  const row = get<{ permission: string }>(
    `SELECT permission FROM st_grants
     WHERE subject_user_id = ? AND grantee_user_id = ? AND status = 'active' AND revoked_at IS NULL
       AND permission IN (${permissions.map(() => "?").join(", ")})`,
    subjectId,
    granteeId,
    ...permissions,
  );
  return Boolean(row);
}

function present(point: { latitude_sealed: string; longitude_sealed: string; accuracy_m: number; captured_at: string; received_at: string }): FreshPoint {
  const age = Date.now() - Date.parse(point.received_at);
  const fresh = age >= 0 && age <= 2 * 60 * 1000;
  return {
    latitude: Number(openSeal(point.latitude_sealed)),
    longitude: Number(openSeal(point.longitude_sealed)),
    accuracyM: point.accuracy_m,
    capturedAt: point.captured_at,
    receivedAt: point.received_at,
    fresh,
    note: fresh ? "Reported within the last two minutes." : "This is an older report. It is not a live position.",
  };
}
