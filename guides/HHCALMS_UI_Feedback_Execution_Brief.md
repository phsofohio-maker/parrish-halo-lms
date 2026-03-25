# HHCALMS UI Feedback Retrofit — Claude Code Execution Brief

**Guide 11 | March 25, 2026 | 8 Fixes, 6 New Files, 12 Modified Files**

---

## Execution Rules

Complete each fix in order. Verify independently before proceeding. Do not batch changes across fixes.

### Out-of-Scope Files (DO NOT TOUCH)

- `functions/src/index.ts`
- `functions/src/types.ts`
- `firestore.rules`
- `storage.rules`
- `src/services/*` — no business logic changes
- `src/contexts/AuthContext.tsx`
- `firebase.json`, `.firebaserc`

### Conventions

- Inter font, Lucide icons (strokeWidth={1.75}), clinical emerald palette
- No emojis in UI. No gradients. No colored container backgrounds.
- All async operations: try/catch with toast on success AND error. No silent failures.
- `stripUndefined` before all Firestore writes (existing pattern)
- Every new component gets a TypeScript interface for props

---

## Complete File Change Manifest

| File Path | Action | Purpose |
|-----------|--------|---------|
| `src/components/ui/Toast.tsx` | CREATE | Toast notification visual component |
| `src/contexts/ToastContext.tsx` | CREATE | Toast state management + provider |
| `src/hooks/useToast.ts` | CREATE | Consumer hook for addToast() |
| `src/hooks/useAppSound.ts` | CREATE | SND wrapper hook with global toggle |
| `src/components/ui/Skeleton.tsx` | CREATE | Loading placeholder component |
| `src/components/builder/BlockSettingsPanel.tsx` | CREATE | Block-level settings drawer |
| `src/App.tsx` | MODIFY | Wrap with ToastProvider |
| `src/components/ui/Button.tsx` | MODIFY | Add active:scale, focus-visible ring offset |
| `src/components/builder/BlockEditor.tsx` | MODIFY | Wire Settings button + delete undo toast |
| `src/pages/CourseManager.tsx` | MODIFY | Toast on create/delete/publish |
| `src/pages/CourseEditor.tsx` | MODIFY | Toast on save/module ops + dirty-state guard |
| `src/pages/ModuleBuilder.tsx` | MODIFY | Replace showSaveSuccess with toast |
| `src/pages/GradeManagement.tsx` | MODIFY | Toast on approve/reject + modal UX |
| `src/pages/UserManagement.tsx` | MODIFY | Wire + Add Staff + toast on enroll |
| `src/pages/RemediationQueue.tsx` | MODIFY | Toast on approve/deny |
| `src/pages/MyGrades.tsx` | MODIFY | Wire Print button, defer Export PDF |
| `src/pages/CourseCatalog.tsx` | MODIFY | Toast on enroll + card hover states |
| `src/pages/Dashboard.tsx` | MODIFY | Card hover/active states |

---

## Fix 1: Toast Notification System

**Tier:** CRITICAL | **Estimate:** 1.5 hours | **Files:** 3 new, 1 modified | **Risk:** None (additive)

### Root Cause

No toast/notification system exists. Every async operation completes silently.

### Step 1: Create `src/components/ui/Toast.tsx`

```typescript
export interface ToastData {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}
```

**Visual spec (Brand Guide section 4.9):**

