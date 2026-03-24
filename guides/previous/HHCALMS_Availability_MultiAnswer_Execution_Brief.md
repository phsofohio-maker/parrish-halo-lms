# HHCALMS Execution Brief: Availability Windows & Multiple Answer Questions

**Priority:** SHOULD-SHIP (Administration Request)  
**Estimated Effort:** 2–3 focused days (both features)  
**Phase:** Phase 2 Enhancement  
**Risk Level:** LOW (additive features, no existing contract breaks)

---

## 1. Overview & Approach

Administration has requested two enhancements to increase instructional control and assessment fidelity. Both features are additive: they extend existing contracts without breaking any current behavior. Existing courses and quizzes continue to work identically; the new capabilities are opt-in.

**Complexity Budget Justification:**  
- **Availability Windows:** adds two optional ISO date fields to Course and Module. The complexity cost is minimal (optional fields, null-safe checks) and the benefit is non-negotiable for administration control over training schedules.  
- **Multiple Answer:** adds one new value to the QuizQuestionType union and one new grading case. The existing exhaustive switch pattern in `gradeCalculation.ts` is designed for exactly this extension.

**Guiding Principle:** Both features follow the existing "add to union, add to switch" extension pattern established by the 5 original question types and the block type system. No new architectural patterns are introduced.

---

## 2. Feature A: Availability Windows (Courses & Modules)

An optional setting on courses and modules that controls when students can enroll or participate. When set, the system enforces open/close dates and surfaces clear messaging in the UI. When not set, behavior is identical to today (always available).

### 2.1 The Contract (Type Changes)

**File:** `functions/src/types.ts`

Add a shared availability window interface and extend both Course and Module:

```typescript
// NEW: Shared availability window type
export interface AvailabilityWindow {
  opensAt?: string;   // ISO 8601 datetime, e.g. "2026-04-01T08:00:00Z"
  closesAt?: string;  // ISO 8601 datetime
}

// Extend Course interface — add optional field:
export interface Course {
  // ... existing fields unchanged ...
  availability?: AvailabilityWindow;  // NEW
}

// Extend Module interface — add optional field:
export interface Module {
  // ... existing fields unchanged ...
  availability?: AvailabilityWindow;  // NEW
}
```

**Design Decision: Why optional?** Making availability entirely optional means zero migration cost. Existing courses/modules have no availability field → evaluates to `undefined` → enforcement logic treats as "always open." No Firestore documents need updating. No existing queries break.

### 2.2 Phase 1: Backend (Types, Services, Security Rules)

#### Step 1: Availability Utility

**File:** `src/utils/availabilityUtils.ts` (NEW)

Create a pure utility function that is the Single Source of Truth for availability logic. Every UI component and enforcement point imports this function.

```typescript
export type AvailabilityStatus = "not_yet_open" | "open" | "closed";

export interface AvailabilityCheck {
  status: AvailabilityStatus;
  opensAt: Date | null;
  closesAt: Date | null;
  message: string;  // Human-readable: "Opens Apr 1" / "Available" / "Closed Jan 15"
}

export function checkAvailability(
  window?: AvailabilityWindow,
  now: Date = new Date()
): AvailabilityCheck {
  // If no window or both dates null → always open
  // If opensAt set and now < opensAt → "not_yet_open"
  // If closesAt set and now > closesAt → "closed"
  // Otherwise → "open"
}
```

The `now` parameter is injectable for testing determinism.

#### Step 2: Service Layer Updates

**File:** `src/services/courseService.ts`

No changes required to `createCourse` or `updateCourse`. Both already spread the Course partial into the Firestore write, so adding `availability` to the Course type automatically allows it to be persisted. The existing `stripUndefined` pattern handles cases where availability is not set.

**Verify:** ensure `updateCourse` does not have a destructured whitelist of allowed fields. If it does, add `availability` to the whitelist.

#### Step 3: Firestore Security Rules

No security rule changes required. The availability field is written by instructors/admins who already have write access. Enforcement is client-side.

**Why not server-side enforcement?** Firestore security rules cannot evaluate `Timestamp.now()` against document fields for availability windows. Enforcement is client-side (catalog filtering, player gating) with audit logging. A future Cloud Function could additionally validate enrollment attempts.

### 2.3 Phase 2: Course-Level UI (CourseEditor)

**File:** `src/pages/CourseEditor.tsx`

Add an "Availability Window" section inside the existing Course Details collapsible panel (the `metadataOpen` section). Place it after the CE Credits field and before the CoverImagePicker.

#### UI Specification

