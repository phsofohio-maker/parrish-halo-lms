# Harmony Health LMS — Course Builder UX Execution Plan

**Prepared for:** Claude Code Execution  
**Date:** March 12, 2026  
**Scope:** Course authoring clarity + custom cover images  
**Estimated Effort:** 2–3 focused days  

---

## Diagnosis: Root Causes

### Problem 1 — "Creating a course and creating a module feel the same"

The current `handleCreateCourse` in `CourseManager.tsx` does three things in one click with zero instructor input:

1. Creates a Firestore course doc with **hardcoded defaults** (`title: 'New Clinical Course'`, `category: 'clinical_skills'`, `ceCredits: 1.0`, random picsum thumbnail)
2. Auto-creates `Module 1: Getting Started` as a subcollection document
3. Immediately navigates to the **ModuleBuilder** for that module

The instructor never sees a course-level form. They go from a table of courses straight into a single-module block editor with no visual hierarchy distinguishing "I'm building a course" from "I'm editing a module." The course metadata (title, description, category, credits) can only be edited inline in the table row afterward, which is easy to miss entirely.

### Problem 2 — "Modules aren't easily nestable in courses via the UI"

The `ModuleBuilder` page (`ModuleBuilder.tsx`) is completely isolated from the course context:

- **No module sidebar/list:** The builder shows one module at a time. There is no panel listing all modules in the course, no way to navigate between them, and no way to add a second module.
- **No course-level editor exists:** `handleEditCurriculum` fetches the first module and navigates directly to it. There is no intermediate "course structure" view.
- **Back button returns to CourseManager (the table),** not to a course overview.
- Module reordering, weight assignment, and critical-flag toggling require editing each module individually — there's no birds-eye view.

### Problem 3 — Cover images are auto-generated and not customizable

`thumbnailUrl` is set to `https://picsum.photos/400/200?random=${Math.random()}` at creation time. No upload mechanism exists anywhere in the authoring flow. The only way to change it would be a direct Firestore edit.

---

## The Plan: Three Surgical Changes

The fix is a single new page — **CourseEditor** — inserted between CourseManager and ModuleBuilder. This page becomes the "course-level" authoring view where instructors see the full structure and manage modules. It also houses the cover image customization.

### Change 1: Course Creation Modal (replaces instant-create)

**What changes:** `CourseManager.tsx` → `handleCreateCourse`

**Current behavior:** Clicking "Create New Course" instantly creates a course + module with defaults and navigates away.

**New behavior:** Clicking "Create New Course" opens a modal form that collects:

- Course title (required, text input)
- Description (textarea)
- Category (select dropdown — existing categories: `clinical_skills`, `compliance`, `patient_care`, `safety`, `onboarding`, etc.)
- CE Credits (number input, default 1.0)
- Cover image (optional — see Change 3)

On submit, create the course doc in Firestore (via existing `createCourse` service), then navigate to the **new CourseEditor page** (Change 2) — NOT to ModuleBuilder. Do NOT auto-create a module. The instructor will add modules intentionally from the CourseEditor.

**Files touched:**
- `src/pages/CourseManager.tsx` — replace `handleCreateCourse` body, add modal state + JSX
- No new services needed — `createCourse` from `courseService.ts` already accepts all these fields

**Implementation details:**

```typescript
// New state in CourseManager
const [showCreateModal, setShowCreateModal] = useState(false);
const [newCourse, setNewCourse] = useState({
  title: '',
  description: '',
  category: 'clinical_skills',
  ceCredits: 1.0,
  thumbnailUrl: '',
});

// handleCreateCourse becomes:
const handleCreateCourse = () => setShowCreateModal(true);

// New handleSubmitCreate:
const handleSubmitCreate = async () => {
  if (!user || isCreating || !newCourse.title.trim()) return;
  setIsCreating(true);
  try {
    const courseId = await createCourse(
      {
        ...newCourse,
        status: 'draft',
        estimatedHours: 0,
        thumbnailUrl: newCourse.thumbnailUrl || '',
      },
      user.uid,
      user.displayName
    );
    setShowCreateModal(false);
    onNavigate('/course-editor', { courseId });
  } catch (err) {
    console.error('Failed to create course:', err);
  } finally {
    setIsCreating(false);
  }
};
```

