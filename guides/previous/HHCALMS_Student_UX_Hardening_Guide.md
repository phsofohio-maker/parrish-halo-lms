# HHCALMS Student UX Hardening Guide

**Classification:** Must-Ship (Guide 11)
**Estimated Effort:** 3–5 focused days
**Phase:** Phase 2 (Gradebook Engine) + Cross-cutting
**Triggered By:** Real-user feedback — nurse reported progress not saving during training session (March 26, 2026)

---

## Root Cause Analysis

The CoursePlayer was architectured as a **single-session, submit-once experience**. All quiz answers live in React `useState` and are only written to Firestore when the student clicks the final "Submit Module" button. There is no intermediate persistence layer.

This design made sense during rapid prototyping — it kept the write path simple and avoided partial-state complexity. But in production, nurses are completing training between patient visits. They open a module, answer three questions, get called away, close the browser, and return later expecting to pick up where they left off. Instead, they find a blank module.

The problem is not a single missing feature — it's a **missing architectural layer** between "user interacts with UI" and "data reaches Firestore." This guide addresses that gap across three severity tiers, sequenced so each tier is independently deployable and verifiable.

---

## Tier 1: Critical — Data Loss Prevention

**Priority:** Fix immediately. These issues cause nurses to lose work.
**Estimated Effort:** 1–1.5 days
**Files Touched:** `CoursePlayer.tsx`, `progressService.ts`, `useModuleProgress.ts`

### Fix 1.1: Draft Answer Persistence (Auto-Save)

**Root Cause:** The `answers` state object in `CoursePlayer.tsx` is a React `useState<Record<string, any[]>>` with no Firestore backing. Every quiz answer, obj/subj selection, and correction log entry exists only in browser memory until the submit handler fires.

**The Contract:**

```typescript
// New field on the existing progress document (progress/{userId}_{moduleId})
interface ModuleProgressRecord {
  // ...existing fields...
  draftAnswers?: string; // JSON-serialized answers object, nullable
  draftSavedAt?: Timestamp; // Last auto-save timestamp
}
```

**Implementation:**

Step 1: Add a `saveDraft` function to `progressService.ts` that writes the current answers object (JSON-serialized) to the existing progress document. This is a merge-write — it does not touch `completedBlocks`, `overallProgress`, or any graded data. The draft is a scratchpad, not a grade.

```typescript
export const saveDraftAnswers = async (
  userId: string,
  moduleId: string,
  answers: Record<string, any[]>,
): Promise<void> => {
  const progressId = getProgressId(userId, moduleId);
  const docRef = doc(db, PROGRESS_COLLECTION, progressId);
  await setDoc(docRef, {
    draftAnswers: JSON.stringify(answers),
    draftSavedAt: serverTimestamp(),
  }, { merge: true });
};
```

Step 2: Add a `loadDraftAnswers` function that reads `draftAnswers` from the progress document and parses it back into the answers object. Returns `null` if no draft exists.

Step 3: In `CoursePlayer.tsx`, add a `useEffect` that debounce-saves the `answers` state to Firestore every 30 seconds when changes are detected. Use a `useRef` to track the last-saved snapshot and compare — don't save if nothing changed.

```typescript
const lastSavedRef = useRef<string>('');
const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
  const currentSnapshot = JSON.stringify(answers);
  if (currentSnapshot === lastSavedRef.current) return;
  
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(async () => {
    await saveDraftAnswers(user.uid, moduleId, answers);
    lastSavedRef.current = currentSnapshot;
    // Show subtle save indicator (see Fix 2.1)
  }, 30_000); // 30-second debounce
  
  return () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  };
}, [answers, user?.uid, moduleId]);
```

Step 4: On mount, after `moduleData` loads, check for existing draft answers. If found, hydrate the `answers` state from the draft. Show a subtle toast: "Resuming where you left off" with the timestamp.

Step 5: On successful final submit (the existing `handleSubmit`), clear the draft by writing `draftAnswers: deleteField()` to the progress document. This prevents stale drafts from resurface after grading.

