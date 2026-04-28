# HHCALMS Phase 3 Execution Plan

**Clinical Compliance Features + Instructor UX Hardening**
Harmony Health LMS · Parrish Health Systems
April 9, 2026

---

## How to Use This Document

This is a sequenced execution plan designed for use with Claude Code against the HHCALMS Firebase codebase. It follows the same format that successfully drove Steps 1–7 of the Phase 2 plan. Each step is independently verifiable — complete the step, run the verification, confirm passing, then proceed.

This plan has two parallel tracks that interleave:

- **Track A** — Phase 3 clinical compliance features (new capabilities)
- **Track B** — Instructor/Teaching UX hardening (same pattern as Guide 11 for students)

Track B is sequenced first because it establishes the toast system and interaction patterns that Track A features will use. The CE Credit Vault is sequenced last because it requires the multi-tenant ADR.

**Estimated total: ~3 weeks**

---

## Current Baseline (Post Phase 2 Completion)

- **Phase 1: 100%** · **Phase 2: 100%** · Phase 3: 30% · Phase 4: 0%
- Steps 1–7 of the Phase 2 plan verified complete with line-number evidence
- 31/31 smoke tests passing, 0 TypeScript errors, clean Vite build
- 15/15 service exports confirmed
- System deployed to Firebase Hosting, seed data populated
- Student UX hardened (Guide 11 complete: auto-save, resume, navigation, submit feedback)
- 3 of ~5 clinical compliance tools shipped (LicenseGate, CorrectionLog, ObjSubjPlayer)

---

## Track B, Part 1: Toast System Foundation

**Why this is first:** Every instructor UX fix and every new Track A feature needs the toast system for user feedback. This is the same principle from the UI Feedback Audit: "Fix 1 is always the toast system because Fixes 3, 4, and 8 depend on it."

**Estimated time: 1 day**

---

### Step 1: Toast System + ToastProvider

**Estimated Time:** 3–4 hours

**What to build:**

1. **Create `src/components/ui/Toast.tsx`**
   - A toast notification component with four variants: `success`, `error`, `warning`, `info`
   - Auto-dismiss after 4 seconds with a subtle exit animation
   - Stacks vertically if multiple toasts fire in quick succession
   - Fixed position at top-right of viewport
   - z-index above all modals (z-[9999] to clear modal z-50)

2. **Create `src/contexts/ToastContext.tsx`**
   - React context providing a `toast()` function globally
   - Signature: `toast({ type: 'success' | 'error' | 'warning' | 'info', message: string })`
   - Manages toast queue state internally

3. **Create `src/hooks/useToast.ts`**
   - Convenience hook: `const { toast } = useToast()`
   - Shorthand methods: `toast.success('Message')`, `toast.error('Message')`

4. **Wrap App with ToastProvider**
   - In `src/App.tsx`, add `<ToastProvider>` wrapping the app content
   - Toast container renders at the provider level, above all routes

**Out of Scope:**
- Sound integration (can be layered in later)
- Do NOT modify any page components in this step — just the foundation

**Verification:**
- [ ] Import `useToast` in any page, call `toast.success('Test')` — toast renders at top-right
- [ ] Toast auto-dismisses after 4 seconds
- [ ] Multiple rapid toasts stack without overlapping
- [ ] Toast renders above open modals (test with any existing modal)
- [ ] No TypeScript errors, build passes clean

---

## Track B, Part 2: Instructor Surface Hardening

**Why this comes next:** With the toast system in place, every instructor-facing page gets wired to provide proper acknowledgment, processing, and outcome feedback on every action. This follows the three-layer feedback model from the UI Feedback Audit.

**Estimated time: 2–3 days**

---

### Step 2: Course Manager Feedback

**Guide Reference:** UI Feedback Audit §2.4
**Estimated Time:** 3–4 hours
**Depends On:** Step 1 (toast system)

**Pages:** `src/pages/CourseManager.tsx`

#### 2A: Create Course Success Toast

After a course is successfully created:
- Show toast: `toast.success('Course created successfully')`
- Navigate to CourseEditor for the new course
- If creation fails, show `toast.error('Failed to create course. Please try again.')`

#### 2B: Publish/Unpublish Toggle Toast

After the publish status toggle completes:
- Published: `toast.success('Course published — now visible in catalog')`
- Unpublished: `toast.info('Course unpublished — hidden from catalog')`
- If toggle fails, show `toast.error('Failed to update course status')`

#### 2C: Delete Course Toast