```tsx
{/* Inside the Course Details panel, after CE Credits */}
<div className="col-span-2 border-t border-gray-100 pt-4 mt-2">
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Availability Window
    <span className="text-xs text-gray-400 font-normal ml-1">(optional)</span>
  </label>
  <p className="text-xs text-gray-400 mb-3">
    Set dates to control when students can access this course. Leave blank for always available.
  </p>
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="block text-xs text-gray-500 mb-1">Opens</label>
      <input type="datetime-local"
        value={editOpensAt}
        onChange={(e) => setEditOpensAt(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
          focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
    <div>
      <label className="block text-xs text-gray-500 mb-1">Closes</label>
      <input type="datetime-local"
        value={editClosesAt}
        onChange={(e) => setEditClosesAt(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
          focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
  </div>
  {/* Clear dates link — only shown when at least one date is set */}
  {(editOpensAt || editClosesAt) && (
    <button onClick={() => { setEditOpensAt(''); setEditClosesAt(''); }}
      className="text-xs text-gray-400 hover:text-red-500 mt-2 transition-colors">
      Clear dates
    </button>
  )}
  {/* Validation: close before open */}
  {editOpensAt && editClosesAt && new Date(editClosesAt) <= new Date(editOpensAt) && (
    <p className="text-xs text-amber-600 mt-2">Close date must be after open date.</p>
  )}
</div>
```

**State management:** Add `editOpensAt` and `editClosesAt` to component state, initialized from `course.availability?.opensAt` and `course.availability?.closesAt`. On save, construct the availability object only if at least one date is non-empty; otherwise set `availability` to `null` to remove it from Firestore.

**Validation:** If both dates are set, `closesAt` must be after `opensAt`. Show inline amber warning, disable save button while invalid.

### 2.4 Phase 3: Module-Level UI

#### A. CourseEditor Module Row
**File:** `src/pages/CourseEditor.tsx`

In the module list panel, add a subtle Calendar icon (from `lucide-react`, stroke-width 1.75) next to modules that have an availability window set. On hover, show a tooltip with the date range.

#### B. ModuleBuilder Settings Card
**File:** `src/pages/ModuleBuilder.tsx`

Add the same date-time input pair to the Module Settings card, placed after the Duration field. The pattern is identical to CourseEditor. State management uses existing `updateModuleMetadata({ availability: { opensAt, closesAt } })`. The `useModule` hook already accepts `Partial<Module>`, so no hook changes needed.

### 2.5 Phase 4: Enforcement (Catalog, Player, Enrollment)

#### A. Course Catalog / Course Detail
**Files:** `src/pages/CourseCatalog.tsx`, `src/pages/CourseDetail.tsx`

Before rendering the Enroll button, call `checkAvailability(course.availability)`. If "not_yet_open", show disabled button with "Opens [date]". If "closed", show "Enrollment Closed" badge. Courses still appear in catalog (so students know they exist) but with availability badge.

#### B. Course Player Module Navigation
**File:** `src/pages/CoursePlayer.tsx`

Before loading a module, check both parent course availability AND individual module availability. If either is not open, redirect back with toast message.

#### C. Audit Logging
When a student attempts to access a closed/not-yet-open course/module, log an audit entry with actionType `ENROLLMENT_UPDATE` and details describing the access attempt and availability status.

### 2.6 Ripple Effect Analysis

| Component | Impact | Action Required |
|---|---|---|
| `functions/src/types.ts` | Course + Module get optional availability field | Add AvailabilityWindow interface and optional field |
| `courseService.ts` | Already spreads partials into writes | Verify no field whitelist blocks new field |
| `CourseEditor.tsx` | Course Details panel gets new section | Add date inputs, wire to save |
| `ModuleBuilder.tsx` | Module Settings card gets new section | Add date inputs, wire to updateModuleMetadata |
| `useModule.ts` | Already accepts Partial<Module> | No changes needed |
| `useCourses.ts` | Course fetch maps Firestore docs | Add availability to mapping (or auto-includes via spread) |
| `CourseCatalog.tsx` | Enrollment button needs gating | Call checkAvailability, render badge |
| `CourseDetail.tsx` | Same enrollment gating | Call checkAvailability, render badge |
| `CoursePlayer.tsx` | Module access needs gating | Check course + module availability on load |
| Firestore Security Rules | No changes needed | Enforcement is client-side |
| Cloud Functions | No changes needed | Existing functions do not read availability |
| Existing courses/modules | Zero impact | undefined availability = always open |

### 2.7 Verification Checklist

1. Create a course with availability window (opens tomorrow). Verify: catalog shows "Opens [date]" badge. Enroll button is disabled.
2. Set open date to yesterday, close date to tomorrow. Verify: course shows as open, enrollment works normally.
3. Set close date to yesterday. Verify: catalog shows "Enrollment Closed" badge.
4. Set module-level availability (opens next week). Verify: CourseEditor shows calendar icon on that module row.
5. As student, attempt to direct-navigate to a not-yet-open module. Verify: redirected with toast.
6. Clear both dates. Verify: course reverts to "always available" behavior.
7. Set close date before open date. Verify: inline validation warning, save disabled.
8. Verify: Firestore document contains correct ISO 8601 strings.
9. Verify: audit log entry created on closed-course access attempt.
10. Verify: existing courses without availability field work identically (regression).