**Ripple Effect:**

- `progressService.ts`: Two new functions added. No changes to existing functions. `recordQuizAttempt` and `completeBlock` remain unchanged — drafts are a parallel write path, not a replacement.
- Firestore security rules: The `progress` collection already allows the user to update their own progress document. The `merge: true` write stays within existing permissions. No rule changes needed.
- Firestore write volume: One write per 30 seconds while a student is actively answering. With 10 concurrent students, that's ~20 writes/minute — well within free-tier limits.
- `stripUndefined` utility: Apply it to the draft write payload to prevent `undefined` values from reaching Firestore. The `answers` object could contain `undefined` entries for unanswered questions.

**Verification:**

1. Open CoursePlayer, answer 2 quiz questions, wait 35 seconds
2. Check Firestore: `progress/{userId}_{moduleId}` should have `draftAnswers` field with serialized answers
3. Close the browser tab entirely
4. Reopen the same module — answers should be pre-filled from the draft
5. Submit the module successfully — `draftAnswers` field should be deleted from Firestore
6. Reopen the module — no draft restoration (clean state, shows completed view)

---

### Fix 1.2: Unsaved Work Warning (beforeunload Guard)

**Root Cause:** There is no `beforeunload` listener or React Router navigation guard on the CoursePlayer. The student can close the tab, hit the back button, or click a sidebar link with no warning. This is the same class of bug identified in Guide 9 for the CourseEditor (dirty-state guard on back navigation), but for the student-facing player.

**Implementation:**

Step 1: Add a `hasUnsavedWork` derived state in `CoursePlayer.tsx`. This is `true` when `answers` has any entries AND the module has not been submitted yet.

```typescript
const hasUnsavedWork = useMemo(() => {
  if (moduleComplete || isPassed) return false;
  return Object.keys(answers).some(blockId => {
    const blockAnswers = answers[blockId];
    return blockAnswers && blockAnswers.length > 0 && 
      blockAnswers.some(a => a !== undefined && a !== null && a !== '');
  });
}, [answers, moduleComplete, isPassed]);
```

Step 2: Add a `beforeunload` listener that fires when `hasUnsavedWork` is true.

```typescript
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    if (hasUnsavedWork) {
      e.preventDefault();
      // Force an immediate draft save before the page unloads
      saveDraftAnswers(user.uid, moduleId, answers);
    }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [hasUnsavedWork, user?.uid, moduleId, answers]);
```

Step 3: Add a navigation guard for the `onBack` callback. When `hasUnsavedWork` is true and the student clicks the back arrow, show a confirmation dialog:

> "You have unsaved answers. Your progress has been auto-saved and will be here when you return. Leave anyway?"

With "Stay" and "Leave" buttons. On "Leave", fire one final `saveDraftAnswers` call before navigating.

**Ripple Effect:**

- `onBack` prop: The existing prop is a simple `() => void`. The guard wraps it without changing the interface.
- `beforeunload`: Modern browsers show a generic "Changes you made may not be saved" message. The draft save in the handler is a best-effort fire-and-forget (no `await`) since `beforeunload` handlers cannot be async.
- CourseEditor guard (Guide 9): That fix is for the instructor side. This fix is for the student side. They are independent — same pattern, different pages, no shared code needed.

**Verification:**

1. Open CoursePlayer, answer 1 question
2. Close the tab — browser should show "Changes may not be saved" dialog
3. Click "Leave" — check Firestore for draft save
4. Open CoursePlayer, answer 1 question, click back arrow — custom confirmation dialog should appear
5. Click "Stay" — remains on CoursePlayer
6. Click "Leave" — navigates away, draft is saved

---

### Fix 1.3: Content Block Read-Tracking

**Root Cause:** Non-assessable blocks (text, headings, video, images) are only marked complete during the `handleSubmit` handler. If a module has only content blocks and no quiz, the student has no way to record progress at all — they read everything, navigate away, and their enrollment shows 0% forever.

