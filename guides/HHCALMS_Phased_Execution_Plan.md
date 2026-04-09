# HHCALMS Phased Execution Plan

**From Current State to Stabilized Deployment**
Harmony Health LMS · Parrish Health Systems
April 7, 2026

---

## How to Use This Document

This is a sequenced execution plan designed for use with Claude Code against the HHCALMS Firebase codebase. Each step is independently verifiable — complete the step, run the verification, confirm passing, then proceed. **Do not skip ahead.** The dependency chain is load-bearing: each step assumes the one before it is verified.

**Estimated total: 7–9 focused working days**

---

## Current Baseline

- **31/31** smoke tests passing
- **6** Cloud Functions live in production
- **3-tier RBAC** enforced via JWT custom claims (fail-closed)
- **Immutable audit trail** on every write operation
- **Phase 1: 100%** · Phase 2: 80% · Phase 3: 30% · Phase 4: 0%
- System is in **operations mode** — real nurses are actively using the platform
- **Guide 11** (Student UX Hardening) elevated to active priority after nurse-reported auto-save gap

---

## Phase 2 Completion: Close the Gradebook (80% → 100%)

**Why this is first:** The gradebook owns the core learning loop — student submits → instructor reviews → grade calculates. Every downstream feature (certifications, analytics, cohort enrollment) assumes this loop works end-to-end. It must be airtight before anything else.

**Estimated time: 3–4 days**

---

### Step 1: Fix Two Firestore Blockers

**Guide Reference:** Guide 2 (Phase A from Claude Code Execution Brief)
**Estimated Time:** 2–4 hours
**Priority:** CRITICAL — unblocks everything below

These are configuration changes, not code changes. Both blockers were diagnosed on March 3 with exact fixes documented.

#### 1A: Update Firestore Security Rules for Cross-User Enrollment Reads

**Root Cause:** Instructors and admins cannot read enrollments across users. The `enrollments` collection rules only allow a user to read their own enrollment documents. This means the Grade Review Queue in `GradeManagement.tsx` returns empty for instructors.

**What to do:**
Update `firestore.rules` to allow admin and instructor roles to read any enrollment document:

```
match /enrollments/{enrollmentId} {
  allow read: if request.auth != null && (
    request.auth.token.role in ['admin', 'instructor'] ||
    resource.data.userId == request.auth.uid
  );
  // ... existing write rules unchanged
}
```

**Key principle:** "Rules are not filters" — Firestore rejects the entire query if *any* document in the result set would be unauthorized. The query in `GradeManagement.tsx` fetches all `needs_review` enrollments, which span multiple users. Without the role-based read permission, the query fails silently.

**Verification:**
1. Deploy updated rules: `firebase deploy --only firestore:rules`
2. Log in as an instructor account
3. Open browser DevTools → Network tab
4. Navigate to Grade Management page
5. Confirm no Firestore permission errors in console
6. If enrollment documents with `status: 'needs_review'` exist, they should appear in the queue

#### 1B: Create Missing Composite Indexes

**Root Cause:** The `needs_review` query in `GradeManagement.tsx` requires composite indexes that haven't been created. Without them, the query returns empty even when matching documents exist. Firestore logs the required index URL in the browser console when the query fails.

**What to do:**
1. Open browser DevTools console on the Grade Management page
2. Look for a Firestore error containing a URL like: `https://console.firebase.google.com/v1/r/project/parrish-harmonyhca/firestore/indexes?create_composite=...`
3. Click the URL — it opens Firebase Console with the index pre-configured
4. Click "Create Index" and wait for it to build (usually 2–5 minutes)
5. If no error URL appears, create the index manually in Firebase Console → Firestore → Indexes:
   - Collection: `enrollments`
   - Fields: `status` (Ascending), `updatedAt` (Descending)

**Alternative approach:** Check `firestore.indexes.json` in the project root. If the indexes are defined there but not deployed:
```bash
firebase deploy --only firestore:indexes
```

**Verification:**
1. Index status shows "Enabled" in Firebase Console → Firestore → Indexes
2. The `needs_review` query in GradeManagement no longer throws index errors
3. If test data exists with `status: 'needs_review'`, results appear in the queue

---

### Step 2: E2E Verify the Submission-to-Review Pipeline

**Guide Reference:** Guide 2 (Steps 1–4)
**Estimated Time:** 4–6 hours
**Depends On:** Step 1 (blockers must be fixed first)

This is verification, not construction. The code exists — you're confirming the chain works end-to-end with real Firestore data.

#### 2A: Verify Submission Triggers `needs_review` Status