**Modal UI spec (brand-compliant):**
- White card, `max-w-lg`, centered over `bg-gray-900/50 backdrop-blur-sm` overlay
- Title input: full-width, autofocus
- Description: textarea, 3 rows
- Category: `<select>` with existing categories
- CE Credits: number input with 0.5 step
- Cover image section: see Change 3
- Footer: Cancel (outline) + Create Course (primary)
- All inputs use existing Tailwind patterns from the codebase: `border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500`

---

### Change 2: CourseEditor Page (new — the missing middle layer)

**What it is:** A full-page course structure editor that sits between CourseManager and ModuleBuilder. This is the "pit of success" — the instructor sees the course as a whole and manages modules from here.

**Route:** `/course-editor` with `routeContext.courseId`

**Layout (top to bottom):**

#### A. Header Bar
- Back arrow → returns to CourseManager (`/manager`)
- Course title (editable inline or via edit icon)
- Status badge (Draft/Published)
- Save button + Publish/Unpublish toggle

#### B. Course Metadata Panel (collapsible card)
- Title, description, category, CE credits — all editable
- Cover image with change/upload control (Change 3)
- Uses existing `updateCourse` service for persistence
- "Save Changes" button with dirty-state tracking

#### C. Module List Panel (the core value)
This is what makes the hierarchy clear. It visually communicates: "A course contains modules. You are looking at the course. Click a module to edit its content."

- **Header:** "Course Modules" with "Add Module" button
- **Each module row** displays:
  - Drag handle (for reorder — future, can be arrows initially)
  - Order number (1, 2, 3...)
  - Module title (editable inline)
  - Weight badge (e.g., "40%")
  - Critical flag (shield icon, toggleable)
  - Passing score
  - Block count (e.g., "5 blocks")
  - Status indicator (draft/published)
  - Actions: **Edit Content** (→ ModuleBuilder), **Delete**
- **"Add Module" button** at the bottom of the list:
  - Opens an inline form or small modal: title, weight, isCritical, passingScore, estimatedMinutes
  - Calls `createModule` from `courseService.ts`
  - Auto-assigns `order` as `modules.length`
- **Weight validation:** Show a running total of all module weights. Warn (amber) if total ≠ 100%. This prevents a common configuration error.
- **Empty state:** "This course has no modules yet. Add your first module to start building content." with prominent Add Module button.

#### D. Navigation Flow

```
CourseManager (table)
  → [Create New Course] → Modal → CourseEditor (new)
  → [Edit Curriculum]   → CourseEditor (new)
  
CourseEditor (structure view)
  → [Edit Content on Module X] → ModuleBuilder (existing, unchanged)
  → [Back] → CourseManager
  
ModuleBuilder (block editor)
  → [Back] → CourseEditor (NOT CourseManager)
```

**Files to create:**
- `src/pages/CourseEditor.tsx` — the new page

**Files to modify:**
- `src/App.tsx` — add route for `/course-editor`, pass `courseId` from routeContext
- `src/pages/CourseManager.tsx` — change "Edit Curriculum" to navigate to `/course-editor` instead of `/builder`
- `src/pages/ModuleBuilder.tsx` — change `onBack` to navigate to `/course-editor` with courseId instead of CourseManager

**Data fetching:**
- Course: `getCourse(courseId)` from `courseService.ts`
- Modules: `getModules(courseId)` from `courseService.ts` (already fetches ordered by `order`)
- Both wrapped in a custom hook or inline `useEffect`

**Key implementation patterns (from existing codebase):**

```typescript
interface CourseEditorProps {
  courseId: string;
  onNavigate: (path: string, context?: Record<string, any>) => void;
  onBack: () => void;
}

export const CourseEditor: React.FC<CourseEditorProps> = ({
  courseId,
  onNavigate,
  onBack,
}) => {
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // ... standard loading/error/dirty states

  // Fetch course + modules on mount
  useEffect(() => {
    const load = async () => {
      const [courseData, moduleData] = await Promise.all([
        getCourse(courseId),
        getModules(courseId),
      ]);
      setCourse(courseData);
      setModules(moduleData);
      setIsLoading(false);
    };
    load();
  }, [courseId]);

  // Navigate to module builder
  const handleEditModule = (moduleId: string) => {
    onNavigate('/builder', { courseId, moduleId });
  };

  // Add new module
  const handleAddModule = async (moduleData: Partial<Module>) => {
    if (!user) return;
    const newId = await createModule(
      courseId,
      {
        title: moduleData.title || `Module ${modules.length + 1}`,
        description: moduleData.description || '',
        status: 'draft',
        passingScore: moduleData.passingScore || 80,
        estimatedMinutes: moduleData.estimatedMinutes || 15,
        order: modules.length,
        weight: moduleData.weight || 0,
        isCritical: moduleData.isCritical || false,
      },
      user.uid,
      user.displayName
    );
    // Refetch modules
    const updated = await getModules(courseId);
    setModules(updated);
  };

  // ... render
};
```

