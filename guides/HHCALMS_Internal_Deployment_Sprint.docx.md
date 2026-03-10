  
**HARMONY HEALTH LMS**

**Internal Deployment Sprint**

Execution Plan for Claude Code

March 10, 2026  •  Prepared for Kobe & Miara

| TARGET: Miara begins using the app Staff invitations go out next week 6 Phases  •  Estimated 3–4 Focused Days |
| :---: |

# **What This Plan Covers**

This execution plan takes Harmony Health LMS from its current state to a working internal deployment where Miara can log in, build courses, and invite staff. It addresses every gap identified in the March 10 audit, prioritized by what blocks real usage.

The six phases, in dependency order:

| \# | Phase | What It Fixes | Estimate | Priority |
| :---- | :---- | :---- | :---- | :---- |
| **1** | **Firestore Blockers** | Security rules \+ indexes | 2–4 hours | **GATE** |
| **2** | **Invitation & Onboarding Pipeline** | No emails, no account setup page | 1–2 days | **CRITICAL** |
| **3** | **Course Builder Fixes** | Image upload, video embed, naming | 0.5–1 day | **CRITICAL** |
| **4** | **Miara’s Admin Account** | Real admin with proper JWT claims | 30 min | **REQUIRED** |
| **5** | **Test Data Cleanup** | Remove mock/seed data | 1–2 hours | **REQUIRED** |
| **6** | **End-to-End Verification** | Prove every flow works | 2–4 hours | **REQUIRED** |

# **Phase 1: Firestore Configuration Blockers**

**Estimate:** 2–4 hours  |  Priority: GATE (nothing else works until these are fixed)

## **Root Cause**

Two diagnosed Firestore configuration issues prevent instructors from reading enrollments and grades from being queried efficiently. These are configuration gaps, not architectural defects.

**Fix 1: Cross-User Enrollment Read Permissions**

Firestore security rules currently block instructors from querying enrollments across users. The rules need a clause allowing admin and instructor roles to read all enrollment documents. Without this, the Grade Management review queue, course rosters, and enrollment visibility all fail silently.

**Fix 2: Missing Composite Indexes**

Grade queries that filter on multiple fields (userId \+ courseId, or status \+ courseId) require composite indexes in Firestore. These must be added to firestore.indexes.json and deployed. Without them, any query combining two or more where() clauses throws a Firestore index error.

**Verification**

1. Log in as an instructor account. Open Grade Management.

2. Confirm the pending review queue loads without console errors.

3. Log in as admin. Open User Management and verify enrollment counts display.

4. Run a grade query with two filters in the Firestore console — confirm no index error.

# **Phase 2: Invitation & Onboarding Pipeline**

**Estimate:** 1–2 days  |  Priority: CRITICAL

## **Root Cause**

The Invitations page is a UI shell with mock data and a simulated delay. No email is sent, no Firestore document is created, no Cloud Function is triggered. There is also no page where an invited person can accept the invitation and set their password. This is the single biggest gap blocking staff onboarding.

| BLOCKER: The entire invitation flow — from dispatch to account creation — must be built. This is new engineering, not a configuration fix. |
| :---- |

## **Deliverable A: Firestore Invitation Records**

Replace the mock local state in Invitations.tsx with real Firestore persistence. When an admin clicks “Dispatch Invitation,” the system should create a document in an invitations collection with the email, assigned role, department, a unique token, an expiration timestamp (72 hours), and a status field (pending / accepted / expired).

## **Deliverable B: Email Dispatch via Firebase Extension**

Install the “Trigger Email from Firestore” Firebase Extension (or integrate SendGrid/Mailgun as a Cloud Function). When an invitation document is created, a triggered function should send a branded email to the invited address containing a link with the unique token. The link should point to the Accept Invitation page.

## **Deliverable C: Accept Invitation Page**

Create a new route (/accept-invite?token=xxx) that handles the full account setup flow:

1. Validate the token against the invitations collection (exists, not expired, status is pending).

2. Display a form: full name, password, confirm password. Email is pre-filled and read-only from the invitation record.

3. On submit: create the Firebase Auth account via Admin SDK (Cloud Function callable), set JWT custom claims with the role from the invitation, create the Firestore user profile, and update the invitation status to accepted.

4. Redirect to the login page with a success message.

| NOTE: The accept flow MUST set JWT custom claims via a Cloud Function (server-side). Client-side createUserWithEmailAndPassword cannot set custom claims — this is the gap that currently exists in registerWithEmail(). |
| :---- |