**What to do:**
1. Log in as a staff/learner account
2. Enroll in a course that contains a module with short-answer quiz questions
3. Navigate to CoursePlayer, complete the module, submit the quiz
4. Open Firebase Console → Firestore → `enrollments` collection
5. Find the enrollment document for this user+course
6. Confirm `status` field is `needs_review`

**If status is NOT `needs_review`:**
The fix is in `useModuleProgress.ts` or `CoursePlayer.tsx`. Trace the flow:
- `CoursePlayer.handleSubmit()` → `submitQuiz()` from `useModuleProgress` hook
- `gradeQuiz()` should return `needsReview: true` when short-answer questions are present
- If `needsReview` is true, the enrollment status must be set to `needs_review` (not `completed`)
- Add a status update call after quiz submission when `needsReview` is detected

**Files involved:** `src/pages/CoursePlayer.tsx`, `src/hooks/useModuleProgress.ts`

#### 2B: Verify Instructor Can See and Review Submissions

**What to do:**
1. Log in as an instructor account
2. Navigate to Grade Management page
3. Confirm the submission from 2A appears in the review queue
4. Open the review modal — verify all student answers render correctly per question type
5. Test approve flow: approve the submission with or without a score override
6. Check Firestore: `grades` collection should have a new document, `enrollments` status should change to `completed`
7. Test reject flow: use a different submission, reject with a reason
8. Check Firestore: enrollment should reset to `in_progress`

**If the review modal can't find student answers:**
Check where answers are persisted:
- Look in `progress/{userId}_{moduleId}` document
- Or in the enrollment document's metadata
- The modal calls `getModuleWithBlocks` for quiz definitions — it needs to pair these with stored answers

**Files involved:** `src/pages/GradeManagement.tsx`, `src/services/progressService.ts`

#### 2C: Verify Grade Recalculation Chain

**What to do:**
After an instructor approves a submission in 2B:
1. Check Firestore `grades` collection — new grade document should exist
2. Check Cloud Functions logs in Firebase Console — `onGradeCreate` should have fired
3. Check `audit_logs` collection — an entry for the grade creation should exist
4. Check `course_grades/{userId}_{courseId}` — Cloud Function 6 should have recalculated and persisted the course-level weighted grade

**If course grade doesn't recalculate:**
- Verify Cloud Function 6 is deployed: `firebase functions:list`
- Check Cloud Functions logs for errors
- Confirm the trigger is `onDocumentCreated` on the `grades` collection

**Files involved:** `functions/src/index.ts` (Cloud Function 6), `src/services/gradeService.ts`

**Step 2 Verification (all must pass):**
- [ ] Learner submits quiz with short-answer → enrollment status becomes `needs_review`
- [ ] Instructor sees submission in Grade Management queue
- [ ] Review modal renders all answers correctly
- [ ] Approve → grade document created + audit log + course grade recalculated
- [ ] Reject → enrollment resets to `in_progress` + audit log with reason
- [ ] No Firestore permission errors in browser console throughout

---

### Step 3: Wire Grade UI to Live Firestore Data

**Guide Reference:** Guide 1
**Estimated Time:** 4–6 hours
**Depends On:** Step 2 (need real grade data to verify against)

The components are already built: `GradeBreakdown`, `GradeSummaryCard`, `CourseRoster`. They currently consume mock data. Wire them to real Firestore collections.

#### 3A: Wire GradeSummaryCard into Dashboard

**What to do:**
In `src/pages/Dashboard.tsx`, for each completed enrollment card:
1. Query `course_grades/{userId}_{courseId}` to get the course-level grade
2. Render `GradeSummaryCard` with the real `CourseGradeCalculation` data
3. Handle the case where no grade exists yet (enrollment completed but grade not calculated)

#### 3B: Wire GradeBreakdown into MyGrades

**What to do:**
In `src/pages/MyGrades.tsx`:
1. Query `course_grades` for the logged-in user
2. For each course grade, render `GradeBreakdown` with per-module score data
3. Ensure the weighted grade display matches what Cloud Function 6 calculated

#### 3C: Wire CourseRoster into GradeManagement

**What to do:**
In `src/pages/GradeManagement.tsx`:
1. For each course, query all enrollments to build the roster
2. Render `CourseRoster` with enrolled learners and their grade status
3. Clicking a roster row should expand to show `GradeBreakdown` for that student

**Step 3 Verification:**
- [ ] Dashboard shows grade summary for completed enrollments
- [ ] MyGrades page shows per-module breakdown with weighted course grade
- [ ] GradeManagement shows full roster with grade status per student
- [ ] No Firestore permission errors in console
- [ ] Grade data matches what Firebase Console shows in `course_grades`

