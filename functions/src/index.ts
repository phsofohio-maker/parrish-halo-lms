/**
 * Cloud Functions for Harmony Health LMS
 *
 * Core business logic that MUST run server-side:
 * - Grade validation and audit enforcement
 * - Enrollment status cascades
 * - Remediation workflow automation
 * - Course grade calculations
 * - Competency status updates
 *
 * @module functions/src/index
 */

import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { google } from "googleapis";
import { Module } from "./types";

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// ============================================
// TYPES
// ============================================

interface GradeData {
  userId: string;
  moduleId: string;
  score: number;
  passingScore: number;
  passed: boolean;
  gradedBy: string;
  gradedAt: admin.firestore.Timestamp;
  attemptNumber?: number;
  notes?: string;
}

interface EnrollmentData {
  userId: string;
  courseId: string;
  progress: number;
  status: "not_started" | "in_progress" | "completed" | "failed";
  enrolledAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

interface AuditLogData {
  actorId: string;
  actorName: string;
  actionType: string;
  targetId: string;
  details: string;
  timestamp: admin.firestore.Timestamp;
  metadata?: Record<string, unknown>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Creates an immutable audit log entry
 * @param {string} actorId - ID of user performing action
 * @param {string} actorName - Name of user performing action
 * @param {string} actionType - Type of action performed
 * @param {string} targetId - ID of affected resource
 * @param {string} details - Human-readable description
 * @param {Record<string, unknown>} metadata - Additional context
 * @return {Promise<void>}
 */
async function createAuditLog(
  actorId: string,
  actorName: string,
  actionType: string,
  targetId: string,
  details: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const logData: AuditLogData = {
    actorId,
    actorName,
    actionType,
    targetId,
    details,
    timestamp: admin.firestore.Timestamp.now(),
    ...(metadata && { metadata }),
  };

  await db.collection("audit_logs").add(logData);

  logger.info("Audit log created", {
    actionType,
    targetId,
    actorId,
  });
}

/**
 * Sends a certificate-ready email by writing to the `mail` collection.
 * The Trigger Email extension processes the doc and dispatches the email.
 * Looks up the student's email from the users collection.
 * Creates an audit log entry on success.
 *
 * @param {object} params - Email params: certId, cert, file, actorId, actorName
 * @return {Promise<void>}
 */
async function sendCertificateEmail(params: {
  certId: string;
  cert: admin.firestore.DocumentData;
  storagePath: string;
  actorId: string;
  actorName: string;
}): Promise<void> {
  const { certId, cert, storagePath, actorId, actorName } = params;

  // Look up student email from users collection
  const userDoc = await db.collection("users").doc(cert.userId).get();
  if (!userDoc.exists) {
    logger.warn("Cannot send cert email — user not found", { userId: cert.userId, certId });
    return;
  }
  const studentEmail = userDoc.data()?.email;
  if (!studentEmail) {
    logger.warn("Cannot send cert email — user has no email", { userId: cert.userId, certId });
    return;
  }

  // Generate a signed URL with 7-day expiry
  const expiresMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const bucket = admin.storage().bucket();
  const [downloadUrl] = await bucket.file(storagePath).getSignedUrl({
    action: "read",
    expires: expiresMs,
  });

  const safeStudent = String(cert.studentName || "").trim() || "Colleague";
  const safeCourse = String(cert.courseName || "").trim() || "your course";
  const safeGrade = typeof cert.grade === "number" ? `${cert.grade}%` : String(cert.grade ?? "");

  await db.collection("mail").add({
    to: studentEmail,
    message: {
      subject: `Your Certificate for ${safeCourse} is Ready`,
      html: `
        <p>Congratulations ${safeStudent},</p>
        <p>You have successfully completed <strong>${safeCourse}</strong>
           with a grade of <strong>${safeGrade}</strong>.</p>
        <p>Your certificate (ID: <strong>${certId}</strong>) is ready for download.</p>
        <p><a href="${downloadUrl}">Download Your Certificate</a></p>
        <p style="color:#6b7280;font-size:12px">This download link expires in 7 days.
           Your certificate record is permanent and always available in Parrish HALO.</p>
        <p>— Parrish Health Systems Training</p>
      `,
    },
  });

  await createAuditLog(
    actorId,
    actorName,
    "CERTIFICATE_EMAIL_SENT",
    certId,
    `Certificate email queued for ${safeStudent} — ${safeCourse}`,
    {
      certId,
      courseId: cert.courseId,
      userId: cert.userId,
      recipientEmail: studentEmail,
    }
  );

  logger.info("Certificate email queued", { certId, recipientEmail: studentEmail });
}

/**
 * Validates grade data structure
 * @param {Record<string, unknown>} data - The raw data to validate
 * @return {boolean} True if valid
 */
function validateGradeData(data: any): data is GradeData {
  return (
    typeof data.userId === "string" &&
    typeof data.moduleId === "string" &&
    typeof data.score === "number" &&
    typeof data.passingScore === "number" &&
    typeof data.passed === "boolean" &&
    typeof data.gradedBy === "string" &&
    data.score >= 0 &&
    data.score <= 100 &&
    data.passingScore >= 0 &&
    data.passingScore <= 100
  );
}

/**
 * Calculates how many attempts a user has made on a module
 * @param {string} userId - ID of the user
 * @param {string} moduleId - ID of the module
 * @return {Promise<number>} Number of attempts
 */
async function getAttemptCount(
  userId: string,
  moduleId: string
): Promise<number> {
  const progressDoc = await db
    .collection("progress")
    .doc(`${userId}_${moduleId}`)
    .get();

  return progressDoc.exists ? progressDoc.data()?.totalAttempts || 0 : 0;
}

// ============================================
// FUNCTION 1: Grade Validation & Audit
// ============================================

export const onGradeCreate = onDocumentCreated(
  "grades/{gradeId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No data in snapshot");
      return;
    }