- Background: white. Border: 1px solid gray-200. Border-left: 4px solid {semantic color}. Border-radius: 8px. Shadow: shadow-md. Padding: 16px. Max-width: 420px.
- Success border: `primary-600` (#159A61). Icon: `CheckCircle` (Lucide).
- Error border: `red-500` (#EF4444). Icon: `AlertCircle` (Lucide).
- Warning border: `amber-500` (#F59E0B). Icon: `AlertTriangle` (Lucide).
- Info border: `blue-500` (#3B82F6). Icon: `Info` (Lucide).
- Title: Inter 600, 14px, gray-900. Body: Inter 400, 14px, gray-600.
- Entrance: `transition-all duration-200 ease-out`. Start: `opacity-0 translate-x-10`. End: `opacity-100 translate-x-0`.
- Exit: `opacity-0 -translate-y-2` transition 150ms. Remove from DOM after transition.
- Close button: `X` icon (Lucide), top-right, `text-gray-400 hover:text-gray-600`.

### Step 2: Create `src/contexts/ToastContext.tsx`

```typescript
interface ToastContextValue {
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, "id">) => string;
  removeToast: (id: string) => void;
}
```

**Implementation details:**

- `addToast` generates unique ID (`crypto.randomUUID()` or `Math.random` fallback), adds to state, sets `setTimeout` for auto-dismiss.
- Default durations: success = 4000ms, error = 6000ms, warning = 5000ms, info = 4000ms. If toast has action button, add 4000ms.
- Max 3 visible toasts. When adding 4th, remove oldest.
- Dedup: if toast with identical title + message exists, reset its timer instead of adding duplicate.
- Provider renders fixed container: `fixed top-6 right-6 z-[9999] flex flex-col gap-2`. This ensures toasts render above modals (z-50).
- Export `ToastProvider` component that wraps children + renders toast container.

### Step 3: Create `src/hooks/useToast.ts`

```typescript
import { useContext } from "react";
import { ToastContext } from "../contexts/ToastContext";

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
```

### Step 4: Wire into App.tsx

```typescript
// Before:
const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

// After:
import { ToastProvider } from "./contexts/ToastContext";

const App: React.FC = () => (
  <AuthProvider>
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  </AuthProvider>
);
```

### Verification

1. Import `useToast` in any page temporarily. Call `addToast({ type: "success", title: "Test" })` on mount.
2. Confirm toast appears top-right, animates in, auto-dismisses after 4 seconds.
3. Trigger all 4 types. Confirm correct border colors and icons.
4. Trigger 4+ toasts rapidly. Confirm max 3 visible, oldest removed.
5. Click the X button. Confirm immediate dismissal.
6. Remove test code before proceeding.

---

## Fix 2: Button Component State Upgrade

**Tier:** CRITICAL | **Estimate:** 20 minutes | **Files:** 1 modified | **Risk:** Low (CSS only)

### Root Cause

Button missing active (pressed) state, no ring-offset on focus, disabled state uses `bg-gray-200` unconditionally.

### Implementation in `src/components/ui/Button.tsx`

**Add to base class string:**

```
"active:scale-[0.97] active:shadow-none"
"focus-visible:ring-offset-2"
"transition-all duration-150"  // upgrade from transition-colors
```

**Fix disabled state — replace:**

```
// Remove: disabled:bg-gray-200 disabled:text-gray-400 disabled:opacity-100
// Add: disabled:opacity-50 disabled:shadow-none
// Keep: disabled:pointer-events-none
```

### Verification

1. Tab through buttons with keyboard. Each shows focus ring with 2px offset.
2. Click and hold any primary button. Visually depresses (scale 0.97).
3. Disabled buttons show 50% opacity, not gray background.

---

## Fix 3: Wire Toasts to All Async Operations

**Tier:** CRITICAL | **Estimate:** 2-3 hours | **Files:** 8 modified | **Risk:** Low

### Pattern

Every async handler follows this template:

```typescript
const { addToast } = useToast();

const handleAction = async () => {
  try {
    setIsLoading(true);
    await someServiceCall();
    addToast({ type: "success", title: "Action completed", message: "Details" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    addToast({ type: "error", title: "Action failed", message: msg });
  } finally {
    setIsLoading(false);
  }
};
```

### Page-by-Page Toast Map

Add `const { addToast } = useToast();` to each component. Wrap each handler:

**A. CourseManager.tsx**

| Handler | Success Toast | Error Toast |
|---------|--------------|-------------|
| `handleSubmitCreate` | "Course created" + title | "Failed to create course" + err |
| `handleDeleteCourse` | "Course deleted" | "Failed to delete course" + err |
| `handleTogglePublish` | "{title} published/unpublished" | "Failed to update status" |

**B. CourseEditor.tsx**

| Handler | Success Toast | Error Toast |
|---------|--------------|-------------|
| `handleSaveMetadata` | "Changes saved" | "Failed to save changes" + err |
| `handleAddModule` | "Module added" | "Failed to create module" |
| `handleDeleteModule` | "Module deleted" | "Failed to delete module" |
| `handleTogglePublish` | Status-specific message | "Failed to update status" |

**C. ModuleBuilder.tsx**

Replace existing `showSaveSuccess` pattern with toast:

```typescript
// Remove: const [showSaveSuccess, setShowSaveSuccess] = useState(false);
// Remove: the setTimeout that clears showSaveSuccess
// In handleSave, replace setShowSaveSuccess(true) with:
addToast({ type: "success", title: "Module saved" });
// Add catch clause with error toast
```

**D. GradeManagement.tsx**

| Handler | Success Toast | Error Toast |
|---------|--------------|-------------|
| `handleApprove` | "Grade approved for {student}" | "Failed to approve grade" |
| `handleReject` | "Submission rejected" (type: warning) | "Failed to reject" |

**E. UserManagement.tsx**

| Handler | Success Toast | Error Toast |
|---------|--------------|-------------|
| `handleEnroll` | "{user} enrolled in {course}" | "Failed to enroll user" |

**F. RemediationQueue.tsx**

| Handler | Success Toast | Error Toast |
|---------|--------------|-------------|
| `handleApprove` | "Remediation approved" | "Failed to approve" |
| `handleDeny` | "Remediation denied" (warning) | "Failed to deny" |

**G. CourseCatalog.tsx** — After enrollment: `addToast({ type: "success", title: "Enrolled", message: "You are now enrolled in {title}" })`

**H. Invitations page** — After send: `addToast({ type: "success", title: "Invitation sent", message: "Invitation email queued for {email}" })`

### Verification

1. Perform every action listed above. Each MUST produce a visible toast.
2. Force an error (disconnect network). Confirm error toast appears.
3. No action completes silently (no toast = bug).

---

## Fix 4: Dead Button Fixes

**Tier:** CRITICAL | **Estimate:** 45 minutes | **Files:** 3 modified | **Risk:** Low

### 4A: UserManagement "+ Add Staff Member"

**File:** `src/pages/UserManagement.tsx`

Add `onNavigate` prop to UserManagement. In `App.tsx`, update the `/users` case:

```typescript
case "/users":
  return <UserManagement onNavigate={handleNavigate} />;
```

In UserManagement, add the prop and wire the button:

```typescript
interface UserManagementProps { onNavigate?: (path: string) => void; }

// Wire the button:
<Button onClick={() => onNavigate?.("/invitations")} className="gap-2">
  <UserPlus className="h-4 w-4" />
  Add Staff Member
</Button>
```

### 4B: MyGrades "Print Transcript"

**File:** `src/pages/MyGrades.tsx`

```typescript
<Button variant="outline" size="sm" className="gap-2"
  onClick={() => window.print()}>
  <Printer className="h-4 w-4" />
  Print Transcript
</Button>
```

Add print stylesheet to `src/index.css`:

```css
@media print {
  nav, aside, .sidebar, [data-sidebar] {
    display: none !important;
  }
  main { margin-left: 0 !important; }
  body { background: white !important; }
}
```

### 4C: MyGrades "Export PDF"

**File:** `src/pages/MyGrades.tsx`

```typescript
<Button variant="outline" size="sm" className="gap-2"
  onClick={() => addToast({
    type: "info",
    title: "Coming soon",
    message: "PDF export will be available with CE Credit Vault in Phase 4."
  })}>
  <Download className="h-4 w-4" />
  Export PDF
</Button>
```

### Verification

1. "+ Add Staff Member" navigates to /invitations page.
2. "Print Transcript" opens browser print dialog. Sidebar hidden in print preview.
3. "Export PDF" shows info toast, does not error.

---

## Fix 5: Block Settings Panel

**Tier:** HIGH | **Estimate:** 1.5 hours | **Files:** 1 new, 1 modified | **Risk:** Medium

### Root Cause

Every block in BlockEditor.tsx has a "Settings" button with no onClick handler.

### Step 1: Create `src/components/builder/BlockSettingsPanel.tsx`

```typescript
interface BlockSettingsPanelProps {
  block: Block;
  isOpen: boolean;
  onClose: () => void;
  onChange: (blockId: string, updates: Partial<Block>) => void;
}
```

**Settings per block type:**

| Block Type | Settings Fields |
|-----------|----------------|
| All blocks | Title/label override (optional text field) |
| quiz | Passing score (number, default 80), shuffle questions (toggle), show correct answers after submit (toggle) |
| image | Alt text (text), caption (text), max display width (full/medium/small select) |
| video | Autoplay (toggle, default off), show transcript (toggle) |
| text / heading | "No additional settings for this block type." |

**Visual design:**

- Renders as collapsible panel below block header, inside block card
- Background: `bg-gray-50`. Border-top: `border-gray-100`. Padding: `p-4`
- Slide-down animation with `transition-all duration-200` max-height and opacity
- Labels: `text-[10px] font-bold text-gray-400 uppercase tracking-wider`
- Changes call `onChange` immediately (no separate save — block is part of module dirty state)

### Step 2: Wire into BlockEditor.tsx

```typescript
const [showSettings, setShowSettings] = useState(false);

// Replace dead Settings button:
<button
  onClick={() => setShowSettings(!showSettings)}
  className={cn(
    "text-xs px-2 py-1 rounded transition-colors",
    showSettings
      ? "text-primary-600 bg-primary-50 font-medium"
      : "text-gray-400 hover:text-primary-600 hover:bg-gray-50"
  )}
>
  {showSettings ? "Close" : "Settings"}
</button>

// Render panel between header and content:
{showSettings && (
  <BlockSettingsPanel
    block={block}
    isOpen={showSettings}
    onClose={() => setShowSettings(false)}
    onChange={onChange}
  />
)}
```

### Ripple Effect

- `onChange` callback already exists — calls parent `updateBlock` which sets `isDirty`. No new save logic needed.
- Settings values stored in `block.data` alongside content. Quiz settings go into `QuizBlockData`. Ensure types accept optional settings fields.
- BlockRenderer (player-side) should eventually respect these settings. Store now, enforce later.

### Verification

1. Click "Settings" on Quiz block. Panel opens with passing score, shuffle, show answers.
2. Click "Settings" on Image block. Shows alt text and caption.
3. Click "Settings" on Text block. Shows "No additional settings."
4. Change a setting. "Unsaved" badge appears on ModuleBuilder header.
5. Save module. Reload. Settings persisted.

---

## Fix 6: CourseEditor Dirty-State Guard + Modal UX

**Tier:** HIGH | **Estimate:** 30 minutes | **Files:** 2 modified | **Risk:** None

### 6A: CourseEditor Back Navigation Guard

**File:** `src/pages/CourseEditor.tsx`

```typescript
const handleBack = () => {
  if (isDirty) {
    const confirmed = window.confirm(
      "You have unsaved changes. Are you sure you want to leave?"
    );
    if (!confirmed) return;
  }
  onBack();
};
```

Replace `onClick={onBack}` with `onClick={handleBack}` on the back arrow button.

### 6B: GradeManagement Review Modal UX

**File:** `src/pages/GradeManagement.tsx`

**Backdrop click:**

```typescript
<div className="fixed inset-0 bg-gray-900/50 ..."
  onClick={(e) => {
    if (e.target === e.currentTarget) setSelectedSubmission(null);
  }}
>
```

**Escape key:**

```typescript
useEffect(() => {
  if (!selectedSubmission) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") setSelectedSubmission(null);
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [selectedSubmission]);
```

### Verification

1. CourseEditor: edit field, click back → dialog appears. Cancel stays. OK navigates.
2. CourseEditor: save, click back → no dialog.
3. GradeManagement: open review modal, click backdrop → modal closes.
4. GradeManagement: open review modal, press Escape → modal closes.

---

## Fix 7: Card & Table Hover/Active/Focus States

**Tier:** HIGH | **Estimate:** 45 minutes | **Files:** 4 modified | **Risk:** None (CSS only)

### Standard Card Classes

Apply to every clickable card:

```
"cursor-pointer transition-all duration-200"
"hover:shadow-md hover:-translate-y-0.5"
"active:shadow-sm active:translate-y-0"
"focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none"
```

### Pages to Update

- **Dashboard.tsx:** Enrollment cards (active and completed). Add hover classes to card container divs.
- **CourseCatalog.tsx:** Course cards. Add hover classes to card container divs.
- **GradeManagement.tsx:** Table rows in review queue. Add `hover:bg-gray-50/50 cursor-pointer` to `<tr>`.
- **RemediationQueue.tsx:** Table rows. Add `hover:bg-gray-50/50` to `<tr>`.

### Also: Create `src/components/ui/Skeleton.tsx`

```typescript
import { cn } from "../../utils";

interface SkeletonProps { className?: string; }

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => (
  <div className={cn("animate-pulse bg-gray-200 rounded", className)} />
);
```

### Verification

1. Hover every card on Dashboard. Cards lift with shadow.
2. Click and hold card. Depresses back to baseline.
3. Hover table rows in GradeManagement. Background tints.

---

## Fix 8: SND Sound Integration

**Tier:** MEDIUM | **Estimate:** 1-1.5 hours | **Files:** 1 new, 2 modified | **Risk:** Low

### Step 1: Install

```bash
npm install snd-lib
```

### Step 2: Create `src/hooks/useAppSound.ts`

```typescript
import { useRef, useCallback } from "react";
import Snd from "snd-lib";

const SOUND_KEY = "hhcalms_sound_enabled";

export function useAppSound() {
  const sndRef = useRef<Snd | null>(null);
  const loadedRef = useRef(false);

  const ensureLoaded = useCallback(async () => {
    if (loadedRef.current) return sndRef.current;
    const snd = new Snd();
    await snd.load(Snd.KITS.SND01);
    sndRef.current = snd;
    loadedRef.current = true;
    return snd;
  }, []);

  const isEnabled = () => localStorage.getItem(SOUND_KEY) !== "false";

  const play = useCallback(async (sound: string) => {
    if (!isEnabled()) return;
    try {
      const snd = await ensureLoaded();
      snd?.play(sound);
    } catch { /* swallow audio errors */ }
  }, [ensureLoaded]);

  return {
    playSuccess: () => play(Snd.SOUNDS.CELEBRATION),
    playTap: () => play(Snd.SOUNDS.TAP),
    playButton: () => play(Snd.SOUNDS.BUTTON),
    playNotification: () => play(Snd.SOUNDS.NOTIFICATION),
    playCaution: () => play(Snd.SOUNDS.CAUTION),
    playError: () => play(Snd.SOUNDS.ALERT),
    toggleSound: () => {
      const next = !isEnabled();
      localStorage.setItem(SOUND_KEY, String(next));
      return next;
    },
    isSoundEnabled: isEnabled,
  };
}
```

### Step 3: Wire into ToastContext

In `ToastContext.tsx`, import `useAppSound`. Auto-play on toast:

```typescript
const { playSuccess, playCaution, playError, playNotification } = useAppSound();

// In addToast, after adding to state:
switch (toast.type) {
  case "success": playSuccess(); break;
  case "error": playError(); break;
  case "warning": playCaution(); break;
  case "info": playNotification(); break;
}
```

### Step 4: Add Sound Toggle to Sidebar

In `src/components/layout/Sidebar.tsx`:

```typescript
const { isSoundEnabled, toggleSound } = useAppSound();
const [soundOn, setSoundOn] = useState(isSoundEnabled());

// Render above logout:
<button onClick={() => setSoundOn(toggleSound())}
  className="flex items-center gap-2 px-4 py-2 text-xs ...">
  {soundOn ? <Volume2 /> : <VolumeX />}
  <span>{soundOn ? "Sound on" : "Sound off"}</span>
</button>
```

### SND Sound Map

| Action | SND Key | Notes |
|--------|---------|-------|
| Toast: success | `Snd.SOUNDS.CELEBRATION` | Ascending chime |
| Toast: error | `Snd.SOUNDS.ALERT` | Attention tone |
| Toast: warning | `Snd.SOUNDS.CAUTION` | Slightly negative |
| Toast: info | `Snd.SOUNDS.NOTIFICATION` | Neutral notification |

### Verification

1. Trigger success toast. Celebration chime plays.
2. Trigger error toast. Alert tone plays.
3. Click sound toggle in sidebar. Trigger toast. Silence.
4. Refresh. Sound preference persisted.
5. Test Chrome and Safari.

---

## Execution Order Summary

| # | Fix | Tier | Estimate | Dependency |
|---|-----|------|----------|------------|
| 1 | Toast System | CRITICAL | 1.5 hrs | None (foundation) |
| 2 | Button State Upgrade | CRITICAL | 20 min | None |
| 3 | Wire Toasts to All Actions | CRITICAL | 2-3 hrs | Requires Fix 1 |
| 4 | Dead Button Fixes | CRITICAL | 45 min | Requires Fix 1 |
| 5 | Block Settings Panel | HIGH | 1.5 hrs | None |
| 6 | Dirty-State + Modal UX | HIGH | 30 min | None |
| 7 | Card Hover/Active States | HIGH | 45 min | None |
| 8 | SND Sound Integration | MEDIUM | 1-1.5 hrs | Requires Fix 1 |

**Total: 8-10 focused hours across 6 new files and 12 modified files.**