**Phase 2 is complete when all Step 1–3 verifications pass.**

---

## Bridge: Student UX Hardening (Guide 11)

**Why this sits between Phase 2 and infrastructure:** Guide 11's auto-save fix changes how answers persist in `CoursePlayer.tsx`. Guide 2's review modal reads those answers back. By verifying the core loop first (Phase 2), then hardening the student experience, you're improving a system you've already confirmed works — not debugging two moving targets in the same file.

**Estimated time: 2–3 days**

---

### Step 4: Debounced Draft Auto-Save (The Nurse's Fix)

**Guide Reference:** Guide 11, Fix 1.1
**Estimated Time:** 4–6 hours
**Depends On:** Phase 2 complete (Step 3 verified)
**This is the architectural foundation — 4 subsequent Guide 11 fixes depend on it.**

**Root Cause:** `CoursePlayer.tsx` stores all quiz answers in React `useState`. There is no intermediate Firestore persistence. If the nurse closes her browser, navigates away, or her session times out, all answers are lost. The module reloads completely blank on return.

#### What to do:

1. **Add `draftAnswers` field to the progress document schema**
   - Location: `progress/{userId}_{moduleId}` in Firestore
   - New field: `draftAnswers: Record<string, any>` — stores the current `answers` state object
   - New field: `draftSavedAt: Timestamp` — last auto-save timestamp
   - This is additive — no existing fields are modified

2. **Create a debounced save function in `CoursePlayer.tsx`**
   - On every answer change, reset a 30-second debounce timer
   - When the timer fires, write the current `answers` state to `draftAnswers` on the progress document
   - Use `stripUndefined()` before the Firestore write (required — Firestore rejects `undefined` values)
   - Do NOT create an audit log entry for draft saves (these are ephemeral, not compliance-relevant)

3. **Hydrate draft on module load**
   - In `useModuleProgress` (or wherever the progress document is fetched on mount), check for `draftAnswers`
   - If `draftAnswers` exists and the module is not yet completed, pre-populate the `answers` state
   - Show a subtle toast: "Draft answers restored" so the nurse knows her work was saved

4. **Clear draft on successful submit**
   - After `submitQuiz()` succeeds, delete the `draftAnswers` and `draftSavedAt` fields from the progress document
   - This prevents stale drafts from being restored after submission

**Out of Scope (do not touch):**
- Cloud Functions
- Firestore security rules (the progress document is already writable by the owning user)
- `gradeService.ts`
- `enrollmentService.ts`

**Verification:**
- [ ] Start a quiz, answer 2–3 questions, wait 30 seconds
- [ ] Check Firebase Console → `progress/{userId}_{moduleId}` → `draftAnswers` field exists with correct answers
- [ ] Close the browser tab entirely
- [ ] Re-open the course and navigate to the same module
- [ ] Answers are pre-populated from draft — toast confirms "Draft answers restored"
- [ ] Submit the quiz successfully — `draftAnswers` field is deleted from the progress document
- [ ] The submission-to-review pipeline from Step 2 still works correctly with the new persistence layer

---

### Step 5: Remaining Tier 1 + Tier 2 Student Fixes

**Guide Reference:** Guide 11, Fixes 1.2–2.4
**Estimated Time:** 1–2 days
**Depends On:** Step 4 (auto-save must be working)

These fixes build on the draft persistence foundation from Step 4.

#### 5A: Unsaved Changes Warning (Fix 1.2)

