# Harmony Health LMS — Course Builder Pipeline Fixes

**Execution Brief for Claude Code**  
**Date:** March 16, 2026  
**Scope:** 8 targeted fixes to course builder pipeline  
**Estimated Effort:** 2–3 focused hours  
**Prerequisite:** 31/31 tests passing (current baseline)

---

## Context

A full pipeline audit of the course builder (CourseManager → CourseEditor → ModuleBuilder → Firestore save) identified 8 issues ranging from save-breaking Firestore errors to misleading UI elements. These fixes are ordered by severity: critical save failures first, then trust-breaking UX bugs, then completeness items.

**Guiding principle:** One change at a time. After each fix, verify the specific behavior changed. Do not batch multiple fixes into a single commit.

**Brand compliance:** All UI changes must use the existing design system — Inter font, clinical emerald palette, 8px grid, Lucide icons at stroke-width 1.75. No emojis. See `Harmony_Health_LMS_Brand_Guide.md` in project knowledge for full spec.

---

## Fix 1: `stripUndefined` Utility — Unblock All Saves

**Priority:** CRITICAL — this is a hard crash on save  
**Estimated time:** 30 minutes  
**Files touched:** `src/services/courseService.ts`

### Root Cause

`saveModuleBlocks` spreads block objects directly into `batch.set()`. Optional fields on block data interfaces (`QuizQuestion.explanation`, `QuizQuestion.matchingPairs`, `ImageBlockData.caption`, `ImageBlockData.altText`, `VideoBlockData.transcript`, `QuizBlockData.maxAttempts`) resolve to `undefined` at runtime when the instructor hasn't filled them in. Firestore rejects `undefined` values with a hard error:

```
Function WriteBatch.set() called with invalid data. Unsupported field value: undefined
```

The identical issue exists in `addBlock`, which uses `setDoc` with the same naïve spread pattern.

### Implementation

**Step 1:** Add the `stripUndefined` utility function inside `courseService.ts`, above the first function that uses it. This is an internal helper, not an export.

```typescript
/**
 * Recursively strips undefined values from an object before Firestore writes.
 * Firestore rejects undefined but treats missing fields identically to deleted ones,
 * so this is semantically safe.
 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [
        k,
        v && typeof v === 'object' && !Array.isArray(v)
          ? stripUndefined(v)
          : Array.isArray(v)
            ? v.map(item =>
                item && typeof item === 'object' && !Array.isArray(item)
                  ? stripUndefined(item)
                  : item
              )
            : v,
      ])
  ) as T;
}
```

**Step 2:** In `saveModuleBlocks`, wrap the `batch.set()` payload:

Find this code block inside the `blocks.forEach` loop:

```typescript
batch.set(blockRef, {
  ...block,
  moduleId,
  order: index,
  updatedAt: serverTimestamp(),
});
```

Replace with:

```typescript
batch.set(blockRef, stripUndefined({
  ...block,
  moduleId,
  order: index,
  updatedAt: serverTimestamp(),
}));
```

**Step 3:** In `addBlock`, wrap the `setDoc()` payload:

Find:

```typescript
await setDoc(blockRef, {
  ...block,
  moduleId,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
```

Replace with:

```typescript
await setDoc(blockRef, stripUndefined({
  ...block,
  moduleId,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
}));
```

### Ripple Effect

- **Downstream reads:** No impact. Firestore treats a missing field and a never-set field identically. All read code already uses optional chaining or defaults (`|| ''`, `?? 0`).
- **Existing saved data:** No impact. Documents already in Firestore were saved before these optional fields existed, so they already don't have them.
- **`serverTimestamp()` sentinel:** The `stripUndefined` function only removes entries where `v === undefined`. `serverTimestamp()` returns a `FieldValue` object, not `undefined`, so it passes through safely.
- **Nested arrays (e.g., `QuizQuestion[]` inside `QuizBlockData.questions`):** The recursive array handling strips `undefined` from each question object, handling `explanation: undefined` and `matchingPairs: undefined` correctly.

### Verification

1. Open ModuleBuilder for any course/module
2. Add a Quiz block → add a Multiple Choice question
3. Fill in the question text and options, but do NOT fill in the explanation field and do NOT mark a correct answer
4. Click Save
5. **Expected:** Save succeeds (no console error). Check Firestore console → the block document exists, and the `explanation` field is simply absent (not `null`, not empty string)
6. Add an Image block, leave caption and altText empty → Save → succeeds
7. Add a Video block, leave transcript empty → Save → succeeds