    const gradeData = snapshot.data() as GradeData;
    const gradeId = event.params.gradeId;

    logger.info("Grade created", { gradeId, userId: gradeData.userId });

    if (!validateGradeData({ data: gradeData as unknown as Record<string, unknown> })) {
      logger.error("Invalid grade data", { gradeId, gradeData });
      throw new HttpsError("invalid-argument", "Invalid grade data");
    }

    try {
      await createAuditLog(
        gradeData.gradedBy,
        "System",
        "GRADE_CREATE",
        gradeId,
        `Grade entered: ${gradeData.score}% ` +
          `(${gradeData.passed ? "PASSED" : "FAILED"}) ` +
          `for module ${gradeData.moduleId}`,
        {
          userId: gradeData.userId,
          moduleId: gradeData.moduleId,
          score: gradeData.score,
          passed: gradeData.passed,
        } as Record<string, unknown>
      );

      const attemptCount = await getAttemptCount(
        gradeData.userId,
        gradeData.moduleId
      );

      if (!gradeData.passed && attemptCount >= 3) {
        logger.warn("Remediation needed", {
          userId: gradeData.userId,
          moduleId: gradeData.moduleId,
          attempts: attemptCount,
        });

        await db.collection("remediation_requests").add({
          userId: gradeData.userId,
          moduleId: gradeData.moduleId,
          courseId: "",
          supervisorId: "",
          reason: `Failed module after ${attemptCount} attempts`,
          status: "pending",
          requestedAt: admin.firestore.Timestamp.now(),
        });

        await createAuditLog(
          "system",
          "System",
          "REMEDIATION_REQUEST_CREATE",
          gradeData.userId,
          `Auto-created remediation request after ${attemptCount} attempts`,
          { moduleId: gradeData.moduleId } as Record<string, unknown>
        );
      }
      logger.info("Grade processing complete", { gradeId });
    } catch (error) {
      logger.error("Error processing grade", { error, gradeId });
      throw error;
    }
  }
);