After successful deletion (confirmation modal already exists):
- Show toast: `toast.success('Course deleted')`
- If deletion fails, show `toast.error('Failed to delete course')`

**Verification:**
- [ ] Create a course → toast appears + navigates to editor
- [ ] Publish a course → status-specific toast appears
- [ ] Delete a course → toast confirms deletion
- [ ] Each failure case shows an error toast (test by disconnecting network temporarily)

---

### Step 3: Course Editor Hardening

**Guide Reference:** UI Feedback Audit §2.5
**Estimated Time:** 4–6 hours
**Depends On:** Step 1 (toast system)

**Pages:** `src/pages/CourseEditor.tsx`

#### 3A: Save Changes Toast

After save completes successfully:
- Show toast: `toast.success('Changes saved')`
- If save fails: `toast.error('Failed to save changes')`

#### 3B: Dirty-State Guard on Back Navigation

**This is CRITICAL — unsaved changes are currently lost silently.**

Add a `beforeunload` event listener and a navigation guard:
- Track dirty state with a `isDirty` flag (set true when any field changes, false on save)
- On back button click or route navigation: if `isDirty`, show `window.confirm('You have unsaved changes. Leave without saving?')`
- On browser tab close: `beforeunload` event fires the native browser dialog
- Use the same pattern that was implemented in `CoursePlayer.tsx` for Guide 11 (Step 5A)

**Files:** `src/pages/CourseEditor.tsx`

#### 3C: Add Module Feedback

After a new module is created inline:
- Show toast: `toast.success('Module added')`
- Smooth scroll to the new module in the list
- Brief highlight animation on the new module row (a subtle background flash)

#### 3D: Delete Module Feedback

After module deletion (confirmation modal already exists):
- Show toast: `toast.success('Module deleted')`
- Collapse animation on the removed row (optional polish)

**Verification:**
- [ ] Save changes → toast confirms
- [ ] Edit a field, click back without saving → confirm dialog appears
- [ ] Edit a field, close browser tab → native browser warning appears
- [ ] Save changes, click back → no warning (dirty state cleared)
- [ ] Add module → toast + scroll to new module
- [ ] Delete module → toast confirms

---

### Step 4: Module Builder Consistency

**Guide Reference:** UI Feedback Audit §2.6
**Estimated Time:** 2–3 hours
**Depends On:** Step 1 (toast system)

**Pages:** `src/pages/ModuleBuilder.tsx`

#### 4A: Replace showSaveSuccess with Toast

The Module Builder currently has an inline `showSaveSuccess` state with a 3-second timeout. This works but is inconsistent with the toast system.

- Remove the `showSaveSuccess` state and its inline rendering
- Replace with `toast.success('Module saved')` on successful save
- Keep the existing `isDirty` guard behavior (this already works — use it as the reference pattern for Step 3B)

**Verification:**
- [ ] Save a module → toast appears (not inline success message)
- [ ] Dirty-state guard still works on navigation
- [ ] Build passes clean, no leftover references to `showSaveSuccess`

---

### Step 5: Grade Management Feedback

**Guide Reference:** UI Feedback Audit §2.7 + Guide 2 surfaces
**Estimated Time:** 3–4 hours
**Depends On:** Step 1 (toast system)

**Pages:** `src/pages/GradeManagement.tsx`

#### 5A: Approve/Reject Toasts

After instructor approves a submission:
- Show toast: `toast.success('Grade submitted — audit log created')`

After instructor rejects a submission:
- Show toast: `toast.info('Submission returned to learner with feedback')`

After either action fails:
- Show toast: `toast.error('Grade action failed. Please try again.')`

#### 5B: Review Modal Close Affordances

Add standard modal close behaviors:
- Click backdrop (outside the modal) → close modal
- Press Escape key → close modal
- Both should work alongside the existing X button

#### 5C: Remediation Queue Toasts

In `src/pages/RemediationQueue.tsx`:
- Unlock approved: `toast.success('Learner unlocked — they can retry the module')`
- Unlock denied: `toast.info('Unlock request denied')`

**Verification:**
- [ ] Approve a submission → toast confirms + modal closes
- [ ] Reject a submission → toast with "returned to learner" message
- [ ] Click backdrop of review modal → modal closes
- [ ] Press Escape in review modal → modal closes
- [ ] Approve/deny remediation → appropriate toast

---

### Step 6: Dead Button Fixes + Interaction States

**Guide Reference:** UI Feedback Audit §Phase F + §Phase D
**Estimated Time:** 3–4 hours
**Depends On:** Steps 2–5 complete

