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