---

## Fix 2: Move ModuleBuilder to Full-Screen Routes

**Priority:** HIGH — visual inconsistency breaks navigation flow  
**Estimated time:** 15 minutes  
**Files touched:** `src/App.tsx`

### Root Cause

`CourseEditor` is rendered in the full-screen route section of `App.tsx` (returns early, no sidebar). But `ModuleBuilder` is rendered inside `renderPage()`, which wraps content in the sidebar layout. The navigation flow is:

```
CourseManager (sidebar) → CourseEditor (NO sidebar) → ModuleBuilder (sidebar again)
```

The sidebar appearing and disappearing mid-authoring-flow is disorienting.

### Implementation

**Step 1:** In `App.tsx`, move the `/builder` case OUT of the `renderPage()` switch statement and into the full-screen route section, right after the `/course-editor` block.

Find the full-screen `/course-editor` block (around line where `CourseEditor` is returned). After its closing, add:

```typescript
// Module Builder (full-screen, between CourseEditor and block editing)
if (currentPath === '/builder') {
  if (!routeContext.courseId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No course selected.</p>
          <Button onClick={() => setCurrentPath('/curriculum')}>
            Go to Curriculum Manager
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ModuleBuilder
      courseId={routeContext.courseId}
      moduleId={routeContext.moduleId}
      userUid={user.uid}
      onBack={() => {
        setCurrentPath('/course-editor');
        setRouteContext(prev => ({ ...prev, courseId: routeContext.courseId }));
      }}
    />
  );
}
```

**Step 2:** Remove the `/builder` case from inside `renderPage()`'s switch statement (the one that wraps content in `<Sidebar>` + `<main>`). Delete the entire `case '/builder':` block.

### Ripple Effect

- **Navigation flow:** Now consistent: CourseManager (sidebar) → CourseEditor (full-screen) → ModuleBuilder (full-screen). Back from ModuleBuilder returns to CourseEditor (full-screen).
- **`onBack` behavior:** The `onBack` handler now explicitly preserves `courseId` in `routeContext` when navigating back to `/course-editor`. This is critical — without it, CourseEditor would render the "No course selected" fallback because `setCurrentPath` alone doesn't guarantee `routeContext` persists. (The previous implementation relied on `routeContext` not being cleared, which worked by coincidence.)
- **Sidebar routes:** No impact. All sidebar-wrapped routes remain in `renderPage()`.
- **Direct URL access to `/builder`:** Same behavior as before — requires `routeContext.courseId` to be set, which only happens via in-app navigation. The new guard provides a graceful fallback instead of rendering ModuleBuilder with `courseId='default-course'`.

### Verification

1. Navigate: Curriculum Manager → click Edit Curriculum on any course → CourseEditor loads (no sidebar)
2. Click "Edit Content" on any module → ModuleBuilder loads (no sidebar — previously had sidebar)
3. Click back arrow in ModuleBuilder → returns to CourseEditor (no sidebar, same course)
4. Click back arrow in CourseEditor → returns to Curriculum Manager (sidebar reappears)
5. **The sidebar should only appear on the Curriculum Manager, never on CourseEditor or ModuleBuilder**

---

## Fix 3: Unsaved Changes Guard

**Priority:** HIGH — silent data loss  
**Estimated time:** 15 minutes  
**Files touched:** `src/pages/ModuleBuilder.tsx`

### Root Cause

`ModuleBuilder` tracks `isDirty` state and shows an "Unsaved" badge, but the back button fires `onBack()` unconditionally. If an instructor has unsaved work and clicks back, all changes are silently lost.

### Implementation

**Step 1:** In `ModuleBuilder.tsx`, create a guarded back handler:

```typescript
const handleBack = () => {
  if (isDirty) {
    const confirmed = window.confirm(
      'You have unsaved changes. Are you sure you want to leave? Your changes will be lost.'
    );
    if (!confirmed) return;
  }
  onBack();
};
```

**Step 2:** Replace both references to `onBack` in the JSX with `handleBack`:

1. The back arrow button in the header:

Find:
```tsx
<button
  onClick={onBack}
  className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
>
```

Replace `onClick={onBack}` with `onClick={handleBack}`.

2. The "Go Back" button in the error state:

Find:
```tsx
<Button onClick={onBack} variant="outline">
```

Leave this one as `onBack` — there's no dirty state in the error case since the module failed to load.