export const onGradeUpdate = onDocumentUpdated(
  "grades/{gradeId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) {
      logger.error("Missing data in grade update");
      return;
    }

    const before = beforeData as GradeData;
    const after = afterData as GradeData;
    const gradeId = event.params.gradeId;

    if (before.userId !== after.userId || before.moduleId !== after.moduleId) {
      logger.error("Attempted to change immutable grade fields", { gradeId });
      throw new HttpsError(
        "failed-precondition",
        "Cannot change userId or moduleId on existing grade"
      );
    }

    const changes = [];
    if (before.score !== after.score) {
      changes.push(`score: ${before.score} → ${after.score}`);
    }
    if (before.passed !== after.passed) {
      changes.push(`passed: ${before.passed} → ${after.passed}`);
    }

    await createAuditLog(
      after.gradedBy,
      "System",
      "GRADE_UPDATE",
      gradeId,
      `Grade modified: ${changes.join(", ")}`,
      {
        before: { score: before.score, passed: before.passed },
        after: { score: after.score, passed: after.passed },
      } as Record<string, unknown>
    );
  }
);

// ============================================
// FUNCTION 2: Enrollment Status Cascade
// ============================================

export const onEnrollmentUpdate = onDocumentUpdated(
  "enrollments/{enrollmentId}",
  async (event) => {
    if (!event.data) {
      logger.error("No data associated with the event");
      return;
    }

    const before = event.data.before.data() as EnrollmentData;
    const after = event.data.after.data() as EnrollmentData;
    const enrollmentId = event.params.enrollmentId;

    if (before.progress < 100 && after.progress === 100) {
      await event.data.after.ref.update({
        completedAt: admin.firestore.Timestamp.now(),
        status: "completed",
      });

      await createAuditLog(
        after.userId,
        "User",
        "ENROLLMENT_COMPLETE",
        enrollmentId,
        `Course completed: ${after.courseId}`,
        { courseId: after.courseId } as Record<string, unknown>
      );
    }

    if (before.status !== "failed" && after.status === "failed") {
      await createAuditLog(
        "system",
        "System",
        "ENROLLMENT_FAILED",
        enrollmentId,
        `Enrollment marked as failed for course ${after.courseId}`,
        {
          courseId: after.courseId,
          userId: after.userId,
        } as Record<string, unknown>
      );
    }
  }
);

// ============================================
// FUNCTION 3: Progress Tracking Validation
// ============================================

export const onProgressUpdate = onDocumentWritten(
  "progress/{progressId}",
  async (event) => {
    const progressId = event.params.progressId;

    if (!event.data?.after.exists) {
      logger.warn("Progress record deleted", { progressId });
      return;
    }

    const data = event.data.after.data();
    if (!data) return;

    if (data.overallProgress < 0 || data.overallProgress > 100) {
      throw new HttpsError("out-of-range", "Progress must be between 0-100");
    }

    if (!event.data.before.exists) {
      await createAuditLog(
        data.userId,
        "User",
        "PROGRESS_CREATE",
        progressId,
        `Started module ${data.moduleId}`,
        {
          moduleId: data.moduleId,
          courseId: data.courseId,
        } as Record<string, unknown>
      );
    }

    if (event.data.before.exists) {
      const beforeData = event.data.before.data();
      if (
        beforeData &&
        beforeData.overallProgress < 100 &&
        data.overallProgress === 100
      ) {
        await createAuditLog(
          data.userId,
          "User",
          "MODULE_COMPLETE",
          progressId,
          `Completed module ${data.moduleId}`,
          {
            moduleId: data.moduleId,
            courseId: data.courseId,
          } as Record<string, unknown>
        );
      }
    }
  }
);

// ============================================
// FUNCTION 4: Remediation Request Handler
// ============================================

