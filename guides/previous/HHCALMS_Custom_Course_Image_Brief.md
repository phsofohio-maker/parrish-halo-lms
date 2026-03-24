# HHCALMS — Custom Course Image Feature
## Claude Code Execution Brief

**Date:** March 24, 2026  
**Scope:** Preset Gallery Enhancement + Firebase Storage Upload  
**Effort:** 1.5–2 focused days  

---

## 1. Root Cause

Course cover images are set to `https://picsum.photos/400/200?random=${Math.random()}` at creation time. No mechanism exists for admins or instructors to select or upload a custom image. The `thumbnailUrl` field on the Course document already stores the URL — the data model is ready. The gap is purely UI + upload pipeline.

## 2. Complexity Budget

- **Tier A (Preset Gallery):** Zero infrastructure changes. Only new constants + UI component modifications. Already partially built — `CoverImagePicker.tsx` and `coverPresets.ts` exist.
- **Tier B (Custom Upload):** Adds Firebase Storage integration. Storage rules at `match /courses/{courseId}/{allPaths=**}` already authorize admin/instructor writes via `canAuthorContent()`. No Firestore schema changes. No security rule changes. No Cloud Function changes.
- **Single Source of Truth:** `course.thumbnailUrl` — all downstream consumers (CourseCatalog, CourseDetail, Dashboard) already read this field.

---

## 3. The Contract

### 3.1 CoverImagePicker Interface (Enhanced)

```typescript
// src/components/builder/CoverImagePicker.tsx
interface CoverImagePickerProps {
  selectedUrl: string;
  onSelect: (url: string) => void;
  suggestedCategory?: string;
  courseId?: string;        // Required for Tier B upload path
  enableUpload?: boolean;   // Toggle upload tab (default: true when courseId present)
}
```

### 3.2 Upload Service Contract

```typescript
// src/services/storageService.ts
export interface UploadResult {
  downloadUrl: string;
  storagePath: string;
}

export async function uploadCourseImage(
  courseId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult>

// Validates: JPEG/PNG only, max 2MB
// Uploads to: courses/{courseId}/cover.{ext}
// Returns: Firebase Storage download URL
```

### 3.3 Storage Rules (Already Exist — NO CHANGES)

```
match /courses/{courseId}/{allPaths=**} {
  allow read: if isAuthenticated();
  allow write: if canAuthorContent() && isAllowedContentType() && isUnderSizeLimit(100);
  allow delete: if canAuthorContent();
}
```

---

## 4. Execution Steps (Sequential — verify each before proceeding)

### Step 1: Create `src/services/storageService.ts` [NEW — Tier B]

**Purpose:** Encapsulate Firebase Storage upload logic for course cover images.

**Implementation:**
- Import `ref`, `uploadBytesResumable`, `getDownloadURL` from `firebase/storage` and the existing `storage` instance from `services/firebase.ts`
- Storage path: `courses/{courseId}/cover.{ext}` — deterministic path means re-uploads overwrite (no orphan cleanup)
- Extract extension from `file.type` (`image/jpeg` → `jpg`, `image/png` → `png`)
- Client-side validation before upload: JPEG/PNG only, max 2MB
- Throw typed errors: `InvalidFileTypeError`, `FileTooLargeError`
- `onProgress` callback receives 0–100 integer percentage
- Return `{ downloadUrl, storagePath }`

**Verify:** TypeScript compiles; exports match contract above.

### Step 2: Enhance `src/components/builder/CoverImagePicker.tsx` [MODIFY — Tier A+B]

**Current state:** Preset grid only, no tabs.

**Add:**
1. Two-tab header: **"Presets"** (existing grid) and **"Custom Upload"** (new)
2. Tab visibility: Upload tab only appears when `courseId` is provided AND `enableUpload !== false`
3. Upload tab contains:
   - Dashed drop zone with click-to-upload (hidden `<input type="file" accept="image/jpeg,image/png">`)
   - Client-side validation feedback: file type error, size error
   - Upload progress bar (reuse visual pattern from `ImageBlockEditor` in `BlockEditor.tsx`)
   - On success: call `onSelect(downloadUrl)` — parent handles persistence
   - Preview thumbnail with "Remove" button that calls `onSelect('')`
4. Tab switching does not lose state (selected preset persists if switching back)

**UI patterns (brand guide):**
- Tab header: `text-sm font-medium` with `border-b-2 border-primary-500` on active
- Drop zone: `border-2 border-dashed border-gray-300 rounded-lg bg-gray-50`
- Progress bar: `bg-primary-500 rounded-full` inside `bg-gray-200` track
- Error text: `text-sm text-red-600` with AlertTriangle icon
- No emojis. Lucide icons only (stroke-width 1.75).

**Verify:** Component renders both tabs; preset selection works; upload conditionally visible.

### Step 3: Verify `src/services/firebase.ts` exports `storage` [VERIFY — Tier B]

**Check:** `getStorage(app)` is called and `storage` is exported. BlockEditor already imports Firebase Storage for image block uploads — confirm this same export is available for `storageService.ts`.

**If missing:** Add alongside existing Firestore/Auth setup:
```typescript
import { getStorage } from 'firebase/storage';
export const storage = getStorage(app);
```

**Verify:** Import resolves; no runtime errors.

### Step 4: Update `src/pages/CourseManager.tsx` [MODIFY — Tier A]