### Ripple Effect

- **Save-then-back flow:** No impact. After a successful save, `isDirty` is set to `false`, so the guard doesn't trigger.
- **Browser back/forward:** Not covered by this fix (would require `window.onbeforeunload`). This is acceptable for now since the app uses in-app routing, not browser history.
- **Error state back button:** Intentionally unchanged — if the module failed to load, there's nothing dirty to protect.

### Verification

1. Open a module in ModuleBuilder
2. Change the module title or add a block (the "Unsaved" badge should appear)
3. Click the back arrow → confirm dialog appears: "You have unsaved changes..."
4. Click Cancel → stays on ModuleBuilder, changes preserved
5. Click the back arrow again → click OK → navigates back, changes are gone (expected)
6. Open the same module again → Save → click back → NO confirm dialog (isDirty is false after save)

---

## Fix 4: Remove Fake Rich Text Toolbar

**Priority:** HIGH — trust-breaking  
**Estimated time:** 10 minutes  
**Files touched:** `src/components/builder/BlockEditor.tsx`

### Root Cause

`renderRichTextToolbar()` renders Bold, Italic, List, and Link buttons with hover states but zero `onClick` handlers. The underlying input is a plain `<textarea>`, so these formatting operations cannot work. For Miara (a non-developer instructor), buttons that look interactive but do nothing read as "this app is broken."

### Implementation

**Option chosen: Remove the toolbar entirely.** Wiring up real rich text editing (contentEditable + formatting commands, or a library like TipTap/ProseMirror) is a multi-day effort that is not on the critical path. An honest textarea is better than a lying toolbar.

**Step 1:** In `BlockEditor.tsx`, find the `renderRichTextToolbar` function and delete the entire function definition:

```typescript
// DELETE this entire function
const renderRichTextToolbar = () => (
  <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 rounded-t-md">
    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Bold"><Bold className="h-4 w-4" /></button>
    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Italic"><Italic className="h-4 w-4" /></button>
    <div className="w-px h-4 bg-gray-300 mx-1"></div>
    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="List"><List className="h-4 w-4" /></button>
    <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Link"><LinkIcon className="h-4 w-4" /></button>
  </div>
);
```

**Step 2:** In the `text` case of `renderContent()`, remove the call to `{renderRichTextToolbar()}` inside the text editor container. The `<textarea>` should now be the direct child of the bordered container div.

Find the `<div>` wrapping the toolbar and textarea — it has the `cn(...)` className with border variants. Remove the `{renderRichTextToolbar()}` call from inside this div, so only the `<textarea>` remains. Update the textarea's className to add `rounded-md` (instead of `rounded-b-md`) since there's no toolbar above it anymore.

**Step 3:** Clean up unused imports. Remove `Bold`, `Italic`, `List`, and `LinkIcon` from the lucide-react import if they're no longer used elsewhere in the file. (Check first — `List` may be used elsewhere.)

### Ripple Effect

- **Saved content:** No impact. The toolbar was cosmetic — content was always stored as plain text in Firestore. No formatting data existed to lose.
- **CoursePlayer rendering:** No impact. `BlockRenderer.tsx` renders text blocks using `whitespace-pre-wrap`, which preserves line breaks from the textarea. No rich text parsing exists downstream.
- **Future rich text support:** When you're ready to add real formatting, you'll replace the textarea with a proper editor component. The toolbar removal now doesn't create any debt — it removes it.

### Verification

1. Open ModuleBuilder, look at any Text block
2. The Bold/Italic/List/Link toolbar should be gone
3. The textarea should still work normally — type, line breaks, content saves correctly
4. Callout variants (Info, Warning, Critical) still display and switch correctly

---

## Fix 5: Normalize Video URL in Preview

**Priority:** MEDIUM — broken preview until blur event  
**Estimated time:** 5 minutes  
**Files touched:** `src/components/builder/BlockEditor.tsx`

### Root Cause

The video block editor shows an iframe preview using `vidData.url` as-is. YouTube URL normalization only fires `onBlur`. So pasting `https://www.youtube.com/watch?v=abc` shows a broken iframe until the instructor clicks elsewhere. The normalization function is already implemented and correct — it just isn't applied at the right time.

### Implementation

In `BlockEditor.tsx`, in the `video` case of `renderContent()`, find the iframe element:

```tsx
<iframe src={vidData.url} className="w-full h-full" allowFullScreen />
```

Replace with:

```tsx
<iframe src={normalizeYouTubeUrl(vidData.url)} className="w-full h-full" allowFullScreen />
```

This ensures the preview always uses the normalized embed URL, regardless of whether `onBlur` has fired yet. The `onBlur` handler should remain — it still writes the normalized value back to the block data so the saved URL is always in embed format.

### Ripple Effect

- **Saved data:** No impact. The `onBlur` handler still normalizes and persists the embed URL to block data. This fix only affects the live preview.
- **Non-YouTube URLs:** No impact. `normalizeYouTubeUrl` passes through non-YouTube URLs unchanged.
- **BlockRenderer (player):** Already has its own `normalizeYouTubeUrl` call on the iframe src. No change needed there.

### Verification

1. Open ModuleBuilder, add a Video block
2. Paste `https://www.youtube.com/watch?v=dQw4w9WgXcQ` into the URL field
3. **Without clicking elsewhere**, look at the preview → the iframe should load the video correctly
4. Paste `https://youtu.be/dQw4w9WgXcQ` → preview works immediately
5. Paste a non-YouTube embed URL (e.g., a Vimeo embed) → passes through unchanged

---

## Fix 6: Add Block Reorder Buttons

**Priority:** MEDIUM — blocks stuck in creation order  
**Estimated time:** 30 minutes  
**Files touched:** `src/pages/ModuleBuilder.tsx`, `src/components/builder/BlockEditor.tsx`

### Root Cause

`useModule` exposes a `reorderBlocks(fromIndex, toIndex)` function, and the block shell has a `GripVertical` drag handle icon — but no drag-and-drop library is installed, and the grip icon has no event handler. Blocks are permanently stuck in the order they were added.

Full drag-and-drop is a nice-to-have. The simplest reliable solution is up/down arrow buttons on each block.

### Implementation