The `completeBlock` function in `useModuleProgress` already exists and works correctly. The issue is that nobody calls it until submit time.

**Implementation:**

Step 1: Add a scroll-based visibility tracker in `CoursePlayer.tsx`. Use `IntersectionObserver` to detect when a content block scrolls into the viewport. When a non-assessable block (text, heading, video, image) has been visible for at least 3 seconds, call `completeBlock` for that block.

```typescript
const observedBlocksRef = useRef<Set<string>>(new Set());
const blockTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

useEffect(() => {
  if (!moduleData) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const blockId = entry.target.getAttribute('data-block-id');
      if (!blockId) return;
      
      const block = moduleData.blocks.find(b => b.id === blockId);
      if (!block || block.type === 'quiz' || block.type === 'obj_subj_validator') return;
      if (observedBlocksRef.current.has(blockId)) return;
      
      if (entry.isIntersecting) {
        const timer = setTimeout(() => {
          observedBlocksRef.current.add(blockId);
          const requiredBlocks = moduleData.blocks.filter(b => b.required !== false).length;
          completeBlock(blockId, requiredBlocks);
        }, 3000);
        blockTimersRef.current.set(blockId, timer);
      } else {
        const timer = blockTimersRef.current.get(blockId);
        if (timer) {
          clearTimeout(timer);
          blockTimersRef.current.delete(blockId);
        }
      }
    });
  }, { threshold: 0.6 }); // 60% of block must be visible
  
  // Observe all block elements
  document.querySelectorAll('[data-block-id]').forEach(el => observer.observe(el));
  
  return () => observer.disconnect();
}, [moduleData, completeBlock]);
```

Step 2: Add `data-block-id={block.id}` attributes to the block wrapper divs in the CoursePlayer render loop. These are the observation targets.

Step 3: Skip blocks that are already marked complete in `progress.completedBlocks` — don't re-fire `completeBlock` on return visits.

**Ripple Effect:**

- Progress percentage: `completeBlock` already updates `overallProgress` in the progress document. Content-only modules will now show incremental progress (e.g., "3 of 5 blocks read — 60%") instead of jumping from 0% to 100% on submit.
- Enrollment auto-complete: Cloud Function 2 (`onEnrollmentUpdate`) triggers at 100% progress. For content-only modules, this means the enrollment will auto-complete when the student has read all blocks — no explicit submit needed. This is correct behavior.
- Audit trail: Each `completeBlock` call writes an audit entry via `auditService.logToFirestore`. For a 5-block content module, that's 5 audit entries instead of 1. Acceptable for compliance.
- Quiz modules: Unchanged. Quiz blocks are excluded from the observer. Their completion is still gated by `submitQuiz` in the existing handler.

**Verification:**

1. Create a test module with 3 text blocks, 1 heading, and no quiz
2. Open as a student, scroll slowly through all blocks
3. Check Firestore: `progress/{userId}_{moduleId}.completedBlocks` should accumulate entries as each block is viewed for 3+ seconds
4. Check `overallProgress` increments correctly (25% → 50% → 75% → 100%)
5. Check enrollment status auto-completes at 100%
6. Navigate away and return — previously completed blocks should not re-trigger

---

## Tier 2: Trust-Building — Confidence & Continuity

**Priority:** Fix after Tier 1 is verified. These issues make nurses doubt the system works.
**Estimated Effort:** 1–1.5 days
**Files Touched:** `CoursePlayer.tsx`, `Dashboard.tsx`, `CourseDetail.tsx`, new `SaveIndicator.tsx` component

### Fix 2.1: Save Status Indicator

**Root Cause:** When auto-save fires (Fix 1.1), the student has no visual confirmation. When the final submit succeeds, there's no toast or success message — the enrollment silently updates and the UI shifts to the "completed" view. Nurses working in high-stakes clinical environments need explicit confirmation that their work was recorded.

**Implementation:**

Create a small `SaveIndicator` component that renders in the top-right corner of the CoursePlayer, showing one of three states:

- **Idle:** Hidden (no indicator)
- **Saving:** Subtle spinner + "Saving..." text (appears during auto-save write)
- **Saved:** Checkmark + "Saved" text + timestamp (fades after 4 seconds)

Wire this to the auto-save lifecycle from Fix 1.1. The indicator should also appear when `completeBlock` fires from Fix 1.3.

For the final submit, add a success toast via the existing `addToast` pattern: "Module submitted successfully — your score is being calculated." This replaces the current silent transition.

For submit failures, the existing `catch` block logs to `console.error` but shows nothing to the student. Add an error toast: "Submission failed — your answers have been saved as a draft. Please try again."

**Ripple Effect:**

- Toast system: Reuses the existing `addToast` from the app's toast context. No new infrastructure.
- Component placement: The `SaveIndicator` is a child of CoursePlayer, not a global component. It only appears during course consumption.

**Verification:**

1. Open CoursePlayer, answer a question, wait 30 seconds — "Saving..." then "Saved" indicator should appear
2. Submit a module successfully — success toast should appear
3. Disconnect network (DevTools), attempt submit — error toast should appear with draft reassurance
4. Reconnect and retry — submit should succeed

---

### Fix 2.2: Resume Context on Dashboard

**Root Cause:** The Dashboard shows enrollment cards with course title, progress percentage, and status. But it doesn't tell the student *which module* they were working on or when they last made progress. A nurse returning after a shift break sees "Hospice Documentation — 40% complete" but has no way to know whether she was on Module 2 or Module 4 without clicking through.

**Implementation:**

Step 1: Extend the enrollment card on `Dashboard.tsx` to show two new pieces of information:

- **Last active module name:** Query the `progress` subcollection for this user + course, sort by `updatedAt` descending, take the first result. Display: "Last active: Module 3 — Core Concepts"
- **Last activity timestamp:** From the same progress document's `updatedAt`. Display: "2 hours ago" or "Yesterday at 3:15 PM"

Step 2: Add a "Continue" button that deep-links directly to the CoursePlayer for that specific module, instead of going to the CourseDetail page first.

```
Dashboard Card:
┌─────────────────────────────────────────┐
│  Hospice Documentation Fundamentals     │
│  ████████░░░░░░░░░░░░  40%             │
│                                         │
│  Last active: Module 3 — Core Concepts  │
│  2 hours ago                            │
│                                         │
│  [Continue Module 3]    [View Course]   │
└─────────────────────────────────────────┘
```

**Ripple Effect:**

- Firestore reads: One additional query per enrollment card (progress docs for this user + course). For a student with 3 active enrollments, that's 3 extra reads on dashboard load. Acceptable.
- Navigation: The "Continue" button uses the existing route pattern (`/course/:courseId/module/:moduleId`). No new routes needed.
- Completed enrollments: For enrollments with status `completed`, hide the "Continue" button and show "Completed on [date]" instead.

**Verification:**

1. As a student with an in-progress enrollment, open Dashboard
2. Card should show the last module you were working on by name
3. Card should show when you last made progress
4. Click "Continue Module X" — should land directly in CoursePlayer for that module
5. Completed enrollments should show completion date, not a "Continue" button

---

### Fix 2.3: Module-to-Module Navigation

**Root Cause:** When a student finishes a module, the CoursePlayer shows a "Return to Catalog" button. To start the next module, they must: click back → find the course in the catalog → click into CourseDetail → find the next module → click it. That's 4 navigation steps for something that should be 1.

**Implementation:**

Step 1: Pass the full module list and current module index to CoursePlayer (or fetch it within the component). After a module is completed (the "Module Completed" screen), show:

- **"Next Module: [Title]" button** if there's a subsequent module in the course
- **"Return to Course" button** (not "Return to Catalog" — go to CourseDetail, not the catalog)
- **"Course Complete!" state** if this was the last module, with overall course grade if available

Step 2: Update the `onBack` callback to navigate to CourseDetail for this course, not the catalog root. The student stays in the context of their current course.

**Ripple Effect:**