export const onRemediationUpdate = onDocumentUpdated(
  "remediation_requests/{requestId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after || before.status === after.status) return;

    const requestId = event.params.requestId;

    if (after.status === "approved") {
      const progressId = `${after.userId}_${after.moduleId}`;
      await db.collection("progress").doc(progressId).update({
        overallProgress: 0,
        isComplete: false,
        totalAttempts: 0,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      await createAuditLog(
        after.resolvedBy || "system",
        "Supervisor",
        "REMEDIATION_APPROVED",
        requestId,
        `Remediation approved for ${after.moduleId}.`,
        {
          userId: after.userId,
          moduleId: after.moduleId,
        } as Record<string, unknown>
      );
    }
  }
);

// ============================================
// FUNCTION 5: Course Grade Calculator (Callable)
// ============================================

export const calculateCourseGrade = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const { userId, courseId } = request.data;
  if (!userId || !courseId) {
    throw new HttpsError("invalid-argument", "Missing IDs");
  }

  try {
    const modulesSnap = await db
      .collection("courses")
      .doc(courseId)
      .collection("modules")
      .get();
    const modules = modulesSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Module[];

    const gradesSnap = await db
      .collection("grades")
      .where("userId", "==", userId)
      .get();

    const gradesByModule = new Map();
    gradesSnap.docs.forEach((doc) => {
      const grade = doc.data();
      gradesByModule.set(grade.moduleId, grade);
    });

    let totalWeightedScore = 0;
    let totalWeight = 0;
    let criticalPassed = 0;
    let totalCritical = 0;
    const moduleBreakdown = [];

    for (const mod of modules) {
      const grade = gradesByModule.get(mod.id);
      const weight = mod.weight || 0;
      const isCrit = mod.isCritical || false;

      if (isCrit) totalCritical++;
      if (grade) {
        const wScore = (grade.score * weight) / 100;
        totalWeightedScore += wScore;
        totalWeight += weight;
        if (isCrit && grade.passed) criticalPassed++;

        moduleBreakdown.push({
          moduleId: mod.id,
          score: grade.score,
          weight,
          passed: grade.passed,
        });
      }
    }

    const overallScore = totalWeight > 0 ? totalWeightedScore : 0;
    const result = {
      courseId,
      userId,
      overallScore: Math.round(overallScore * 10) / 10,
      overallPassed: overallScore >= 70 && criticalPassed === totalCritical,
      calculatedAt: admin.firestore.Timestamp.now(),
    };

    await db
      .collection("course_grades")
      .doc(`${userId}_${courseId}`)
      .set(result);
    return result;
  } catch (error) {
    throw new HttpsError("internal", "Calculation failed");
  }
});

// ============================================
// FUNCTION: Create Invited User (Accept Invitation)
// ============================================

/**
 * Callable function that handles the accept-invitation flow.
 * This MUST run server-side because:
 * 1. Client-side createUserWithEmailAndPassword cannot set custom claims
 * 2. Token validation must be tamper-proof
 * 3. The invitation status update must be atomic with account creation
 *
 * Called from the AcceptInvite page after the user fills in their details.
 */