**Change:** In the course creation modal, pass `enableUpload={false}` to `CoverImagePicker`. The `courseId` doesn't exist yet during creation, so upload is not available. Presets only.

**Verify:** Creation modal shows Presets tab only; no Upload tab visible.

### Step 5: Update `src/pages/CourseEditor.tsx` [MODIFY — Tier B]

**Change:** In the metadata panel, pass `courseId={courseId}` and `enableUpload={true}` to `CoverImagePicker`. The `onSelect` callback already updates `editThumbnail` state and persists via `updateCourse`. No new state management needed.

**Verify:** CourseEditor shows both tabs; upload triggers storageService; save persists URL.

### Step 6: Run Full Verification Checklist

See Section 6 below.

---

## 5. File Change Summary

| Action  | File                                           | Tier | Description                                              |
|---------|------------------------------------------------|------|----------------------------------------------------------|
| NEW     | `src/services/storageService.ts`               | B    | `uploadCourseImage()` with validation + progress         |
| MODIFY  | `src/components/builder/CoverImagePicker.tsx`   | A+B  | Add tabbed UI: Presets (existing) + Upload (new)         |
| MODIFY  | `src/pages/CourseEditor.tsx`                    | B    | Pass `courseId` and `enableUpload` to picker             |
| MODIFY  | `src/pages/CourseManager.tsx`                   | A    | Pass `enableUpload={false}` in creation modal            |
| VERIFY  | `src/services/firebase.ts`                      | B    | Confirm `storage` export exists                          |
| NONE    | `storage.rules`                                 | --   | Already authorizes admin/instructor image uploads        |
| NONE    | Firestore schema                                | --   | `thumbnailUrl` field already exists on Course doc        |

### Out-of-Scope Files (Do NOT Touch)

| File                          | Reason                                                |
|-------------------------------|-------------------------------------------------------|
| `src/pages/CourseCatalog.tsx` | Reads `thumbnailUrl` — auto-benefits from URL change  |
| `src/pages/CourseDetail.tsx`  | Reads `thumbnailUrl` — auto-benefits from URL change  |
| `src/pages/Dashboard.tsx`     | Reads `thumbnailUrl` — auto-benefits from URL change  |
| `src/pages/CoursePlayer.tsx`  | Does not display cover images                         |
| `src/pages/ModuleBuilder.tsx` | Block-level editor, not course-level                  |
| `firestore.rules`            | No Firestore schema changes                           |
| `functions/src/index.ts`     | No Cloud Function changes                             |

---

## 6. Ripple Effect Analysis

| Area                    | Impact                                                        | Risk |
|-------------------------|---------------------------------------------------------------|------|
| CourseCatalog.tsx       | Positive — shows actual selected images instead of picsum     | None |
| CourseDetail.tsx        | Positive — shows instructor-chosen cover                      | None |
| Dashboard cards         | Positive — consistent course branding                         | None |
| Firebase Storage quota  | Minimal — cover images max 2MB per course                     | None |
| Existing courses        | None — existing thumbnailUrl values continue to work          | None |
| Audit trail             | Positive — thumbnailUrl changes captured by existing updateCourse audit | None |
| Staff/learner views     | None — no permission changes, no UI changes                   | None |
| BlockEditor image upload| None — separate component, separate storage path              | None |
| Security rules          | None — existing canAuthorContent() covers the path            | None |

### Key Architectural Decisions

1. **Deterministic storage path:** `courses/{courseId}/cover.{ext}` — re-uploads overwrite. No orphan cleanup.
2. **2MB client limit (not 100MB):** Storage rules allow 100MB for course content. Cover images validated at 2MB client-side for catalog performance.
3. **Upload tab hidden during creation:** courseId doesn't exist until Firestore write. Presets-only in modal; upload available in CourseEditor.
4. **Service layer for uploads:** `storageService.ts` wraps Firebase Storage. CoverImagePicker does not import Firebase directly.

---

## 7. Verification Checklist

### Tier A — Preset Gallery
- [ ] Creation modal shows CoverImagePicker with preset grid (Presets tab only)
- [ ] Selecting a preset highlights with primary-500 ring
- [ ] Category-matched presets sort first
- [ ] Creating a course saves preset URL to `course.thumbnailUrl`
- [ ] CourseCatalog and Dashboard show selected preset image

### Tier B — Custom Upload
- [ ] CourseEditor shows both "Presets" and "Upload" tabs
- [ ] Upload tab shows dashed drop zone
- [ ] Selecting a .txt file shows file type error
- [ ] Selecting a 5MB PNG shows size error
- [ ] Valid 800KB JPEG shows progress bar 0→100%
- [ ] Upload complete → preview with Remove button
- [ ] Save Changes persists Firebase Storage URL
- [ ] CourseCatalog shows uploaded custom image
- [ ] Re-upload overwrites at same storage path
- [ ] Remove + save clears thumbnailUrl
- [ ] Switching tabs preserves state
- [ ] Staff users cannot access Upload tab

### Regression
- [ ] Existing courses with picsum URLs still display
- [ ] Image block upload in ModuleBuilder still works
- [ ] Course creation → CourseEditor → ModuleBuilder navigation loop intact
- [ ] No console errors on page transitions
- [ ] Audit log captures COURSE_UPDATE on thumbnailUrl change