**Step 1:** In `ModuleBuilder.tsx`, destructure `reorderBlocks` from `useModule` (it's returned by the hook but not currently destructured):

Find:
```typescript
const {
  module,
  isLoading,
  isSaving,
  error,
  isDirty,
  addBlock,
  updateBlock,
  deleteBlock,
  updateModuleMetadata,
  save,
} = useModule({ courseId, moduleId });
```

Add `reorderBlocks` to the destructure:
```typescript
const {
  module,
  isLoading,
  isSaving,
  error,
  isDirty,
  addBlock,
  updateBlock,
  deleteBlock,
  reorderBlocks,
  updateModuleMetadata,
  save,
} = useModule({ courseId, moduleId });
```

**Step 2:** Update the `BlockEditor` component interface to accept reorder callbacks.

In `BlockEditor.tsx`, update the `BlockEditorProps` interface:

```typescript
interface BlockEditorProps {
  block: ContentBlock;
  onChange: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}
```

Update the component destructure:
```typescript
export const BlockEditor: React.FC<BlockEditorProps> = ({
  block, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast
}) => {
```

**Step 3:** In `BlockEditor.tsx`, replace the cosmetic drag handle with functional up/down buttons. Find the grip icon in the block header:

```tsx
<div className="cursor-move p-1 hover:bg-gray-100 rounded text-gray-300 hover:text-gray-500">
  <GripVertical className="h-4 w-4" />
</div>
```

Replace with:

```tsx
<div className="flex flex-col gap-0.5">
  <button
    onClick={onMoveUp}
    disabled={isFirst}
    className={cn(
      "p-0.5 rounded transition-colors",
      isFirst
        ? "text-gray-200 cursor-not-allowed"
        : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
    )}
    title="Move up"
  >
    <ChevronUp className="h-3 w-3" />
  </button>
  <button
    onClick={onMoveDown}
    disabled={isLast}
    className={cn(
      "p-0.5 rounded transition-colors",
      isLast
        ? "text-gray-200 cursor-not-allowed"
        : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
    )}
    title="Move down"
  >
    <ChevronDown className="h-3 w-3" />
  </button>
</div>
```

**Step 4:** Add `ChevronUp` and `ChevronDown` to the lucide-react imports in `BlockEditor.tsx` if not already imported. Remove `GripVertical` if no longer used.

**Step 5:** In `ModuleBuilder.tsx`, pass the reorder callbacks when rendering `BlockEditor`:

Find:
```tsx
module.blocks.map((block) => (
  <BlockEditor
    key={block.id}
    block={block}
    onChange={updateBlock}
    onDelete={deleteBlock}
  />
))
```

Replace with:
```tsx
module.blocks.map((block, index) => (
  <BlockEditor
    key={block.id}
    block={block}
    onChange={updateBlock}
    onDelete={deleteBlock}
    onMoveUp={() => reorderBlocks(index, index - 1)}
    onMoveDown={() => reorderBlocks(index, index + 1)}
    isFirst={index === 0}
    isLast={index === module.blocks.length - 1}
  />
))
```

### Ripple Effect

- **`reorderBlocks` in `useModule`:** Already implemented and tested — it splices the block array and reassigns `order` values. No changes needed to the hook.
- **Save behavior:** Reordering sets `isDirty = true` (via the `useEffect` that compares `JSON.stringify(module)` to `originalRef.current`). The save button will write the new order to Firestore.
- **CoursePlayer:** Reads blocks ordered by the `order` field, which `saveModuleBlocks` sets from the array index. Reordered blocks will play in the new order after save.
- **Existing `onMoveUp`/`onMoveDown` optional props:** Since they're optional (`?`), existing usages of `BlockEditor` that don't pass them (if any) won't break — the buttons just won't render click handlers. But in practice, `BlockEditor` is only used in `ModuleBuilder.tsx`.

### Verification

1. Open a module with 3+ blocks
2. First block should have up arrow disabled (grayed out), down arrow active
3. Last block should have down arrow disabled, up arrow active
4. Click down on block 1 → it swaps with block 2. "Unsaved" badge appears.
5. Click up on what is now block 2 (the original block 1) → it returns to position 1
6. Save → reload the module → block order is persisted correctly

---

## Fix 7: Add Module Description Field

**Priority:** LOW — completeness  
**Estimated time:** 10 minutes  
**Files touched:** `src/pages/ModuleBuilder.tsx`

### Root Cause

The Module Settings card in ModuleBuilder has Title, Passing Score, and Duration — but no Description field. The `Module` type has a `description: string` field, `updateModuleMetadata` accepts it, and `CoursePlayer` could display it. Instructors have no way to describe what a module covers.

### Implementation

In `ModuleBuilder.tsx`, find the Module Settings `<div>` with the grid layout:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
```

After the Title input `<div>` and before the passing-score/duration flex `<div>`, add:

```tsx
<div className="md:col-span-2">
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Description
  </label>
  <textarea
    value={module.description || ''}
    onChange={(e) => updateModuleMetadata({ description: e.target.value })}
    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-gray-900 bg-white text-sm resize-y"
    placeholder="Brief description of what this module covers..."
    rows={2}
  />
</div>
```

The `md:col-span-2` ensures it stretches the full width of the grid on medium+ screens, sitting between the title and the score/duration row.

### Ripple Effect

- **`updateModuleMetadata` in `useModule`:** Already accepts `Partial<Module>`, which includes `description`. No hook changes needed.
- **Save flow:** `useModule.save()` already passes `description` to `updateModule()` in courseService. It's included in the existing `updateModule` call.
- **CoursePlayer:** The `moduleData` includes `description` but doesn't currently display it. A future enhancement could show it as a module intro. No breaking change.
- **CourseEditor module list:** Already reads module data but doesn't display description. Consistent behavior.

### Verification

1. Open a module in ModuleBuilder
2. The Description textarea appears between Title and Passing Score
3. Type a description → "Unsaved" badge appears
4. Save → reload → description persists
5. Check Firestore → module document has `description` field with correct value

---

## Fix 8: Remove `courseId` Default Fallback

**Priority:** LOW — defense against silent misrouting  
**Estimated time:** 5 minutes  
**Files touched:** `src/pages/ModuleBuilder.tsx`

### Root Cause

ModuleBuilder's prop destructure has `courseId = 'default-course'` as a default. If routing fails to pass `courseId`, the builder silently writes blocks to a phantom Firestore document path (`courses/default-course/modules/...`) instead of failing visibly. This is a pit-of-failure design — the wrong thing happens silently.

### Implementation

**Step 1:** In `ModuleBuilder.tsx`, change the prop interface to make `courseId` required:

Find:
```typescript
interface ModuleBuilderProps {
  courseId?: string;
  moduleId?: string;
  userUid: string;
  onBack: () => void;
}
```

Replace with:
```typescript
interface ModuleBuilderProps {
  courseId: string;
  moduleId?: string;
  userUid: string;
  onBack: () => void;
}
```

**Step 2:** Remove the default value from the destructure:

Find:
```typescript
export const ModuleBuilder: React.FC<ModuleBuilderProps> = ({
  courseId = 'default-course', // Fallback for demo
  moduleId,
  userUid,
  onBack,
}) => {
```

Replace with:
```typescript
export const ModuleBuilder: React.FC<ModuleBuilderProps> = ({
  courseId,
  moduleId,
  userUid,
  onBack,
}) => {
```

**Step 3:** Since Fix 2 already moved ModuleBuilder to the full-screen route section with a `courseId` guard, the App.tsx route will show an error state if `courseId` is missing — so the component itself doesn't need its own missing-courseId guard. The TypeScript compiler will now flag any caller that doesn't pass `courseId` as a type error.

### Ripple Effect

- **App.tsx caller:** Already passes `routeContext.courseId` which is guarded by a conditional check above the render. No change needed.
- **TypeScript compilation:** If any other file renders `<ModuleBuilder>` without `courseId`, the compiler will now error. This is the desired behavior — fail at build time, not at runtime in a phantom Firestore path.

### Verification

1. TypeScript compiles without errors (no callers omitting `courseId`)
2. Navigate to ModuleBuilder normally → works as before
3. (Manual test) Temporarily remove `courseId` from the App.tsx render → TypeScript shows a compile error

---

## Execution Sequence Summary

Execute in this exact order. Each fix is independently verifiable.

| # | Fix | Time | Files | Verification Signal |
|---|-----|------|-------|-------------------|
| 1 | `stripUndefined` utility | 30 min | `courseService.ts` | Quiz with empty explanation saves without crash |
| 2 | ModuleBuilder → full-screen route | 15 min | `App.tsx` | No sidebar flash during authoring flow |
| 3 | Unsaved changes guard | 15 min | `ModuleBuilder.tsx` | Confirm dialog on dirty back-navigation |
| 4 | Remove fake rich text toolbar | 10 min | `BlockEditor.tsx` | No formatting buttons above text blocks |
| 5 | Normalize video URL in preview | 5 min | `BlockEditor.tsx` | YouTube preview works without clicking away |
| 6 | Block reorder buttons | 30 min | `ModuleBuilder.tsx`, `BlockEditor.tsx` | Up/down arrows move blocks, order persists |
| 7 | Module description field | 10 min | `ModuleBuilder.tsx` | Description textarea visible and saves |
| 8 | Remove courseId default | 5 min | `ModuleBuilder.tsx` | TypeScript enforces required prop |

**Total estimated time: ~2 hours of focused implementation**

---

## Global Ripple Effect Analysis

| System Area | Impact | Risk |
|-------------|--------|------|
| **Firestore schema** | None — no schema changes, only write sanitization | None |
| **Security rules** | None — no permission model changes | None |
| **CoursePlayer (staff view)** | None — reads same data, block order respected | None |
| **CourseCatalog / CourseDetail** | None — course-level data untouched | None |
| **GradeManagement / grading pipeline** | None — grading reads block data, doesn't write it | None |
| **Audit trail** | None — all write paths already use audited service functions | None |
| **Existing seed data** | None — existing courses load and save normally | None |
| **Test suite (31/31)** | Should remain passing — no architectural changes | None |

---

## Post-Fix Validation Checklist

After all 8 fixes are applied, run this end-to-end walkthrough:

1. **Create a new course** via CourseManager modal → lands on CourseEditor (full-screen, no sidebar)
2. **Add 3 modules** from CourseEditor with different weights
3. **Click "Edit Content"** on Module 2 → ModuleBuilder loads (full-screen, no sidebar)
4. **Add blocks:** Heading, Text, Image (leave caption empty), Video (paste YouTube watch URL), Quiz (add question, leave explanation empty)
5. **Reorder:** Move the Quiz block up above the Video block using arrows
6. **Verify video preview** shows the embedded YouTube player without clicking away from the URL field
7. **Verify no formatting toolbar** on the Text block
8. **Verify description field** exists in Module Settings, type something
9. **Click Save** → succeeds (no Firestore undefined error)
10. **Click back** → returns to CourseEditor (no sidebar flash)
11. **Click "Edit Content"** on Module 2 again → all blocks are in the reordered sequence, description persists
12. **Make a change, then click back without saving** → confirm dialog appears
13. **Cancel** → stays on builder. **Retry back → OK** → returns to CourseEditor

If all 13 steps pass, the course builder pipeline is functionally solid for Miara's use.