## **Deliverable D: Wire Invitations Page to Real Data**

Replace all mock state in Invitations.tsx with Firestore queries. The invitation list should be a live query on the invitations collection. Resend should update sentAt and dispatch a new email. Cancel should update status to cancelled. The “Invitation Sent\!” feedback should only fire after the Firestore write succeeds.

## **Deliverable E: Cloud Function for Account Creation**

Create a callable Cloud Function (createInvitedUser) that:

* Validates the invitation token server-side

* Creates the Firebase Auth account with the provided password

* Sets JWT custom claims (role from invitation)

* Creates the Firestore user profile with matching role, department, and display name

* Updates the invitation document status to ‘accepted’

* Creates an audit log entry for the account creation

**Verification**

1. Admin sends invitation from Invitations page. Firestore document appears in invitations collection.

2. Email arrives at the target address with a working link.

3. Clicking the link opens the Accept Invitation page with email pre-filled.

4. Completing the form creates a working account. User can log in immediately.

5. JWT custom claims match the assigned role. User sees correct pages for their role.

6. Invitation status in Firestore updates to ‘accepted.’ Resending an accepted invitation is blocked.

# **Phase 3: Course Builder Fixes**

**Estimate:** 0.5–1 day  |  Priority: CRITICAL

## **Root Cause**

Three content block types in the Module Builder have UI that implies functionality that doesn’t actually work or that uses confusing naming. Miara needs a builder she can trust.

**Fix 1: Image Block — Actual File Upload**

The image block currently shows a dashed upload zone with “Click to upload or drag and drop” text, but there is no file input element and no upload handler. Clicking the zone does nothing. There is a URL paste field that works, but the primary upload path is broken.

What needs to happen:

* Add a hidden \<input type="file" accept="image/\*"\> triggered by clicking the upload zone

* On file selection, upload to Firebase Storage at the path courses/{courseId}/modules/{moduleId}/{blockId}\_{filename}

* Get the download URL and set it as the block’s url field

* Show an upload progress indicator during the upload

* The Storage rules already allow this for admin/instructor roles — no rules change needed

**Fix 2: Video Block — YouTube URL Normalization**

The video block has an “Embed URL” field with a placeholder that says “https://www.youtube.com/embed/...” but most users will paste a standard YouTube URL (like https://www.youtube.com/watch?v=xyz or https://youtu.be/xyz). The block should automatically detect and convert these formats to the embed format. Additionally, the iframe in both the builder preview and the Course Player should include proper YouTube embed parameters.

What needs to happen:

* Add a URL normalizer function that converts watch URLs and short URLs to embed format

* Apply the normalizer on blur of the URL input field

* Update the label from “Embed URL” to “YouTube or Video URL”

* Ensure the iframe in BlockRenderer.tsx also handles the normalized URL

**Fix 3: Obj/Subj Validator — Rename to Clinical Data Sorter**

The block type ‘obj\_subj\_validator’ is a developer-facing name that means nothing to a clinical educator. In the builder’s add-block menu, the existing buttons show user-friendly names for other tools (e.g., “Clinical Alert” for the callout variant, “Correction Log” for the correction\_log type). This block should follow the same pattern.

What needs to happen:

* Change the display label in the add-block menu from the raw type name to “Clinical Data Sorter”

* Update the block header label in BlockEditor.tsx to show “Clinical Data Sorter” instead of “obj\_subj\_validator”

* The internal type name in the codebase can remain obj\_subj\_validator — this is a display-only change

* Update the User Guide and any documentation references to use the new name

**Verification**

1. Add an image block, click the upload zone, select a file. Image uploads and displays in the preview.

2. Add a video block, paste a standard YouTube watch URL. It auto-converts and the preview plays.

3. The add-block menu shows “Clinical Data Sorter” and the block header matches.

4. Save the module, reload. All three block types persist correctly.

# **Phase 4: Miara’s Admin Account**

**Estimate:** 30 minutes  |  Priority: REQUIRED

## **Root Cause**

Miara needs a real admin account with properly synchronized Firebase Auth \+ JWT custom claims \+ Firestore profile. The seed script is the only path that does all three correctly.

**Steps**

1. Add Miara’s real email, name, and ‘admin’ role to the seed users array (or create a one-off script using the same pattern).