#### 6A: BlockEditor "Settings" Button

In `src/components/builder/BlockEditor.tsx`:
- The "Settings" button renders but does nothing on click
- **Decision:** Either implement a settings panel (block-level config like required/optional, point value) or remove the button entirely
- Recommendation: Remove it for now. Add it back when block-level settings are scoped. A dead button is worse than no button.
- If removed, add a comment: `// TODO: Block settings panel — scoped for future guide`

#### 6B: UserManagement "+ Add Staff Member" Button

In `src/pages/UserManagement.tsx`:
- The "+ Add Staff Member" button is not wired to anything
- Wire it to navigate to the Invitations page, or open an invitation modal inline
- The Invitations page already exists — the simplest fix is `navigate('/invitations')` on click
- Show toast: `toast.info('Redirecting to invitations...')` or just navigate directly

#### 6C: Interactive Row States

Add hover, active, and focus states to all interactive table rows and cards:

**Pages to update:**
- `GradeManagement.tsx` — table rows
- `UserManagement.tsx` — table rows
- `RemediationQueue.tsx` — table rows
- `Dashboard.tsx` — enrollment cards (if not already done in Guide 11)
- `CourseCatalog.tsx` — course cards

**CSS pattern for rows:**
```
hover:bg-gray-50 transition-colors duration-150 cursor-pointer
active:bg-gray-100
focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none
```

**CSS pattern for cards:**
```
hover:shadow-md hover:-translate-y-0.5 transition-all duration-200
active:translate-y-0 active:shadow-sm
```

**Verification:**
- [ ] BlockEditor "Settings" button is removed (or implemented) — zero dead buttons
- [ ] UserManagement "+ Add Staff Member" navigates to invitations
- [ ] Hover every table row on Grade Management, User Management, Remediation Queue → visual feedback
- [ ] Hover every card on Dashboard, Catalog → elevation effect
- [ ] Keyboard tab through rows → focus rings visible

---

## Track B Complete — Instructor UX Hardened

At this point, every instructor-facing surface provides proper feedback on every action. The three-layer feedback model (Acknowledgment → Processing → Outcome) is satisfied across all teaching pages.

---

## Track A: Phase 3 Clinical Compliance Features

**Why these come after Track B:** The new features will use the toast system and interaction patterns established in Track B. Building features on top of a hardened UI means they ship polished from day one rather than needing a second hardening pass.

**Estimated time: ~2 weeks**

---

### Step 7: Multiple Answer Questions (6th Quiz Type)

**Estimated Time:** 2–3 days
**Depends On:** Track B complete (toast system for feedback)

**Root Cause:** Clinical compliance scenarios often require "select ALL that apply" with strict all-or-nothing grading. Partial credit is dangerous in clinical contexts — a nurse who identifies 3 of 4 correct infection control steps has a gap that could harm a patient.

#### 7A: Add Question Type to Quiz Engine

**Type definition** — add to the quiz question types in `functions/src/types.ts`:
```typescript
interface MultipleAnswerQuestion {
  type: 'multiple_answer';
  prompt: string;
  options: string[];
  correctAnswers: number[]; // indices of ALL correct options
}
```

**Grading function** — add to the grading utility:
- Compare student's selected indices against `correctAnswers`
- All-or-nothing: if the sets match exactly → full points, otherwise → 0
- Order doesn't matter — compare as sorted arrays or sets
- This is auto-graded (does NOT trigger `needs_review`)

**Files:** `functions/src/types.ts`, grading utility file, `CoursePlayer.tsx` (render + answer capture)

#### 7B: Add to Content Builder