export const createInvitedUser = onCall(async (request) => {
  const { token, displayName, password } = request.data;

  // Validate inputs
  if (!token || typeof token !== "string") {
    throw new HttpsError("invalid-argument", "Invitation token is required.");
  }
  if (!displayName || typeof displayName !== "string" || displayName.trim().length < 2) {
    throw new HttpsError("invalid-argument", "Full name is required (minimum 2 characters).");
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
  }

  try {
    // 1. Look up the invitation by token
    const invitationsSnap = await db
      .collection("invitations")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (invitationsSnap.empty) {
      throw new HttpsError("not-found", "Invalid or expired invitation link.");
    }

    const invitationDoc = invitationsSnap.docs[0];
    const invitation = invitationDoc.data();

    // 2. Validate invitation status
    if (invitation.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        invitation.status === "accepted" ?
          "This invitation has already been used." :
          `This invitation is ${invitation.status}.`
      );
    }

    // 3. Check expiration
    const expiresAt = invitation.expiresAt?.toDate?.();
    if (expiresAt && expiresAt < new Date()) {
      // Mark as expired
      await invitationDoc.ref.update({ status: "expired" });
      throw new HttpsError(
        "deadline-exceeded",
        "This invitation has expired. Please ask your administrator to send a new one."
      );
    }

    // 4. Create Firebase Auth account
    const userRecord = await admin.auth().createUser({
      email: invitation.email,
      password,
      displayName: displayName.trim(),
    });

    // 5. Set JWT custom claims with the role from the invitation
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: invitation.role,
    });

    // 6. Create Firestore user profile
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      displayName: displayName.trim(),
      email: invitation.email,
      role: invitation.role,
      department: invitation.department || null,
      createdAt: admin.firestore.Timestamp.now(),
      createdVia: "invitation",
      invitationId: invitationDoc.id,
    });

    // 7. Mark invitation as accepted
    await invitationDoc.ref.update({
      status: "accepted",
      acceptedAt: admin.firestore.Timestamp.now(),
      acceptedBy: userRecord.uid,
    });

    // 8. Create audit log entry
    await createAuditLog(
      userRecord.uid,
      displayName.trim(),
      "USER_LOGIN",
      userRecord.uid,
      `Account created via invitation. Role: ${invitation.role}. Email: ${invitation.email}.`,
      {
        invitationId: invitationDoc.id,
        role: invitation.role,
        department: invitation.department,
        invitedBy: invitation.invitedBy,
      }
    );

    logger.info("Invited user account created", {
      uid: userRecord.uid,
      email: invitation.email,
      role: invitation.role,
    });

    return {
      success: true,
      uid: userRecord.uid,
      email: invitation.email,
      role: invitation.role,
    };
  } catch (error: any) {
    // Re-throw HttpsErrors as-is
    if (error.code && error.code.startsWith("functions/")) {
      throw error;
    }
    // Firebase Auth errors
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError(
        "already-exists",
        "An account with this email already exists. Please log in instead."
      );
    }
    logger.error("Failed to create invited user:", error);
    throw new HttpsError("internal", "Failed to create account. Please try again.");
  }
});

// ============================================
// FUNCTION: Validate Invitation Token (Public)
// ============================================

/**
 * Callable function to validate an invitation token without auth.
 * Returns the invitation email and status so the AcceptInvite page
 * can pre-fill the email field and show appropriate messages.
 */
export const validateInvitationToken = onCall(async (request) => {
  const { token } = request.data;

  if (!token || typeof token !== "string") {
    throw new HttpsError("invalid-argument", "Token is required.");
  }

  const invitationsSnap = await db
    .collection("invitations")
    .where("token", "==", token)
    .limit(1)
    .get();

  if (invitationsSnap.empty) {
    throw new HttpsError("not-found", "Invalid invitation link.");
  }

  const invitation = invitationsSnap.docs[0].data();

  // Check expiration
  const expiresAt = invitation.expiresAt?.toDate?.();
  if (invitation.status === "pending" && expiresAt && expiresAt < new Date()) {
    await invitationsSnap.docs[0].ref.update({ status: "expired" });
    return { valid: false, reason: "expired" };
  }

  if (invitation.status !== "pending") {
    return { valid: false, reason: invitation.status };
  }

  return {
    valid: true,
    email: invitation.email,
    role: invitation.role,
    department: invitation.department,
  };
});

// ============================================
// FUNCTION: Set User Role (Custom Claims)
// ============================================