2. Run the seed script: npx tsx scripts/seed/seedUsers.ts

3. Verify: log in with Miara’s credentials. Confirm she sees all admin pages (Course Manager, Module Builder, User Management, Audit Logs, Invitations).

4. Have Miara change her password immediately after first login (add a “Change Password” option or use Firebase’s password reset email).

| NOTE: Do NOT create Miara’s account through the Invitations page until Phase 2 is complete. Use the seed script for safety. |
| :---- |

# **Phase 5: Test Data Cleanup**

**Estimate:** 1–2 hours  |  Priority: REQUIRED

## **Root Cause**

The app currently contains seed/test data that would confuse real users: 12 fake @parrish.health accounts, mock invitation records hardcoded in the Invitations page, and any test courses or enrollments created during development.

**What to Remove**

* All seed user accounts from Firebase Auth (except Miara’s and any real admin accounts)

* Corresponding Firestore user profile documents

* All test enrollments, grades, progress, and course\_grades documents

* All test courses and modules (unless Miara wants to keep specific content as templates)

* The hardcoded mock invitation array in Invitations.tsx (this gets replaced by Firestore queries in Phase 2, but verify it’s gone)

* Any test audit log entries (or clearly mark them as pre-deployment test data)

**What to Keep**

* Miara’s admin account and any real accounts

* The seed script itself (it’s reusable for future onboarding if needed)

* All Cloud Functions, security rules, and infrastructure

| NOTE: Create a cleanup script rather than manually deleting documents. This makes the process repeatable and auditable. The script should log every deletion to console. |
| :---- |

**Verification**

1. Firebase Auth console shows only real accounts (no @parrish.health test accounts unless they’re real staff).

2. Firestore collections (users, enrollments, grades, courses) contain only real data.

3. Invitations page shows an empty state, not mock data.

# **Phase 6: End-to-End Verification**

**Estimate:** 2–4 hours  |  Priority: REQUIRED

## **Root Cause**

Every previous phase addresses a specific gap. This phase proves the gaps are actually closed by walking through every user journey from start to finish.

**Scenario 1: Admin Onboarding Flow**

5. Miara logs in as admin. Sees all admin pages in sidebar.

6. Miara opens Invitations, enters a test staff email, assigns ‘staff’ role.

7. Email arrives. Link opens the Accept Invitation page.

8. Staff member sets password, account is created. They can log in.

9. Staff member sees Dashboard, Course Catalog, My Grades (staff pages only).

**Scenario 2: Course Creation Flow**

10. Miara opens Course Manager, creates a new course with title, description, category, CE credits.

11. Opens Module Builder. Adds heading, text, image (uploaded file), and video (YouTube URL) blocks.

12. Adds a quiz block with at least one question of each type.

13. Saves. Reloads the page. All content persists correctly.

14. Returns to Course Manager. Publishes the course.

**Scenario 3: Learner Journey**

15. Staff user logs in. Sees the published course in Course Catalog.

16. Enrolls. Course appears on Dashboard as active.

17. Opens Course Player. Completes all blocks. Submits quiz.

18. If quiz has short-answer: enrollment goes to needs\_review.

19. Instructor logs in, sees pending review, approves it. Grade is created.

20. Staff user sees completed status and grade on Dashboard and My Grades.

**Scenario 4: Audit Trail**

21. Admin opens Audit Logs page.

22. Verifies entries for: account creation, course publish, enrollment, quiz submission, grade entry.

23. Confirms no entries can be deleted or modified.

## **Rules of Engagement for Claude Code**

These constraints apply to all phases:

* One change at a time. Make a change, verify it works, then proceed.

* Do not modify security rules without explicit verification that existing functionality still works.

* Every new Firestore write operation must create an audit log entry.

* Types come from functions/src/types.ts. Do not create parallel type definitions.

* JWT custom claims are the authoritative role source. Never infer roles from Firestore profiles alone.

* Test with at least two roles (admin \+ staff) after any auth-related change.

* Do not introduce new npm dependencies without justification. Prefer Firebase-native solutions.

## **Definition of Done**

The sprint is complete when all of the following are true:

* Miara can log in as admin, create a course with images and video, publish it, and invite a staff member by email.

* An invited staff member receives an email, clicks the link, sets their password, logs in, and sees the published course.

* The staff member can enroll, complete a module with a quiz, and receive a grade.

* No test/mock data is visible anywhere in the app.

* The audit trail captures every action from the above flows.