**UI patterns to follow (from brand guide):**
- White cards with `border border-gray-200 shadow-sm`
- Section headers: `text-sm font-bold text-gray-400 uppercase tracking-wider`
- Lucide icons only (stroke-width 1.75), gray on white surfaces, never black
- Inter font, clinical emerald accent scale
- No gradients, no decorative borders, no colored container backgrounds

---

### Change 3: Custom Cover Images

**Strategy:** Two tiers — a preset gallery (ship immediately) and file upload (requires Firebase Storage integration).

#### Tier A: Preset Cover Gallery (ship now)

Replace the random picsum URL with an intentional selection. Provide 8–12 preset cover images organized by course category. These can be hosted as static assets in the project's `public/` directory or as curated, stable URLs.

**Preset approach (recommended for speed):**
- Create a `COVER_PRESETS` constant mapping categories to themed gradient/pattern covers
- Use inline SVG data URIs or a set of static images in `public/covers/`
- Alternatively, use stable Unsplash URLs with category-relevant healthcare/clinical images

```typescript
// src/constants/coverPresets.ts
export const COVER_PRESETS = [
  { id: 'clinical-1', label: 'Clinical Blue', url: '/covers/clinical-blue.svg', category: 'clinical_skills' },
  { id: 'compliance-1', label: 'Compliance Green', url: '/covers/compliance-green.svg', category: 'compliance' },
  { id: 'safety-1', label: 'Safety Amber', url: '/covers/safety-amber.svg', category: 'safety' },
  { id: 'patient-1', label: 'Patient Care', url: '/covers/patient-care.svg', category: 'patient_care' },
  { id: 'onboarding-1', label: 'Onboarding', url: '/covers/onboarding.svg', category: 'onboarding' },
  // ... 2-3 generic/neutral options
  { id: 'abstract-1', label: 'Abstract Teal', url: '/covers/abstract-teal.svg' },
  { id: 'abstract-2', label: 'Abstract Emerald', url: '/covers/abstract-emerald.svg' },
  { id: 'minimal-1', label: 'Minimal White', url: '/covers/minimal-white.svg' },
];
```

**Where it appears:**
1. **Course creation modal** (Change 1) — grid of clickable thumbnails below the form fields. One is auto-selected based on the chosen category. Instructor can click a different one.
2. **CourseEditor metadata panel** (Change 2) — current cover image shown with a "Change Cover" button that opens the same selection grid.

**Cover image UI component:**

```typescript
// src/components/builder/CoverImagePicker.tsx
interface CoverImagePickerProps {
  selectedUrl: string;
  onSelect: (url: string) => void;
  suggestedCategory?: string;
}
```

- Renders a grid of preset thumbnails (4 columns, rounded corners, ring highlight on selected)
- Category-matched presets appear first
- Clicking updates `selectedUrl` — parent persists via `updateCourse`

#### Tier B: File Upload (follow-up — requires Firebase Storage)

After the preset gallery ships, add a "Upload custom image" option that:
1. Accepts JPEG/PNG, max 2MB
2. Uploads to Firebase Storage at `courses/{courseId}/cover.{ext}`
3. Gets the download URL and saves it to `course.thumbnailUrl`
4. Shows upload progress indicator

This requires Firebase Storage rules for the `courses/` path, which is a configuration addition — not a code architecture change. The upload component can be built into the existing `CoverImagePicker` as an additional tab or "Custom" option.