Add a `beforeunload` event listener in `CoursePlayer.tsx` that fires when there are unsaved draft answers (i.e., answers in React state that haven't been persisted to Firestore yet). This is the browser's native "Are you sure you want to leave?" dialog.

**Files:** `src/pages/CoursePlayer.tsx`

#### 5B: Submit Success Confirmation (Fix 2.1)

When `submitQuiz()` succeeds, show a clear success modal or toast with the quiz score (for auto-graded questions) or a "Submitted for review" message (for short-answer). Currently the submission happens silently — this is the gap the UI Feedback Audit flagged as CRITICAL.

**Files:** `src/pages/CoursePlayer.tsx`

#### 5C: Resume Indicator on Return (Fix 2.2)

When the student returns to a module that has `draftAnswers`, show a visual indicator that they're resuming (not starting fresh). A banner at the top of CoursePlayer: "Resuming from where you left off" with the `draftSavedAt` timestamp.

**Files:** `src/pages/CoursePlayer.tsx`

#### 5D: Module Navigation from Within Player (Fix 2.3)

Add "Next Module" / "Previous Module" navigation within CoursePlayer so the nurse doesn't have to back out to the course detail page and re-enter. Query the course's module list and determine the current module's position.

**Files:** `src/pages/CoursePlayer.tsx`

#### 5E: Last Module Indicator on Dashboard (Fix 2.4)

On the Dashboard enrollment cards, show which module the student was last working on. Pull from the most recent `progress` document's module reference.

**Files:** `src/pages/Dashboard.tsx`

**Step 5 Verification:**
- [ ] Navigating away from an unsaved quiz triggers browser warning
- [ ] Successful quiz submission shows clear feedback (score or "submitted for review")
- [ ] Returning to a module with draft answers shows "Resuming" banner with timestamp
- [ ] "Next Module" button navigates to the next module without leaving the player
- [ ] Dashboard cards show the last-active module for in-progress enrollments

---

## Infrastructure: Deploy & Harden

**Why this comes after student UX:** Deploy the verified, student-hardened system rather than deploying something you're still debugging.

**Estimated time: 1–2 days**

---

### Step 6: Confirm Seed Data Execution

**Guide Reference:** Guide 5
**Estimated Time:** 2–4 hours

#### What to do:

1. Run the seed script: execute `seedAll.ts` using the `initAdmin` credential pattern
2. Verify in Firebase Console → Authentication:
   - 12 user accounts exist
   - 3 accounts have expired license dates (for LicenseGate testing)
   - Each account has correct JWT custom claims (`role`, `orgId`)
3. Verify in Firebase Console → Firestore:
   - User profile documents exist in `users` collection with matching data
   - At least one complete training course exists in `courses` collection
   - Course has multiple modules with quiz blocks (including short-answer)
   - Course status is `published` (not `draft`)
4. Verify audit trail: `audit_logs` collection should have entries for each seeded account creation

**If the seed script fails:**
- Check for `undefined` field values — run through `stripUndefined()` before writes
- Check JWT custom claims — use `setUserRole` Cloud Function, not direct Firestore profile writes
- Check that the script uses batch writes with max 500 per batch

**Verification:**
- [ ] 12 accounts visible in Firebase Auth console with correct emails
- [ ] Each account's JWT custom claims include `role` and `orgId` (check via Firebase Admin SDK or by logging in and inspecting the token)
- [ ] At least one published course with 3+ modules exists in Firestore
- [ ] Audit log entries exist for all seeded operations

---

### Step 7: Production Deploy to Firebase Hosting

**Guide Reference:** Guide 4
**Estimated Time:** 2–4 hours

#### What to do:

1. **Build:** `npm run build`
   - Vite outputs to `dist/`
   - Verify: `ls dist/` shows `index.html`, `assets/`, etc.
   - PostCSS/Tailwind should bundle correctly (CDN dependency already removed)

2. **Test locally:** `npx serve dist`
   - Open in browser, confirm the app loads
   - Test login flow, dashboard rendering, at least one page per role

3. **Verify `firebase.json`:**
   ```json
   {
     "hosting": {
       "public": "dist",
       "rewrites": [{ "source": "**", "destination": "/index.html" }]
     }
   }
   ```
   - Must point to `dist`, NOT `public` (the default placeholder)

4. **Check environment variables:**
   - `.env` file exists with `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, etc.
   - `VITE_APP_URL` is set to the production URL (not `localhost`) — this affects invite links
   - `.env` is in `.gitignore`

5. **Deploy:** `firebase deploy --only hosting`

6. **Verify production:**
   - Visit the Firebase Hosting URL (e.g., `https://parrish-harmonyhca.web.app`)
   - Login works
   - Dashboard loads with correct role-based content
   - At least one full user journey works (enroll → play → submit)
   - No console errors related to Firebase config or CORS

**Verification:**
- [ ] `npm run build` completes with zero errors
- [ ] Local serve of `dist/` loads the app correctly
- [ ] `firebase deploy --only hosting` succeeds
- [ ] Production URL shows the real app, not the Firebase placeholder
- [ ] Authentication works from the production URL
- [ ] Firestore operations succeed from the deployed site
- [ ] Invite links generated from production point to the production URL (not localhost)

---

## Phase 3: Clinical Compliance (30% → Next Milestone)

**Estimated time: 2–3 weeks (after ADR is locked)**
**Gated by:** Multi-tenant architecture decision

**Do not start Phase 3 code until Step 8 (the ADR) is complete.** The multi-tenant decision determines data isolation for certifications, org-scoped license rules, and the external onboarding architecture. Building features before this decision risks rework.

---

### Step 8: Multi-Tenant Architecture Decision Record

**This is a decision, not code.** Write an ADR that resolves:

1. **Org isolation model:** Subcollection pattern (`organizations/{orgId}/courses/...`) vs. orgId field on every document. The subcollection model provides stronger isolation via security rules but requires query restructuring. The field model is simpler but relies on `where('orgId', '==', ...)` on every query.

2. **Auth claims structure:** Current claims are `{ role, orgId }`. Multi-org support needs: can a user belong to multiple orgs? If so, how are claims structured? Array of orgIds? Nested object?

3. **Billing boundaries:** How are organizations billed? Per-user? Per-course? Flat fee? This affects whether usage tracking needs to be org-scoped.

4. **Migration path:** How do existing Parrish documents migrate to the multi-tenant model? What's the blast radius?

**Output:** A markdown document (`ADR_001_Multi_Tenant_Architecture.md`) with Decision, Context, Options Considered, Decision Rationale, and Migration Plan sections.

---

### Step 9: Remaining Clinical Tools + CE Credit Vault

**Depends On:** Step 8 (ADR locked)

#### 9A: Complete Guide 7 — Remaining ~2 Clinical Compliance Tools

Already shipped: LicenseGate, CorrectionLog, ObjSubjPlayer
Remaining tools TBD based on clinical team priorities.

#### 9B: CE Credit Vault

**Three design questions to resolve before implementation:**
1. Are `{{ORG_NAME}}` and `{{ISSUER_NAME}}` template variables per-course or global config?
2. What format for certification IDs? (UUID, sequential, org-prefixed?)
3. Is email notification on cert issuance in scope for v1?

**Architecture:** Instructor pastes a Google Docs template link → system copies the doc via Google Docs API → autofills placeholders with student/course data → exports as PDF → stores in Firebase Storage → surfaces in student MyGrades and admin Grade Management views.

**Builds on:** Existing `generateDocument` Cloud Function pattern. Production URL and service account sharing required (every template must be shared with the service account email at Editor level).

---

## Operational Hardening (Parallel Track)

These items can be worked on in parallel with the main sequence above, or batched after Step 7.

### CI/CD Pipeline (GitHub Actions)

- Trigger: push to `main` branch
- Steps: checkout → `npm install` → `npm run build` → `firebase deploy`
- Store `FIREBASE_TOKEN` as GitHub secret (generate with `firebase login:ci`)
- Add lint and smoke test steps before deploy

### Observability

- Error monitoring (consider Firebase Crashlytics or Sentry)
- Usage telemetry (basic analytics on login frequency, course completion rates)
- Performance baselines (page load times, Firestore query latency)

### Firestore Backup Strategy

- Scheduled exports via `gcloud firestore export`
- Storage bucket for backups with lifecycle policy
- Document retention policy for compliance records

---

## File Scope Summary

**Files that WILL be modified in this plan:**
- `firestore.rules` (Step 1A)
- `firestore.indexes.json` (Step 1B)
- `src/pages/GradeManagement.tsx` (Steps 2B, 3C)
- `src/pages/CoursePlayer.tsx` (Steps 2A, 4, 5A, 5B, 5C, 5D)
- `src/hooks/useModuleProgress.ts` (Steps 2A, 4)
- `src/pages/Dashboard.tsx` (Steps 3A, 5E)
- `src/pages/MyGrades.tsx` (Step 3B)
- `firebase.json` (Step 7)
- `.env` (Step 7)

**Files that must NOT be touched:**
- `functions/src/index.ts` — Cloud Functions are stable, do not modify
- Firestore security rules beyond the specific change in Step 1A
- Any service file not explicitly listed above
- Audit trail logging logic — it's working, don't risk breaking it

---

## Quick Reference: Dependency Chain

```
Step 1 (Firestore blockers)
  └→ Step 2 (E2E verify grading pipeline)
       └→ Step 3 (Wire Grade UI to live data)
            └→ Phase 2 COMPLETE
                 └→ Step 4 (Draft auto-save — nurse's fix)
                      └→ Step 5 (Remaining student UX fixes)
                           └→ Student UX HARDENED
                                └→ Step 6 (Seed data confirmation)
                                └→ Step 7 (Production deploy)
                                     └→ STABILIZED DEPLOYMENT
                                          └→ Step 8 (Multi-tenant ADR)
                                               └→ Step 9 (Phase 3 features)
```

---

*Harmony Health LMS · Parrish Health Systems · Resilient Engineering Manifesto*
*Plan generated April 7, 2026*