In the Module Builder's quiz block editor:
- Add "Multiple Answer" as a 6th question type option
- Builder UI: text prompt + multiple options with checkboxes (not radio buttons) for marking correct answers
- Require at least 2 correct answers to be marked (otherwise it's just a multiple-choice question)
- Validation: at least 3 options, at least 2 marked correct

**Files:** Quiz block editor component in `src/components/builder/`

#### 7C: Add to Course Player

In `CoursePlayer.tsx`:
- Render multiple-answer questions with checkboxes (not radio buttons)
- Visual distinction from multiple-choice: add helper text "Select all that apply"
- Selected state: `ring-2 ring-primary-500 bg-primary-50` on checked options
- Submit captures array of selected indices

#### 7D: Add to Grade Review Modal

In `GradeManagement.tsx` review modal:
- Render multiple-answer responses showing which options the student selected
- Mark correct/incorrect per option (green check / red X)
- Show "All correct" or "X of Y correct — no partial credit" summary

**Verification:**
- [ ] Create a module with a multiple-answer question in Module Builder (3+ options, 2+ correct)
- [ ] Student submits quiz with multiple-answer question → auto-graded correctly
- [ ] All correct selections → full points
- [ ] Missing one correct or selecting one incorrect → 0 points (all-or-nothing)
- [ ] Review modal displays the question with per-option correct/incorrect indicators
- [ ] Existing 5 quiz types still work (regression check)
- [ ] Build passes clean

---

### Step 8: Availability Windows

**Estimated Time:** 2–3 days
**Depends On:** Step 7 complete

**Root Cause:** Instructors need to schedule training windows — "This course opens March 1 and closes March 31" or "Module 3 unlocks after Module 2 is completed AND after March 15."

#### 8A: Add Fields to Course and Module Types

**This is additive — zero migration required.** Add optional fields:

To the Course type:
```typescript
availableFrom?: Timestamp | null;  // course visible in catalog after this date
availableUntil?: Timestamp | null; // course hidden from catalog after this date
```

To the Module type:
```typescript
availableFrom?: Timestamp | null;  // module accessible after this date
availableUntil?: Timestamp | null; // module locked after this date
```

**Files:** `functions/src/types.ts` or `domain-types.ts`

#### 8B: Add Date Pickers to Course Editor and Module Builder

In `CourseEditor.tsx`:
- Add optional "Available from" and "Available until" date pickers below the existing course metadata fields
- Default: both null (always available — backwards compatible)
- Validation: if both set, `availableFrom` must be before `availableUntil`

In `ModuleBuilder.tsx`:
- Same pattern — optional date pickers in the module settings area

**Files:** `src/pages/CourseEditor.tsx`, `src/pages/ModuleBuilder.tsx`

#### 8C: Enforce in Course Catalog and Course Player

In `CourseCatalog.tsx`:
- If a course has `availableFrom` in the future: show the course card with a "Opens [date]" badge, disable enrollment
- If a course has `availableUntil` in the past: hide from catalog or show "Closed" badge

In `CoursePlayer.tsx`:
- If the current module has `availableFrom` in the future: show a locked state with "Available on [date]"
- If the current module has `availableUntil` in the past: show "This module is no longer available"

**Files:** `src/pages/CourseCatalog.tsx`, `src/pages/CoursePlayer.tsx`, `src/pages/CourseDetail.tsx`

#### 8D: No Security Rule Changes Needed

Availability windows are UI-level enforcement. The Firestore data is still readable — the UI just gates interaction. This is acceptable for internal use. If CMS audit requirements demand server-side enforcement, that can be added as a Cloud Function check in a future guide.

**Verification:**
- [ ] Create a course with `availableFrom` set to tomorrow → catalog shows "Opens [date]", enrollment blocked
- [ ] Create a course with `availableUntil` set to yesterday → catalog shows "Closed"
- [ ] Create a course with no dates → behaves exactly as before (backwards compatible)
- [ ] Set a module's `availableFrom` to tomorrow → CoursePlayer shows locked state for that module
- [ ] Existing courses without availability fields work unchanged (no migration needed)

---

### Step 9: Cohort Management & Bulk Enrollment

**Guide Reference:** Guide 6
**Estimated Time:** 3–4 days
**Depends On:** Step 8 complete

#### 9A: Cohort Type and Service

**Create type** in `functions/src/types.ts`:
```typescript
interface Cohort {
  id: string;
  name: string;
  description: string;
  filterCriteria: {
    jobTitles?: string[];
    departments?: string[];
  };
  courseIds: string[];
  createdBy: string;
  createdAt: string;
}
```

**Create `src/services/cohortService.ts`:**
- Standard Firestore CRUD: `createCohort`, `updateCohort`, `getCohorts`, `getCohort`, `deleteCohort`
- All operations create audit log entries
- `getMatchingUsers(filterCriteria)` — queries `users` collection with filters, returns matched user list

#### 9B: Bulk Enrollment Function

**Location:** Client-side batch operation (not a Cloud Function — keeps it simpler)

Given a cohort ID:
1. Query all users matching the filter criteria
2. For each user-course pair, check if enrollment already exists (idempotent)
3. Create enrollment documents for non-existing pairs
4. Use Firestore batch writes (max 500 per batch)
5. Create a single audit log entry summarizing the bulk operation
6. Use `stripUndefined()` before all Firestore writes

#### 9C: CohortManagement Page

**Create `src/pages/CohortManagement.tsx`:**

1. List all cohorts with member count and assigned courses
2. Create/edit cohort modal with:
   - Name, description
   - Job title multi-select filter (populated from existing user data)
   - Department multi-select filter
   - Course multi-select (which courses to enroll matched users in)
3. **Preview pane:** Before executing, show which users would be matched — "This cohort matches 12 users"
4. "Enroll Cohort" button triggers bulk enrollment with progress indicator
5. Use toast for feedback: `toast.success('12 users enrolled in 2 courses')`

**Add route:** In `App.tsx`, add `/cohorts` route (admin only)
**Add sidebar link:** Admin sidebar → "Cohort Management"

**Verification:**
- [ ] Create a cohort targeting a specific job title → preview shows correct users
- [ ] Execute bulk enrollment → enrollment documents created for all matched user-course pairs
- [ ] Re-run enrollment → no duplicates created (idempotent)
- [ ] Audit log captures the bulk operation with user count and course list
- [ ] Edit cohort filters → preview updates dynamically
- [ ] Delete a cohort → cohort removed (enrollments are NOT deleted — they persist independently)
- [ ] Non-admin users cannot access the cohort management page

---

### Step 10: Multi-Tenant Architecture Decision Record

**This is a decision session, not code. Do this step collaboratively — not in Claude Code.**

Before building the CE Credit Vault, resolve these questions:

1. **Org isolation model:** Subcollection pattern (`organizations/{orgId}/courses/...`) vs. `orgId` field on every document?
   - Subcollections: stronger security rule isolation, but requires restructuring all queries
   - Field approach: simpler migration, but relies on `where('orgId', '==', ...)` on every query

2. **Auth claims for multi-org:** Can a user belong to multiple organizations?
   - Single org: `{ role: 'instructor', orgId: 'parrish' }` (current model)
   - Multi-org: `{ roles: { parrish: 'instructor', other_org: 'admin' } }`

3. **Certification scope:** Are `{{ORG_NAME}}` and `{{ISSUER_NAME}}` template variables per-course or global org config?

4. **Certification ID format:** UUID, sequential, or org-prefixed (e.g., `PARRISH-CERT-001`)?

5. **Email notification on cert issuance:** In scope for v1?

**Output:** `docs/ADR_001_Multi_Tenant_Architecture.md` with Decision, Context, Options Considered, Decision Rationale, and Migration Plan sections.

**This step gates Step 11. Do not proceed to CE Credit Vault until the ADR is written and locked.**

---

### Step 11: CE Credit Vault (Clinical Certifications)

**Estimated Time:** 1–2 weeks
**Depends On:** Step 10 (multi-tenant ADR locked)

#### 11A: Certificate Template Configuration

Add to the course metadata (in CourseEditor):
- "Certificate Template" field — instructor pastes a Google Docs URL
- Validate URL format: `https://docs.google.com/document/d/{docId}/...`
- Extract the `docId` from the URL and store it on the course document
- Show a preview link so the instructor can verify the template

**Reminder:** Every Google Doc template must be shared with the service account email at Editor level, or the copy step returns 403. Display this requirement clearly in the UI.

#### 11B: Certificate Generation Pipeline

Builds on the existing `generateDocument` Cloud Function pattern:

1. Trigger: when a course grade is finalized (all modules complete + all reviews done)
2. Copy the template doc via Google Docs API
3. Replace all placeholder variables:
   - `{{STUDENT_NAME}}` — from user profile
   - `{{COURSE_TITLE}}` — from course document
   - `{{COMPLETION_DATE}}` — timestamp of final grade
   - `{{GRADE}}` — from course_grades document
   - `{{CERT_ID}}` — generated per ADR decision (Step 10, question 4)
   - `{{ORG_NAME}}`, `{{ISSUER_NAME}}` — per ADR decision (Step 10, question 3)
   - `{{CE_CREDITS}}` — from course's CE credit value field
4. Export as PDF
5. Upload PDF to Firebase Storage: `certificates/{orgId}/{userId}/{courseId}/{certId}.pdf`
6. Create a Firestore document in `certificates` collection with metadata:
   ```typescript
   {
     userId: string;
     courseId: string;
     certId: string;
     issuedAt: Timestamp;
     pdfPath: string;  // Firebase Storage path
     downloadUrl: string;  // signed URL
     grade: number;
     ceCredits: number;
   }
   ```
7. Create audit log entry for certificate issuance

#### 11C: Student View — MyGrades Certificate Access

In `MyGrades.tsx`:
- For completed courses with a certificate: show "Download Certificate" button
- Button generates a signed download URL from Firebase Storage
- Toast: `toast.success('Certificate downloaded')`

#### 11D: Admin View — Grade Management Certificate Column

In `GradeManagement.tsx` CourseRoster:
- Add a "Certificate" column showing issued/not-issued status
- Click to download or preview the PDF
- Filter: "Has certificate" / "Missing certificate"

#### 11E: Email Notification (if in scope per ADR)

If the ADR decision includes email notification:
- On certificate creation, write to the `mail` collection (Firebase Trigger Email extension)
- Template: "Congratulations {name}, your certificate for {course} is ready. Download it here: {link}"
- Send to the student's email address
- The extension must be installed targeting `us-east1` to match the Firestore database region

**Verification:**
- [ ] Instructor adds a Google Doc template URL to a course
- [ ] Student completes all modules + receives final grade
- [ ] Certificate PDF is generated with all placeholders correctly filled
- [ ] PDF is stored in Firebase Storage at the correct path
- [ ] `certificates` collection document created with correct metadata
- [ ] Student can download certificate from MyGrades page
- [ ] Admin can see certificate status in Grade Management roster
- [ ] Audit log captures certificate issuance
- [ ] Template not shared with service account → clear error message (not silent 403)

---

## File Scope Summary

### Files Created (New)
- `src/components/ui/Toast.tsx`
- `src/contexts/ToastContext.tsx`
- `src/hooks/useToast.ts`
- `src/pages/CohortManagement.tsx`
- `src/services/cohortService.ts`
- `docs/ADR_001_Multi_Tenant_Architecture.md`

### Files Modified
- `src/App.tsx` — ToastProvider wrapper + cohort route + sidebar link
- `src/pages/CourseManager.tsx` — toast calls on create/publish/delete
- `src/pages/CourseEditor.tsx` — toast + dirty-state guard + availability date pickers + certificate template field
- `src/pages/ModuleBuilder.tsx` — replace showSaveSuccess with toast + availability date pickers
- `src/components/builder/BlockEditor.tsx` — remove dead Settings button
- `src/pages/GradeManagement.tsx` — toast on approve/reject + modal close affordances + certificate column
- `src/pages/UserManagement.tsx` — wire Add Staff Member button + row hover states
- `src/pages/RemediationQueue.tsx` — toast on approve/deny + row hover states
- `src/pages/CourseCatalog.tsx` — availability window enforcement + card hover states
- `src/pages/CourseDetail.tsx` — availability window badges
- `src/pages/CoursePlayer.tsx` — multiple-answer question renderer + module availability gate
- `src/pages/MyGrades.tsx` — certificate download button
- `src/pages/Dashboard.tsx` — card hover states (if not done in Guide 11)
- `functions/src/types.ts` — MultipleAnswerQuestion type + Cohort type + availability fields + certificate type
- Grading utility — multiple-answer grading function
- Quiz block editor component — multiple-answer builder UI

### Files That Must NOT Be Touched
- Cloud Functions (`functions/src/index.ts`) — stable, do not modify unless CE Vault requires a new function
- Firestore security rules — no changes needed for any Track A or Track B work
- `src/hooks/useModuleProgress.ts` — Guide 11 auto-save working, don't risk regression
- Audit trail logging logic

---

## Quick Reference: Dependency Chain

```
Step 1 (Toast system foundation)
  └→ Step 2 (Course Manager feedback)
  └→ Step 3 (Course Editor hardening)
  └→ Step 4 (Module Builder consistency)
  └→ Step 5 (Grade Management feedback)
       └→ Step 6 (Dead buttons + interaction states)
            └→ TRACK B COMPLETE — Instructor UX hardened
                 └→ Step 7 (Multiple answer questions)
                      └→ Step 8 (Availability windows)
                           └→ Step 9 (Cohort management)
                                └→ Step 10 (Multi-tenant ADR — decision, not code)
                                     └→ Step 11 (CE Credit Vault)
                                          └→ PHASE 3 COMPLETE
```

**Steps 2–5 can run in parallel** (they're independent pages that all depend only on Step 1). If you want to move faster, batch them in a single Claude Code session.

---

*Harmony Health LMS · Parrish Health Systems · Resilient Engineering Manifesto*
*Plan generated April 9, 2026*