---

## 3. Feature B: Multiple Answer Questions

A new quiz question type where students must select ALL correct answers. Unlike multiple-choice (select one), multiple-answer awards credit only when the student selects exactly the correct set. Critical for clinical competency assessment.

### 3.1 The Contract (Type Changes)

**File:** `functions/src/types.ts`

#### Step 1: Extend the QuizQuestionType Union

```typescript
export type QuizQuestionType =
  | "multiple-choice"
  | "true-false"
  | "matching"
  | "fill-blank"
  | "short-answer"
  | "multiple-answer";  // NEW
```

#### Step 2: Clarify correctAnswer Semantics

The existing `QuizQuestion.correctAnswer` is typed as `number | string | string[]`. For multiple-answer, it will be `number[]` (indices of all correct options). Update the type to include `number[]` and add JSDoc:

```typescript
export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  question: string;
  options: string[];
  /**
   * Type depends on question type:
   * - multiple-choice: number (index of correct option)
   * - true-false: number (0=True, 1=False)
   * - fill-blank: string (correct text)
   * - matching: string[] (not used directly; see matchingPairs)
   * - short-answer: string (not used; manual grading)
   * - multiple-answer: number[] (indices of ALL correct options)
   */
  correctAnswer: number | string | number[] | string[];
  matchingPairs?: MatchingPair[];
  points: number;
  explanation?: string;
}
```

### 3.2 Phase 1: Backend (Types, Grading)

#### Step 1: Add Grading Logic

**File:** `src/utils/gradeCalculation.ts`

Add a new case to the `gradeQuestion` switch, between "multiple-choice"/"true-false" and "fill-blank":

```typescript
case "multiple-answer": {
  // correctAnswer is number[] (indices of all correct options)
  const correctSet = new Set(
    Array.isArray(question.correctAnswer)
      ? (question.correctAnswer as number[])
      : []
  );
  const userSet = new Set(
    Array.isArray(userAnswer) ? (userAnswer as number[]) : []
  );

  // All-or-nothing: must select exactly the correct set
  const allCorrect =
    correctSet.size > 0 &&
    userSet.size === correctSet.size &&
    [...correctSet].every(idx => userSet.has(idx));

  return {
    ...base,
    isCorrect: allCorrect,
    earnedPoints: allCorrect ? question.points : 0,
  };
}
```

**Grading Policy: All-or-Nothing.** For clinical training, partial credit on "select all correct" creates false competency signals. If Parrish later requests partial credit, add it as an optional per-question setting without changing the default.

#### Step 2: Add Answer Validation

**File:** `src/utils/gradeCalculation.ts` — `isAnswerComplete` function:

```typescript
case "multiple-answer":
  return Array.isArray(answer) && (answer as number[]).length > 0;
```

#### Step 3: Update CoursePlayer Validation

**File:** `src/pages/CoursePlayer.tsx` — `isQuestionAnswered` function:

```typescript
case "multiple-answer":
  return Array.isArray(answer) && answer.length > 0;
```

### 3.3 Phase 2: Builder UI (BlockEditor)

**File:** `src/components/builder/BlockEditor.tsx`

#### Step 1: Add to Type Selector

In the question type `<select>` dropdown, add after "Multiple Choice":

```tsx
<option value="multiple-choice">Multiple Choice</option>
<option value="multiple-answer">Multiple Answer</option>  {/* NEW */}
<option value="true-false">True / False</option>
```

#### Step 2: Add Default Initialization

In the type-change handler switch:

```typescript
case "multiple-answer":
  defaults.options = ["Option A", "Option B", "Option C"];
  defaults.correctAnswer = [];  // Empty array; instructor picks correct ones
  defaults.matchingPairs = undefined;
  break;
```

#### Step 3: Add Editor Rendering

The UI is similar to multiple-choice but uses **checkboxes** instead of radio buttons and allows multiple correct answer selections.

- Each option row: `[Checkbox] [Text Input] [Delete Button]`
- Bottom: `"+ Add Option"` button
- Label above options: `"Check all correct answers"` in `text-xs text-gray-500`
- Correct answers toggle `number[]` stored in `correctAnswer`

```typescript
// Toggle logic for checkbox:
const currentCorrect = Array.isArray(q.correctAnswer)
  ? [...(q.correctAnswer as number[])]
  : [];
const idx = optionIndex;
if (currentCorrect.includes(idx)) {
  updateQuestion({ correctAnswer: currentCorrect.filter(i => i !== idx) });
} else {
  updateQuestion({ correctAnswer: [...currentCorrect, idx].sort() });
}
```