- CoursePlayer props: Needs either a `modules` array prop or an internal fetch of the course's module list. The latter is more self-contained — `courseService.getCourseWithModules` already exists.
- Module ordering: Modules have an `order` field. The "next module" is `modules.sort(m => m.order)[currentIndex + 1]`. If modules are unordered, fall back to the sequence they were added.

**Verification:**

1. Complete a module that is not the last in the course
2. "Next Module: [Title]" button should appear
3. Click it — should load the next module's CoursePlayer directly
4. Complete the final module in a course — "Course Complete!" state should appear
5. Click "Return to Course" — should go to CourseDetail, not catalog

---

### Fix 2.4: Estimated Duration Display

**Root Cause:** The Module type has an `estimatedTime` field (set in the Module Builder's settings panel), but CoursePlayer doesn't display it. Nurses planning training around patient care schedules need to know "this module takes about 20 minutes" before they start.

**Implementation:**

Display the estimated duration in two places:

1. **CourseDetail page** — next to each module in the list: "Module 2: Core Concepts — ~20 min"
2. **CoursePlayer header** — show alongside the module title: "Core Concepts · 20 min estimated"

If `estimatedTime` is not set (null/undefined), show nothing — don't show "Unknown" or "N/A."

**Ripple Effect:**

- Module Builder: The `estimatedTime` field already exists in the settings panel. No backend changes.
- Data migration: Existing modules may not have `estimatedTime` set. The feature degrades gracefully (hidden when absent).

**Verification:**

1. Set `estimatedTime: 20` on a test module via Module Builder
2. Open CourseDetail — module should show "~20 min"
3. Open CoursePlayer — header should show duration
4. Check a module without `estimatedTime` — no duration displayed, no errors

---

## Tier 3: Polish — Professional Completeness

**Priority:** Fix after Tiers 1 and 2 are verified. These issues affect perception of the platform's maturity.
**Estimated Effort:** 1–2 days
**Files Touched:** `CoursePlayer.tsx`, `MyGrades.tsx`, `BlockRenderer.tsx`, new `QuizAttemptIndicator.tsx`

### Fix 3.1: Quiz Attempt Visibility

**Root Cause:** Cloud Function 1 (`onGradeCreate`) auto-creates a `remediation_request` when a learner fails a module 3+ times. But the student has no visibility into their attempt count. They fail twice, start their third attempt with no idea that one more failure triggers a lockout requiring supervisor intervention.

**Implementation:**

Step 1: Read the `progress.completedBlocks[blockId].attempts` field (already written by `recordQuizAttempt` in `progressService.ts`) and display it in the CoursePlayer quiz header:

"Attempt 2 of 3 — one more failed attempt will require supervisor approval to retry."

Step 2: On the 3rd attempt, show a warning banner above the quiz:

"This is your final attempt before supervisor review is required. Take your time."

Step 3: After lockout (enrollment status = `failed` or `needs_remediation`), the CoursePlayer should show a clear locked state:

"This module requires supervisor approval before you can retry. Please contact your supervisor."

With no quiz form rendered — don't let them fill out answers they can't submit.

**Ripple Effect:**

- Attempt count source: `progress.completedBlocks[blockId].attempts` is the authoritative count. It's incremented by `recordQuizAttempt` on every submission regardless of pass/fail.
- Lockout trigger: The 3-fail lockout lives in Cloud Function 1. The UI is only displaying the count and the consequence — it's not enforcing the lockout (the backend handles that).
- Multi-quiz modules: Each quiz block tracks attempts independently. Display the count per quiz block, not per module.

**Verification:**

1. Submit a quiz and fail — should show "Attempt 1 of 3"
2. Fail again — "Attempt 2 of 3" with warning text
3. Fail a third time — module should show locked state
4. Check `remediation_requests` collection — document should exist with status `pending`

---

### Fix 3.2: Per-Module Grade Breakdown on MyGrades

**Root Cause:** The `MyGrades.tsx` page exists and shows course-level grades, but lacks per-module score breakdowns. The `course_grades` collection stores the full `CourseGradeCalculation` object (from Cloud Function 6) which contains `moduleGrades[]` with individual module scores, weights, and weighted contributions. The data exists — it just isn't rendered.

**Implementation:**

Step 1: On MyGrades, when a student clicks a course grade row, expand it to show the per-module breakdown:

```
Hospice Documentation Fundamentals — 87% (Passed)
├── Module 1: Introduction         — 92% × 20% weight = 18.4 pts
├── Module 2: Core Concepts        — 85% × 40% weight = 34.0 pts  (Critical ✓)
└── Module 3: Practical Application — 88% × 40% weight = 35.2 pts  (Critical ✓)
```

Step 2: Highlight critical modules with a small indicator. If a critical module was failed, show it in red with a note explaining the consequence.

Step 3: Show the grading formula explanation at the bottom: "Your course grade is calculated as the weighted average of all module scores. Critical modules must be passed individually."

**Ripple Effect:**

- Data source: `course_grades/{userId}_{courseId}` already contains `moduleGrades[]`. No new backend queries.
- GradeBreakdown component: The `GradeBreakdown` component was already built (per the Health Report). Wire it into MyGrades if it isn't already connected.

**Verification:**

1. As a student with a completed course, open MyGrades
2. Click a course grade row — per-module breakdown should expand
3. Module weights should sum to 100%
4. Weighted contributions should sum to the overall grade
5. Critical modules should be labeled

---

### Fix 3.3: Completion Receipt Screen

**Root Cause:** When a student completes their final module in a course, the CoursePlayer shows the individual module completion screen, then the student navigates back to find their enrollment status changed. There's no ceremony — no moment that acknowledges "you completed the entire course."

**Implementation:**

After the final module in a course is completed and the course-level grade has been calculated, show a completion receipt screen:

```
┌─────────────────────────────────────────────┐
│              Course Completed!               │
│                                              │
│   Hospice Documentation Fundamentals         │
│                                              │
│   Overall Grade: 87% — PASSED                │
│   Competency Level: COMPETENT                │
│                                              │
│   Completed: March 26, 2026                  │
│   Certificate ID: HHCA-2026-A7F3B2          │
│                                              │
│   [View Grade Breakdown]  [Return to Dashboard] │
└─────────────────────────────────────────────┘
```

This screen pulls from the `course_grades` document. If the grade hasn't been calculated yet (async Cloud Function delay), show "Grade is being calculated..." with a polling interval that checks every 2 seconds for up to 10 seconds, then falls back to "Your grade will appear on your Dashboard shortly."

**Ripple Effect:**

- Certificate ID: The existing `grade.id.slice(-12).toUpperCase()` pattern (already in CoursePlayer's completed state) can be reused. This is a display ID, not the Phase 4 CE certificate.
- Cloud Function timing: `calculateCourseGrade` (Cloud Function 6) fires on grade creation. There may be a 1-3 second delay between the client-side grade write and the course grade calculation completing. The polling handles this gracefully.

**Verification:**

1. Complete the final module of a multi-module course
2. Completion receipt should appear within a few seconds
3. Overall grade, competency level, and completion date should display correctly
4. "View Grade Breakdown" should navigate to MyGrades with the course expanded
5. "Return to Dashboard" should go to Dashboard with the course showing as completed

---

### Fix 3.4: Image Block Upload (Cross-reference: Guide 10)

**Root Cause:** Already documented in Guide 10 — the image content block in BlockRenderer renders an `<img>` tag, but the Module Builder's image block has no file input wired to Firebase Storage. This means instructors can't add images to content, which limits the clinical training value (wound care photos, equipment diagrams, documentation examples).

**Implementation:** Defer to Guide 10's specification. This is listed here for completeness as a student-facing gap, but the fix lives in the authoring pipeline.

**Verification:** After Guide 10 is completed, verify that images render correctly in the CoursePlayer's BlockRenderer.

---

## Sequencing Summary

| Order | Fix | Tier | Est. Time | Dependencies |
|-------|-----|------|-----------|-------------|
| 1 | 1.1 Draft Answer Persistence | Critical | 3–4 hours | None |
| 2 | 1.2 Unsaved Work Warning | Critical | 1–2 hours | Fix 1.1 (references saveDraft) |
| 3 | 1.3 Content Block Read-Tracking | Critical | 2–3 hours | None |
| 4 | 2.1 Save Status Indicator | Trust | 1–2 hours | Fix 1.1 (surfaces save state) |
| 5 | 2.2 Resume Context on Dashboard | Trust | 2–3 hours | Fix 1.3 (needs progress data) |
| 6 | 2.3 Module-to-Module Navigation | Trust | 2–3 hours | None |
| 7 | 2.4 Estimated Duration Display | Trust | 30 min | None |
| 8 | 3.1 Quiz Attempt Visibility | Polish | 2–3 hours | None |
| 9 | 3.2 Per-Module Grade Breakdown | Polish | 2–3 hours | None |
| 10 | 3.3 Completion Receipt Screen | Polish | 2–3 hours | None |
| 11 | 3.4 Image Block Upload | Polish | (Guide 10) | Guide 10 |

---

## Out-of-Scope Files

These files should NOT be modified by any fix in this guide:

- `functions/src/index.ts` — All 6 Cloud Functions are stable. No backend changes needed.
- `firestore.rules` — Existing rules already permit the writes described here.
- `services/gradeService.ts` — Grade entry/calculation paths are not affected.
- `services/enrollmentService.ts` — Enrollment status transitions remain as-is.
- Any instructor/admin pages (CourseManager, CourseEditor, ModuleBuilder, GradeManagement, UserManagement, AuditLogs)

---

## End-to-End Verification Scenario

After all tiers are implemented, run this complete walkthrough:

1. **Login** as a staff/student user
2. **Enroll** in a multi-module course from the Catalog
3. **Open Module 1** (content-only: text + heading + video blocks)
4. **Scroll through** all blocks — progress should increment in real-time (Fix 1.3)
5. **Check Dashboard** — should show "Last active: Module 1" with timestamp (Fix 2.2)
6. **Open Module 2** (has quiz with MC + fill-blank questions)
7. **Answer 2 of 4 questions**, then wait 35 seconds — save indicator should appear (Fix 2.1)
8. **Close the browser entirely**
9. **Reopen the app**, go to Dashboard — "Continue Module 2" button should appear (Fix 2.2)
10. **Click Continue** — CoursePlayer should load with 2 answers pre-filled (Fix 1.1)
11. **Answer remaining questions**, submit — success toast should appear (Fix 2.1)
12. **Fail the quiz** — attempt counter should show "Attempt 1 of 3" (Fix 3.1)
13. **Retry and pass** — "Next Module" button should appear (Fix 2.3)
14. **Click "Next Module"** — Module 3 loads directly
15. **Complete Module 3** (final module) — completion receipt should appear (Fix 3.3)
16. **Open MyGrades** — per-module breakdown should be available (Fix 3.2)
17. **Open Dashboard** — enrollment should show as completed with date

If all 17 steps pass, the student experience is hardened for production use.

---

## Relationship to Existing Guides

- **Guide 9 (Course Builder UX Overhaul):** Fix 1.2's dirty-state guard mirrors the CourseEditor back-navigation guard from Guide 9. Same pattern, different page. Independent implementations.
- **Guide 10 (Content Block Fixes):** Fix 3.4 is a cross-reference to Guide 10's image upload work. This guide does not duplicate that specification.
- **Guide 2 (Grade Review Queue):** The submit pipeline in Fix 1.1 does not alter the `needs_review` path. Drafts are cleared on submit, and the existing `handleSubmit` flow (which sets `needs_review` for short-answer questions) remains unchanged.
- **Guide 3 (Supervisor Unlock):** Fix 3.1 surfaces the attempt count and lockout state to the student. The lockout enforcement remains in Cloud Function 1.