/**
 * Sets custom claims (role) on a Firebase Auth user.
 * Only callable by admins. Bootstrap the first admin
 * by temporarily allowing any authenticated user, then
 * restrict to admins only.
 *
 * Usage from client:
 *   const setRole = httpsCallable(functions, 'setUserRole');
 *   await setRole({ targetUid: 'abc123', role: 'admin' });
 */
export const setUserRole = onCall(async (request) => {
  // Must be authenticated
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const { targetUid, role } = request.data;

  // Validate inputs
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "targetUid is required.");
  }

  const validRoles = ["admin", "instructor", "content_author", "staff"];
  if (!role || !validRoles.includes(role)) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid role. Must be one of: ${validRoles.join(", ")}`
    );
  }

  if (request.auth.token.role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can set roles.");
  }

  try {
    // Set the custom claim
    await admin.auth().setCustomUserClaims(targetUid, { role });

    // Also update the Firestore user document to keep in sync
    await db.collection("users").doc(targetUid).set(
      { role, updatedAt: admin.firestore.Timestamp.now() },
      { merge: true }
    );

    // Audit log
    await createAuditLog(
      request.auth.uid,
      request.auth.token.name || "Unknown",
      "USER_ROLE_CHANGE",
      targetUid,
      `Role set to "${role}" for user ${targetUid}`,
      { previousRole: "unknown", newRole: role }
    );

    logger.info(`Role "${role}" set for user ${targetUid}`);
    return { success: true, uid: targetUid, role };
  } catch (error) {
    logger.error("Failed to set user role:", error);
    throw new HttpsError("internal", "Failed to set user role.");
  }
});

// ============================================
// FUNCTION: Create Direct Account (Admin Fallback Onboarding)
// ============================================

/**
 * Strips undefined values from an object so Firestore writes don't fail.
 * @param {Record<string, any>} obj - Object to sanitize
 * @return {Record<string, any>} Object with undefined values removed
 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

/**
 * Admin-callable function that provisions a fully functional account in
 * one shot — Firebase Auth user + JWT custom claims + Firestore profile +
 * audit log. Used as the deliverability fallback when the email-driven
 * invitation pipeline cannot reach the recipient.
 */
export const createDirectAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  if (request.auth.token.role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can create accounts.");
  }

  const { email, displayName, role, department, temporaryPassword } = request.data || {};

  // 1. Validate inputs
  if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }
  if (!displayName || typeof displayName !== "string" || displayName.trim().length < 2) {
    throw new HttpsError("invalid-argument", "Full name is required (minimum 2 characters).");
  }
  const validRoles = ["admin", "instructor", "staff", "content_author"];
  if (!role || !validRoles.includes(role)) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid role. Must be one of: ${validRoles.join(", ")}`
    );
  }
  if (!temporaryPassword || typeof temporaryPassword !== "string" || temporaryPassword.length < 8) {
    throw new HttpsError("invalid-argument", "Temporary password must be at least 8 characters.");
  }

  try {
    // 2. Create Firebase Auth account
    const userRecord = await admin.auth().createUser({
      email,
      password: temporaryPassword,
      displayName: displayName.trim(),
    });

    // 3. Set JWT custom claims with the role
    await admin.auth().setCustomUserClaims(userRecord.uid, { role });

    // 4. Create Firestore user profile
    await db.collection("users").doc(userRecord.uid).set(stripUndefined({
      uid: userRecord.uid,
      displayName: displayName.trim(),
      email,
      role,
      department: department || null,
      requiresPasswordChange: true,
      createdAt: admin.firestore.Timestamp.now(),
      createdVia: "admin_direct",
      createdBy: request.auth.uid,
    }));

    // 5. Audit log
    await createAuditLog(
      request.auth.uid,
      request.auth.token.name || "Admin",
      "ACCOUNT_DIRECT_CREATE",
      userRecord.uid,
      `Direct account created for ${email} as ${role}.`,
      {
        targetUid: userRecord.uid,
        email,
        role,
        department: department || null,
      }
    );

    logger.info("Direct account created", {
      uid: userRecord.uid,
      email,
      role,
      createdBy: request.auth.uid,
    });

    return {
      success: true,
      uid: userRecord.uid,
      email,
      role,
    };
  } catch (error: any) {
    if (error.code && typeof error.code === "string" && error.code.startsWith("functions/")) {
      throw error;
    }
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError(
        "already-exists",
        "An account with this email already exists."
      );
    }
    if (error.code === "auth/invalid-email") {
      throw new HttpsError("invalid-argument", "The email address is not valid.");
    }
    if (error.code === "auth/invalid-password") {
      throw new HttpsError("invalid-argument", "The password does not meet Firebase requirements.");
    }
    logger.error("Failed to create direct account:", error);
    throw new HttpsError("internal", "Failed to create account. Please try again.");
  }
});