**Visual:** Options marked correct show green checkbox + subtle `emerald-50` row tint.

**Validation warnings:**
- Zero options marked correct: "At least one option must be marked correct."
- All options marked correct: "At least one option must be incorrect."

### 3.4 Phase 3: Player UI (CoursePlayer / BlockRenderer)

**Files:** `src/pages/CoursePlayer.tsx`, `src/components/player/BlockRenderer.tsx` (if separate)

Key differences from multiple-choice rendering:

1. **Checkboxes** (square) instead of radio buttons (circular) — universal "select multiple" convention.
2. **Instruction line** above options: `"Select all correct answers"` in `text-sm text-gray-500 italic`.
3. **Answer state:** Track as `number[]`. Toggle behavior: clicking selected deselects, clicking unselected adds.
4. **Post-submission feedback:** Per-option indicators — green check for correct selections/non-selections, red X for incorrect selections/missed answers.

### 3.5 Ripple Effect Analysis

| Component | Impact | Action Required |
|---|---|---|
| `functions/src/types.ts` | QuizQuestionType union gets new member | Add "multiple-answer", JSDoc on correctAnswer |
| `gradeCalculation.ts` | New case in gradeQuestion switch | Add set comparison logic |
| `gradeCalculation.ts` | isAnswerComplete new case | Add array length check |
| `BlockEditor.tsx` | Type selector + editor rendering | Add dropdown option, defaults, checkbox editor |
| `CoursePlayer.tsx` | isQuestionAnswered new case | Add array length check |
| `CoursePlayer.tsx` / BlockRenderer | Player rendering | Checkbox UI with toggle behavior |
| `GradeManagement.tsx` | Review modal per-type display | Add display case for multiple-answer |
| `QuestionTypeVerificationPanel` | Test coverage | Add test case for new type |
| Cloud Functions | No changes needed | Operate on scores, not question types |
| Firestore Security Rules | No changes needed | Validate score bounds, not question types |
| Existing quiz questions | Zero impact | Existing types unchanged |

### 3.6 Verification Checklist

1. Create a quiz with a multiple-answer question (4 options, 2 correct). Save. Reload. Verify persistence.
2. Change a multiple-choice question to multiple-answer. Verify: options preserved, correctAnswer reset to `[]`.
3. Answer correctly (exactly the right set). Verify: full points.
4. Answer with one extra incorrect option. Verify: 0 points.
5. Answer with one correct option missing. Verify: 0 points.
6. After submission, verify per-option green/red feedback.
7. In GradeManagement review modal, verify multiple-answer submissions display correctly.
8. Verify all 5 existing question types still work (regression).
9. Run gradeQuestion function tests for: all correct, partial, all wrong, empty answer.

---

## 4. Out-of-Scope File List

Do NOT modify during this execution. If a change seems needed, stop and flag it.

| File / System | Reason |
|---|---|
| `functions/src/index.ts` (Cloud Functions) | No Cloud Function changes needed |
| `firestore.rules` | Enforcement is client-side |
| Firebase Auth / JWT Claims | No role changes involved |
| `services/auditService.ts` | Already generic enough |
| `services/gradeService.ts` | Operates on scores, not question types |
| `hooks/useModuleProgress.ts` | Quiz submission flow unchanged |
| `services/firebase.ts` | No config changes |
| `services/invitationService.ts` | Unrelated feature |
| Enrollment Firestore documents (schema) | No schema changes |
| Any seed scripts | Not part of feature implementation |

---

## 5. Sequencing & Dependencies

The two features are independent. Within each, phases must be sequential.

### Recommended Execution Order

| # | Task | Est. Time | Depends On |
|---|---|---|---|
| 1 | Feature B, Phase 1: Types + Grading | 30 min | Nothing (smallest, fastest win) |
| 2 | Feature B, Phase 2: Builder UI | 1–2 hrs | Step 1 |
| 3 | Feature B, Phase 3: Player UI | 1–2 hrs | Step 2 |
| 4 | Feature B, Verification | 30 min | Steps 1–3 |
| 5 | Feature A, Phase 1: Types + Utility | 30 min | Nothing |
| 6 | Feature A, Phase 2: CourseEditor UI | 1–2 hrs | Step 5 |
| 7 | Feature A, Phase 3: ModuleBuilder UI | 1 hr | Step 6 |
| 8 | Feature A, Phase 4: Enforcement | 1–2 hrs | Steps 5–7 |
| 9 | Feature A, Verification | 30 min | Steps 5–8 |
| 10 | Regression: run existing test suite | 10 min | All steps |

**One Change at a Time:** Feature B (Multiple Answer) is recommended first because it is smaller, contained within fewer files, and establishes confidence before the more cross-cutting Feature A (Availability Windows). Each numbered step should be committed independently.