**Do NOT block shipping on Tier B.** The presets solve the immediate problem. Upload can follow.

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/CourseEditor.tsx` | **CREATE** | New page — course structure editor with module list |
| `src/components/builder/CoverImagePicker.tsx` | **CREATE** | Reusable cover image selection grid |
| `src/constants/coverPresets.ts` | **CREATE** | Preset cover image definitions |
| `public/covers/*.svg` | **CREATE** | 8–12 static SVG cover images (generated programmatically) |
| `src/pages/CourseManager.tsx` | **MODIFY** | Add creation modal, change Edit Curriculum nav target |
| `src/pages/ModuleBuilder.tsx` | **MODIFY** | Change onBack to navigate to CourseEditor |
| `src/App.tsx` | **MODIFY** | Add `/course-editor` route |

---

## Execution Order (for Claude Code)

Follow the evidence-based iteration principle — build, verify, confirm before proceeding.

### Step 1: Cover Image Presets (low risk, no dependencies)
1. Create `src/constants/coverPresets.ts`
2. Generate SVG cover images (inline or as static files) — abstract patterns using brand palette colors
3. Create `src/components/builder/CoverImagePicker.tsx`
4. **Verify:** Component renders, selection works, preview displays

### Step 2: CourseEditor Page (the structural fix)
1. Create `src/pages/CourseEditor.tsx` with:
   - Course metadata display/edit panel
   - Module list with full CRUD
   - Weight total validation
   - Cover image picker integrated
   - Navigation to ModuleBuilder per-module
2. **Verify:** Page loads with a known courseId, displays course data, modules render in order

### Step 3: Wire Up Navigation (integration)
1. Modify `src/App.tsx` — add `/course-editor` route
2. Modify `src/pages/CourseManager.tsx`:
   - Add creation modal (replace instant-create)
   - Change "Edit Curriculum" → navigate to `/course-editor`
3. Modify `src/pages/ModuleBuilder.tsx`:
   - Change `onBack` to navigate to `/course-editor` with courseId
4. **Verify:** Full navigation loop works:
   - CourseManager → Create Modal → CourseEditor → Add Module → Edit Module (Builder) → Back to CourseEditor → Back to CourseManager

### Step 4: Polish & Edge Cases
1. Empty states (no modules yet, no cover selected)
2. Unsaved changes warning on CourseEditor navigation
3. Module delete confirmation modal
4. Weight total ≠ 100% warning
5. Ensure audit logging on all new write operations
6. **Verify:** End-to-end course creation walkthrough with no console errors

---

## Ripple Effect Analysis

| Area | Impact | Risk |
|------|--------|------|
| **CourseDetail.tsx** (staff view) | None — reads from same Firestore data, unchanged | None |
| **CourseCatalog.tsx** (staff view) | None — reads published courses, unchanged | None |
| **CoursePlayer.tsx** | None — consumes module/block data, unchanged | None |
| **Firestore Schema** | None — no schema changes. Course and Module documents already have all needed fields | None |
| **Security Rules** | None — existing rules already govern course/module CRUD for admin/instructor roles | None |
| **ModuleBuilder.tsx** | Low — only `onBack` navigation target changes. All block editing logic untouched | Low |
| **CourseManager.tsx** | Medium — creation flow changes, "Edit Curriculum" target changes. Table view/delete/publish unchanged | Low |
| **App.tsx** | Low — one new route added to existing routing switch | None |
| **Existing seed data** | None — existing courses render normally in all views | None |
| **Audit trail** | Positive — new module CRUD operations from CourseEditor all use existing audited service functions | None |

---

## Verification Checklist

After all changes are applied, confirm the following:

1. **Instructor creates a course** via modal → sees CourseEditor with empty module list
2. **Instructor adds 3 modules** from CourseEditor → each appears in the list with correct order
3. **Module weights** show running total, amber warning if ≠ 100%
4. **Clicking "Edit Content"** on a module → navigates to ModuleBuilder
5. **ModuleBuilder "Back"** → returns to CourseEditor (not CourseManager)
6. **Course cover image** can be selected from presets during creation and changed from CourseEditor
7. **Cover image renders** correctly in CourseCatalog, CourseDetail, and Dashboard cards
8. **Existing courses** (created before this change) still display and function normally
9. **Audit log** captures: COURSE_CREATE, MODULE_CREATE, COURSE_UPDATE (cover change, metadata edits)
10. **Staff users** see no changes — Catalog, Detail, Player, Dashboard all behave identically