// ============================================
// FUNCTION: Force Password Change Audit (Callable)
// ============================================

/**
 * Records a forced-password-change audit event after a user completes
 * the first-login interstitial. Client also clears
 * `requiresPasswordChange` on the user profile; this callable produces
 * a server-side audit record that cannot be tampered with.
 */
export const recordForcedPasswordChange = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  await createAuditLog(
    request.auth.uid,
    request.auth.token.name || "User",
    "PASSWORD_CHANGE_FORCED",
    request.auth.uid,
    "User completed forced first-login password change.",
    { uid: request.auth.uid }
  );

  return { success: true };
});

// ============================================
// FUNCTION: Generate Certificate (CE Credit Vault)
// ============================================

/**
 * Generates a certificate for a completed course.
 *
 * Pipeline:
 * 1. Validate the certificate request
 * 2. Copy the Google Docs template
 * 3. Replace all placeholder variables
 * 4. Export as PDF
 * 5. Upload PDF to Firebase Storage
 * 6. Update the certificate Firestore document
 *
 * Requires: Google Docs API enabled, template shared with service account.
 */
export const generateCertificate = onCall(
  { timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Auth required");
    }

    const { certId } = request.data;
    if (!certId || typeof certId !== "string") {
      throw new HttpsError("invalid-argument", "certId is required");
    }

    try {
      // 1. Load certificate document
      const certDoc = await db.collection("certificates").doc(certId).get();
      if (!certDoc.exists) {
        throw new HttpsError("not-found", "Certificate not found");
      }
      const cert = certDoc.data()!;

      // 2. Load course to get template doc ID
      const courseDoc = await db.collection("courses").doc(cert.courseId).get();
      if (!courseDoc.exists) {
        throw new HttpsError("not-found", "Course not found");
      }
      const course = courseDoc.data()!;
      const templateDocId = cert.templateDocId || course.certificateTemplateDocId;

      if (!templateDocId) {
        // No template — mark as generated without PDF
        await certDoc.ref.update({
          status: "generated",
          updatedAt: admin.firestore.Timestamp.now(),
        });
        return { success: true, certId, hasPdf: false };
      }

      // 3. Initialize Google APIs with default credentials
      const auth = new google.auth.GoogleAuth({
        scopes: [
          "https://www.googleapis.com/auth/documents",
          "https://www.googleapis.com/auth/drive",
        ],
      });
      const docs = google.docs({ version: "v1", auth });
      const drive = google.drive({ version: "v3", auth });

      // 4. Copy the template document
      const copyResponse = await drive.files.copy({
        fileId: templateDocId,
        requestBody: {
          name: `Certificate - ${cert.studentName} - ${cert.courseName}`,
        },
      });
      const generatedDocId = copyResponse.data.id;
      if (!generatedDocId) {
        throw new Error("Failed to copy template document");
      }

      // 5. Load org config for issuer name
      let issuerName = cert.issuerName || "Parrish Health Systems Education Department";
      let orgName = "Parrish Health Systems";
      try {
        const orgDoc = await db
          .collection("organizations")
          .doc(cert.orgId || "parrish")
          .get();
        if (orgDoc.exists) {
          const orgData = orgDoc.data()!;
          issuerName = orgData.issuerName || issuerName;
          orgName = orgData.name || orgName;
        }
      } catch {
        // Use defaults
      }

      // 6. Replace placeholders in the document
      const replacements: Record<string, string> = {
        "{{STUDENT_NAME}}": cert.studentName || "",
        "{{COURSE_TITLE}}": cert.courseName || "",
        "{{COMPLETION_DATE}}": new Date(cert.issuedAt).toLocaleDateString(
          "en-US",
          { year: "numeric", month: "long", day: "numeric" }
        ),
        "{{GRADE}}": `${cert.grade}%`,
        "{{CERT_ID}}": certId,
        "{{ORG_NAME}}": orgName,
        "{{ISSUER_NAME}}": issuerName,
        "{{CE_CREDITS}}": `${cert.ceCredits}`,
      };

      const replaceRequests = Object.entries(replacements).map(
        ([placeholder, value]) => ({
          replaceAllText: {
            containsText: { text: placeholder, matchCase: true },
            replaceText: value,
          },
        })
      );

      await docs.documents.batchUpdate({
        documentId: generatedDocId,
        requestBody: { requests: replaceRequests },
      });

      // 7. Export as PDF
      const pdfResponse = await drive.files.export(
        { fileId: generatedDocId, mimeType: "application/pdf" },
        { responseType: "arraybuffer" }
      );

      const pdfBuffer = Buffer.from(pdfResponse.data as ArrayBuffer);

      // 8. Upload to Firebase Storage
      const storagePath =
        cert.pdfStoragePath ||
        `certificates/${cert.orgId || "parrish"}/${cert.userId}/${cert.courseId}/${certId}.pdf`;
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      await file.save(pdfBuffer, {
        contentType: "application/pdf",
        metadata: {
          metadata: {
            certId,
            userId: cert.userId,
            courseId: cert.courseId,
          },
        },
      });

      // 9. Update certificate document
      await certDoc.ref.update({
        status: "generated",
        generatedDocId,
        pdfStoragePath: storagePath,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // 10. Clean up: delete the generated Google Doc (we have the PDF)
      try {
        await drive.files.delete({ fileId: generatedDocId });
      } catch {
        // Non-critical — doc will sit in Drive
        logger.warn("Could not delete generated doc", { generatedDocId });
      }

      // 11. Audit log
      await createAuditLog(
        request.auth.uid,
        request.auth.token.name || "System",
        "CERTIFICATE_ISSUED",
        certId,
        `Certificate PDF generated for ${cert.studentName} — ${cert.courseName}`,
        { userId: cert.userId, courseId: cert.courseId }
      );

      // 12. Send certificate email notification (non-blocking)
      // Email failure must NOT fail certificate generation.
      try {
        await sendCertificateEmail({
          certId,
          cert,
          storagePath,
          actorId: request.auth.uid,
          actorName: request.auth.token.name || "System",
        });
      } catch (emailError) {
        logger.error("Certificate email send failed (non-blocking)", {
          certId,
          error: emailError,
        });
      }

      logger.info("Certificate generated", { certId, storagePath });
      return { success: true, certId, hasPdf: true, storagePath };
    } catch (error: any) {
      logger.error("Certificate generation failed", { certId, error });

      // Update certificate status to failed
      try {
        await db.collection("certificates").doc(certId).update({
          status: "failed",
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } catch {
        // Non-critical
      }

      if (error.code && error.code.startsWith("functions/")) {
        throw error;
      }

      // Check for common Google API errors
      if (error.code === 403 || error.status === 403) {
        throw new HttpsError(
          "permission-denied",
          "Cannot access the certificate template. Ensure the Google Doc is shared with the service account."
        );
      }

      throw new HttpsError("internal", "Certificate generation failed");
    }
  }
);
