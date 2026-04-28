# HHCALMS — Guide 13: Course Intelligence Features
## Claude Code Execution Brief
**Date:** April 28, 2026
**Scope:** Feature A — Document-to-Course Pipeline + Feature B — Clinical Term Highlighting
**Estimated Effort:** 8–13 days total (Feature B first: 3–5 days; Feature A second: 5–8 days)
**Firebase Project:** `parrish-harmonyhca` / `harmony-lms`

---

## Execution Rules

Complete each step in order. Verify independently before proceeding to the next step. Do not batch steps.

### Out-of-Scope Files (DO NOT TOUCH)
- `functions/src/index.ts` — except where explicitly instructed in Feature A
- `firestore.rules` — except where explicitly instructed
- `storage.rules` — except where explicitly instructed
- `src/contexts/AuthContext.tsx`
- `src/services/auditService.ts` — consume only, never modify
- All auto-save implementation in `CoursePlayer.tsx` (Guide 11 — protected)
- All existing Cloud Functions (grading, enrollment, competency)

### Conventions
- Inter font, Lucide icons (`strokeWidth={1.75}`), clinical emerald palette (`#064E2B`)
- `stripUndefined` before every Firestore write
- All new Firestore writes call `auditService.logToFirestore()`
- All new collections: fail-closed rules by default

---

## Complete File Change Manifest

### Feature B — Clinical Term Highlighting

| File | Action | Purpose |
|------|--------|---------|
| `src/services/glossaryService.ts` | CREATE | Firestore CRUD for `glossary/{courseId}/terms` |
| `src/components/ui/ClinicalTermExtension.ts` | CREATE | TipTap custom Mark extension |
| `src/components/ui/TermDefinitionPopover.tsx` | CREATE | Learner-facing hover/click popover |
| `src/components/ui/RichTextEditor.tsx` | MODIFY | Add ClinicalTermExtension + "Define Term" BubbleMenu button |
| `src/components/ui/RichTextRenderer.tsx` | MODIFY | DOMPurify allowlist + term span interactivity |
| `src/styles/tiptap.css` | MODIFY | `.clinical-term` style rule |
| `firestore.rules` | MODIFY | Add glossary collection rules |

### Feature A — Document-to-Course Pipeline

| File | Action | Purpose |
|------|--------|---------|
| `functions/src/index.ts` | MODIFY | Add `processCourseImport` + `promoteCourseImport` Cloud Functions |
| `functions/src/types.ts` | MODIFY | Add `CourseImport`, `CourseImportStatus`, `ExtractedCourse` interfaces |
| `src/services/importService.ts` | CREATE | Client-side import Firestore reads + callable function invocations |
| `src/services/storageService.ts` | MODIFY | Add `uploadImportDocument()` function |
| `src/pages/ImportReview.tsx` | CREATE | Full-page structured preview + approve/reject UI |
| `src/pages/CourseManager.tsx` | MODIFY | Add "Import Document" button + file upload entry point |
| `src/App.tsx` | MODIFY | Add `/import-review` route |
| `firestore.rules` | MODIFY | Add `courseImports` collection rules |
| `storage.rules` | MODIFY | Add `imports/` path rules |

---

---

# FEATURE B — Clinical Term Highlighting
## (Implement First — 3–5 days)

### Root Cause

Instructors have no mechanism to flag clinical terminology within module text. Learners encounter terms like "dysphagia," "PRN," or "palliative" with no contextual definition without leaving the course. This feature adds a purpose-built author tagging workflow and a zero-friction learner popover — without adding any backend Cloud Functions.

### Complexity Budget

Zero new Cloud Functions. Zero new Storage paths. One new Firestore subcollection with narrow rules. The TipTap `ClinicalTerm` mark extension is the correct abstraction: it keeps term references native to the editor data model rather than a fragile regex pass over rendered HTML. DOMPurify allowlist extension is the single security-critical change — it is explicit and reviewable in one line.

---

## B — The Contract

### B.1 Glossary Firestore Schema

```
glossary/{courseId}/terms/{termId}
  - term: string           // Display name, e.g. "Dysphagia"
  - definition: string     // Plain text, 1–3 sentences
  - courseId: string       // Denormalized for query convenience
  - createdBy: string      // UID
  - createdByName: string  // Display name
  - createdAt: Timestamp
  - updatedAt: Timestamp
```

**Path:** `glossary/{courseId}/terms/{termId}`
**Single source of truth:** Every term definition lives exactly once in Firestore. Content HTML stores only `data-term-id="{termId}"` — never the definition text inline.

### B.2 GlossaryService Interface

```typescript
// src/services/glossaryService.ts
export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  courseId: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;   // ISO string
  updatedAt: string;
}

export async function createTerm(
  courseId: string,
  term: string,
  definition: string,
  actorId: string,
  actorName: string
): Promise<string>                              // returns termId

export async function updateTerm(
  courseId: string,
  termId: string,
  updates: Pick<GlossaryTerm, 'term' | 'definition'>,
  actorId: string,
  actorName: string
): Promise<void>

export async function deleteTerm(
  courseId: string,
  termId: string,
  actorId: string,
  actorName: string
): Promise<void>

export async function getTermsForCourse(
  courseId: string
): Promise<GlossaryTerm[]>                     // used to preload cache on module load

export async function getTerm(
  courseId: string,
  termId: string
): Promise<GlossaryTerm | null>
```

### B.3 ClinicalTerm TipTap Mark Extension Interface

```typescript
// src/components/ui/ClinicalTermExtension.ts
// Renders as: <span data-term-id="{id}" class="clinical-term">{text}</span>
// Author workflow: select text → BubbleMenu "Define Term" → popover → Firestore write → mark applied
// The mark stores termId as an attribute. Definition is never stored in the HTML.

interface ClinicalTermAttributes {
  termId: string;     // Firestore document ID in glossary/{courseId}/terms/{termId}
  term: string;       // Stored for editor display convenience — NOT the source of truth
}
```

### B.4 TermDefinitionPopover Interface

```typescript
// src/components/ui/TermDefinitionPopover.tsx
interface TermDefinitionPopoverProps {
  termId: string;
  courseId: string;
  anchorEl: HTMLElement;      // The .clinical-term span that was clicked
  onClose: () => void;
  termsCache: Map<string, GlossaryTerm>;  // Pre-loaded on module mount
}
```

### B.5 DOMPurify Allowlist Change (RichTextRenderer.tsx)

```typescript
// BEFORE:
ALLOWED_ATTR: ['href', 'target', 'rel', 'data-color', 'class'],

// AFTER:
ALLOWED_ATTR: ['href', 'target', 'rel', 'data-color', 'class', 'data-term-id'],
//             ^^ Only safe: read-only ID reference. No executable content.
```

---

## B — Execution Steps

### Step B1: Firestore Rules — `glossary` collection [MODIFY `firestore.rules`]

**Estimate:** 15 minutes | **Risk:** Low

Add after the existing `courses` match block:

```javascript
// ============================================
// GLOSSARY TERMS
// ============================================
match /glossary/{courseId}/terms/{termId} {
  // All authenticated users can read terms (needed for CoursePlayer)
  allow read: if isAuthenticated();

  // Only content authors can create/update/delete terms
  allow create: if canAuthorContent() &&
    request.resource.data.keys().hasAll(['term', 'definition', 'courseId', 'createdBy']) &&
    request.resource.data.createdBy == request.auth.uid;
  allow update: if canAuthorContent();
  allow delete: if canAuthorContent();
}
```

**Verification:**
- [ ] Staff user cannot write a term (rules-test or manual attempt)
- [ ] Instructor can create a term
- [ ] Authenticated staff can read terms

---

### Step B2: Create `src/services/glossaryService.ts` [NEW]

**Estimate:** 45 minutes | **Risk:** Low

**Implementation:**
- Collection path: `glossary/{courseId}/terms`
- `createTerm`: writes to Firestore with `serverTimestamp()` for `createdAt`/`updatedAt`, calls `auditService.logToFirestore(..., 'GLOSSARY_TERM_CREATE', termId, ...)`
- `updateTerm`: `updateDoc` with `updatedAt: serverTimestamp()`, calls audit log `GLOSSARY_TERM_UPDATE`
- `deleteTerm`: `deleteDoc`, calls audit log `GLOSSARY_TERM_DELETE`
- `getTermsForCourse`: query all terms for a courseId, ordered by `term` ascending — returns array sorted alphabetically
- `getTerm`: single `getDoc` — returns `null` if not found, never throws
- `stripUndefined` before all writes
- All functions are `async`, typed with the `GlossaryTerm` interface

**Audit action types to add to `src/services/auditService.ts` AuditActionType union:**
```typescript
| 'GLOSSARY_TERM_CREATE'
| 'GLOSSARY_TERM_UPDATE'
| 'GLOSSARY_TERM_DELETE'
```

**Verification:**
- [ ] `createTerm` writes document to `glossary/{courseId}/terms/{id}`
- [ ] `getTermsForCourse` returns sorted array
- [ ] TypeScript compiles with zero errors

---

### Step B3: Create `src/components/ui/ClinicalTermExtension.ts` [NEW]

**Estimate:** 1.5 hours | **Risk:** Medium

This is a TipTap custom `Mark` extension. TipTap marks wrap inline text with attributes.

```typescript
import { Mark, mergeAttributes } from '@tiptap/core';

export const ClinicalTerm = Mark.create({
  name: 'clinicalTerm',

  addAttributes() {
    return {
      termId: { default: null, parseHTML: el => el.getAttribute('data-term-id') },
      term:   { default: null, parseHTML: el => el.getAttribute('data-term') },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-term-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-term-id': HTMLAttributes.termId,
      'data-term': HTMLAttributes.term,
      class: 'clinical-term',
    }), 0];
  },

  // Custom command for applying the mark
  addCommands() {
    return {
      setClinicalTerm: (attrs: { termId: string; term: string }) =>
        ({ commands }) => commands.setMark(this.name, attrs),
      unsetClinicalTerm: () =>
        ({ commands }) => commands.unsetMark(this.name),
    };
  },
});
```

**Key points:**
- The mark stores `termId` and `term` as HTML data attributes
- `term` is stored for display convenience in the editor only — the Firestore definition is authoritative
- The rendered `<span>` has `class="clinical-term"` for CSS targeting
- `data-term-id` is the foreign key to the glossary collection

**Verification:**
- [ ] Extension imports without error
- [ ] TypeScript compiles clean (check `addCommands` typing)

---

### Step B4: Modify `src/components/ui/RichTextEditor.tsx` [MODIFY]

**Estimate:** 1 hour | **Risk:** Medium (modifying a live authoring component)

**Changes:**

1. Add `ClinicalTerm` to the extensions array:
```typescript
import { ClinicalTerm } from './ClinicalTermExtension';

// In extensions array:
ClinicalTerm,
```

2. Add props for author context (needed to write term to Firestore):
```typescript
interface RichTextEditorProps {
  // ... existing props ...
  courseId?: string;          // Required to enable "Define Term" button
  actorId?: string;           // For Firestore writes
  actorName?: string;         // For audit logs
}
```

3. Add "Define Term" button to the BubbleMenu. The button only appears when `courseId` is provided (i.e., we're inside a course module editor):

```tsx
// Inside BubbleMenu, after existing buttons:
{courseId && actorId && (
  <>
    <div className="w-px h-5 bg-gray-200 mx-1" />
    <button
      type="button"
      onClick={() => setShowTermModal(true)}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
        editor.isActive('clinicalTerm')
          ? 'text-primary-700 bg-primary-50'
          : 'text-gray-600 hover:bg-gray-100'
      )}
      title="Define clinical term"
    >
      <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
      {editor.isActive('clinicalTerm') ? 'Edit Term' : 'Define Term'}
    </button>
  </>
)}
```

4. Add the `DefineTermModal` inline component (small modal, not a separate file):
   - Text inputs for "Term" and "Definition"
   - On submit: call `glossaryService.createTerm(...)` → get `termId` → call `editor.commands.setClinicalTerm({ termId, term })`
   - If cursor is already inside a `clinicalTerm` mark: pre-fill fields from existing attributes and call `updateTerm` on save
   - Cancel: close modal, no changes
   - Modal uses existing Tailwind card pattern: `bg-white rounded-lg border border-gray-200 shadow-lg p-4 w-80`
   - Position: fixed, centered over editor — use `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%)`

**Files modified:** `RichTextEditor.tsx` only. `BlockEditor.tsx` needs to pass `courseId`, `actorId`, `actorName` through — see Step B6.

**Verification:**
- [ ] "Define Term" button visible in BubbleMenu when `courseId` is provided and text is selected
- [ ] Modal opens, term + definition entered, saved → span gets `class="clinical-term"` in editor
- [ ] Clicking an existing clinical term span → modal opens pre-filled with existing values
- [ ] Editor still functions normally when `courseId` is not provided (button hidden)

---

### Step B5: Add `.clinical-term` styles to `src/styles/tiptap.css` [MODIFY]

**Estimate:** 10 minutes | **Risk:** None

```css
/* Clinical term highlight — author view (editor) and learner view (renderer) */
.tiptap-content .clinical-term {
  color: #0F6E56;                          /* primary-700 */
  border-bottom: 1.5px dotted #1D9E75;    /* primary-500 */
  cursor: help;
  transition: background-color 0.15s;
}

.tiptap-content .clinical-term:hover {
  background-color: #E1F5EE;              /* primary-50 */
  border-radius: 2px;
}
```

**Verification:**
- [ ] A tagged term in the editor shows emerald dotted underline
- [ ] Hover shows light emerald background
- [ ] No style bleed outside `.tiptap-content` scope

---

### Step B6: Pass `courseId`/`actorId`/`actorName` through builder chain [MODIFY]

**Estimate:** 30 minutes | **Risk:** Low (prop threading only)

The `RichTextEditor` now accepts `courseId`, `actorId`, `actorName`. These need to flow down from the page context to the component.

**Chain:**
1. `ModuleBuilder.tsx` → already has access to `courseId` (from route context) and `user` (from `useAuth`)
2. `BlockEditor.tsx` → add `courseId?: string; actorId?: string; actorName?: string` to `BlockEditorProps`; pass them through to `RichTextEditor` in the `text` block case
3. `ModuleBuilder.tsx` → pass `courseId={courseId}`, `actorId={user.uid}`, `actorName={user.displayName}` to each `BlockEditor`

**No other files need changes.** `RichTextEditorMini` (used in description fields) does NOT need these props — term tagging is only for text content blocks.

**Verification:**
- [ ] `BlockEditor.tsx` TypeScript types compile clean
- [ ] ModuleBuilder passes all three props without errors
- [ ] "Define Term" button visible in module text block editors

---

### Step B7: Modify `src/components/ui/RichTextRenderer.tsx` [MODIFY]

**Estimate:** 45 minutes | **Risk:** Medium (security-critical change)

Two changes:

**1. DOMPurify allowlist — add `data-term-id`:**
```typescript
ALLOWED_ATTR: ['href', 'target', 'rel', 'data-color', 'class', 'data-term-id'],
```
This is safe: `data-term-id` is a read-only string attribute with no executable surface. It never enters `innerHTML` — it is read by the event handler to look up the term.

**2. Add click handler for `.clinical-term` spans:**

The renderer needs to accept a `termsCache` prop and a callback:

```typescript
interface RichTextRendererProps {
  content: string;
  className?: string;
  // Optional: enable clinical term interactivity
  termsCache?: Map<string, GlossaryTerm>;
  onTermClick?: (termId: string, anchorEl: HTMLElement) => void;
}
```

After the `dangerouslySetInnerHTML` div renders, attach a delegated click handler using `useRef` + `useEffect`:

```typescript
const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const container = containerRef.current;
  if (!container || !onTermClick) return;

  const handleClick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('.clinical-term');
    if (!target) return;
    const termId = target.getAttribute('data-term-id');
    if (termId) onTermClick(termId, target as HTMLElement);
  };

  container.addEventListener('click', handleClick);
  return () => container.removeEventListener('click', handleClick);
}, [onTermClick]);
```

**Verification:**
- [ ] Existing content without term spans renders identically
- [ ] `<script>` tags in content still stripped by DOMPurify
- [ ] `onclick` attributes still stripped
- [ ] `data-term-id` attribute preserved through sanitization
- [ ] Click on a `.clinical-term` span fires `onTermClick` with correct termId

---

### Step B8: Create `src/components/ui/TermDefinitionPopover.tsx` [NEW]

**Estimate:** 1 hour | **Risk:** Low

A lightweight popover that appears when a learner clicks a clinical term span.

**Layout:**
```
┌─────────────────────────────────┐
│ 📖 Dysphagia              [×]  │
│ ─────────────────────────────── │
│ Difficulty swallowing food or   │
│ liquid due to neurological or   │
│ structural impairment.          │
└─────────────────────────────────┘
```

**Implementation:**
- Positioned with `useEffect` that reads `anchorEl.getBoundingClientRect()` and sets `position: fixed` top/left
- Appears above the term if space allows, below if not (check `rect.top > 160`)
- Renders `GlossaryTerm.term` as the title (bold, emerald) + `GlossaryTerm.definition` as body text
- Shows a skeleton state while loading (if term not in cache yet)
- If term lookup fails: shows "Definition unavailable" — never throws to the UI
- Close on: `×` button, click outside, `Escape` key
- Accessibility: `role="tooltip"`, `aria-label={term.term}`, focus-trapped

```typescript
export const TermDefinitionPopover: React.FC<TermDefinitionPopoverProps> = ({
  termId, courseId, anchorEl, onClose, termsCache
}) => {
  const [term, setTerm] = useState<GlossaryTerm | null>(
    termsCache.get(termId) ?? null
  );
  const [loading, setLoading] = useState(!term);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    // Position relative to anchor
    const rect = anchorEl.getBoundingClientRect();
    setPosition({
      top: rect.top > 160 ? rect.top - 8 : rect.bottom + 8,
      left: Math.min(rect.left, window.innerWidth - 280),
    });

    // Fetch if not in cache
    if (!term) {
      glossaryService.getTerm(courseId, termId)
        .then(t => { setTerm(t); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [termId, anchorEl]);

  // ... Escape key handler, click-outside handler ...

  return (
    <div
      role="tooltip"
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }}
      className="w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-primary-600" strokeWidth={1.75} />
          <span className="text-sm font-medium text-primary-700">
            {loading ? '...' : (term?.term ?? 'Term')}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-0.5 rounded">
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
      {/* Definition */}
      <p className="text-xs text-gray-600 leading-relaxed">
        {loading
          ? <span className="animate-pulse bg-gray-100 rounded h-3 block w-full" />
          : (term?.definition ?? 'Definition unavailable.')}
      </p>
    </div>
  );
};
```

**Verification:**
- [ ] Popover renders above the clicked term
- [ ] Term name and definition display correctly from cache
- [ ] Loading state shows skeleton for uncached terms
- [ ] Closes on Escape, click-outside, and × button
- [ ] "Definition unavailable" shows when Firestore fetch fails

---

### Step B9: Wire TermDefinitionPopover into CoursePlayer [MODIFY `src/pages/CoursePlayer.tsx`]

**Estimate:** 45 minutes | **Risk:** Low

`CoursePlayer.tsx` renders `BlockRenderer` for each block. The `text` block case uses `RichTextRenderer`. The popover needs to be wired at the CoursePlayer level because it requires `courseId` context.

**Changes:**

1. In `CoursePlayer.tsx`, load terms cache on module mount:
```typescript
const [termsCache, setTermsCache] = useState<Map<string, GlossaryTerm>>(new Map());

useEffect(() => {
  if (!courseId) return;
  glossaryService.getTermsForCourse(courseId).then(terms => {
    setTermsCache(new Map(terms.map(t => [t.id, t])));
  });
}, [courseId]);
```

2. Add popover state:
```typescript
const [activePopover, setActivePopover] = useState<{
  termId: string;
  anchorEl: HTMLElement;
} | null>(null);
```

3. Pass `termsCache` and `onTermClick` to `BlockRenderer` → `RichTextRenderer` via props threading (same pattern as Step B6). `BlockRenderer` needs to accept and pass through these optional props.

4. Render `TermDefinitionPopover` at the bottom of the `CoursePlayer` return:
```tsx
{activePopover && (
  <TermDefinitionPopover
    termId={activePopover.termId}
    courseId={courseId}
    anchorEl={activePopover.anchorEl}
    onClose={() => setActivePopover(null)}
    termsCache={termsCache}
  />
)}
```

**Verification:**
- [ ] Course with no tagged terms: no visual change, no console errors
- [ ] Course with tagged terms: terms show emerald dotted underline in CoursePlayer
- [ ] Click a term → popover appears with correct definition
- [ ] Click another term → first popover closes, new one opens
- [ ] Navigate to next module → popover closes, new terms cache loads

---

### Feature B — Verification Checklist

**Author workflow (ModuleBuilder):**
- [ ] Text block in ModuleBuilder shows "Define Term" in BubbleMenu when text selected
- [ ] Modal opens, term + definition entered, saved → span marked in editor
- [ ] Term appears in Firestore at `glossary/{courseId}/terms/{termId}`
- [ ] Audit log entry created for `GLOSSARY_TERM_CREATE`
- [ ] Clicking existing marked term in editor → modal pre-filled, can update definition
- [ ] Module saves with marked terms — blocks persist term marks to Firestore

**Learner workflow (CoursePlayer):**
- [ ] Marked terms show emerald dotted underline in CoursePlayer
- [ ] Click a term → popover appears with term name and definition
- [ ] Terms cache loaded once per course load (not per click)
- [ ] Popover closes on Escape, click-outside, × button
- [ ] Unmarked modules work with no regression

**Security:**
- [ ] DOMPurify strips `<script>`, `onclick`, `onerror` from content
- [ ] `data-term-id` preserved through sanitization
- [ ] Staff users cannot write to `glossary` collection (rules rejection)
- [ ] Zero TypeScript errors, clean Vite build

---
---

# FEATURE A — Document-to-Course Pipeline
## (Implement Second — 5–8 days)

### Root Cause

Instructors at Parrish Health receive training materials as PDFs and Word documents. Building a course from scratch by retyping that content into the Module Builder takes hours per course. This feature adds a document upload → AI-assisted extraction → instructor review → published course pipeline that eliminates the transcription step while keeping the instructor as the authoritative quality gate.

### Complexity Budget

The extraction engine must run server-side — an API key cannot be in the client bundle. This justifies two new Cloud Functions (`processCourseImport`, `promoteCourseImport`). The staging collection (`courseImports`) is the single source of truth for import state. The approval workflow is not optional — AI extraction will make mistakes; the instructor review step is the quality gate that makes this safe for clinical content.

All existing course creation, editing, and publishing flows are untouched. Imported courses enter the system at the same data structure as manually created ones. Post-import, instructors use the existing `CourseEditor` and `ModuleBuilder` to refine content.

---

## A — The Contract

### A.1 New TypeScript Interfaces (add to `functions/src/types.ts`)

```typescript
// ============================================
// COURSE IMPORT PIPELINE
// ============================================

export type CourseImportStatus =
  | 'uploading'        // File being written to Storage
  | 'processing'       // Cloud Function extracting content
  | 'pending_review'   // Extraction complete, awaiting instructor approval
  | 'approved'         // Instructor approved, promotion in progress
  | 'promoted'         // Course + modules + blocks written to Firestore
  | 'rejected'         // Instructor rejected the import
  | 'failed';          // Extraction or promotion failed

export interface ExtractedModule {
  title: string;
  description: string;
  estimatedMinutes: number;        // AI estimate — instructor can adjust
  isCritical: boolean;             // Default: false
  weight: number;                  // Default: evenly distributed (100 / moduleCount)
  passingScore: number;            // Default: 70
  contentBlocks: ExtractedBlock[];
}

export interface ExtractedBlock {
  type: 'heading' | 'text';        // Only these two types are extracted — no quiz generation
  content: string;                 // HTML string (headings) or HTML string (rich text)
  order: number;
}

export interface ExtractedCourse {
  title: string;
  description: string;
  category: CourseCategory;        // AI-inferred or defaulted to 'compliance'
  ceCredits: number;               // Default: 1.0
  modules: ExtractedModule[];
}

export interface CourseImport {
  id: string;
  status: CourseImportStatus;

  // Upload metadata
  uploadedBy: string;              // UID
  uploadedByName: string;
  uploadedAt: string;              // ISO string
  fileName: string;                // Original filename for display
  fileType: 'pdf' | 'docx';
  storagePath: string;             // Full Firebase Storage path

  // Extraction result (null until processing complete)
  extractedCourse: ExtractedCourse | null;
  extractionError: string | null;  // Human-readable error message if failed

  // Review metadata
  reviewedBy: string | null;       // UID of approving/rejecting instructor
  reviewedByName: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;

  // Promotion result (null until promoted)
  promotedCourseId: string | null; // ID of the Course document created
}
```

### A.2 Storage Path

```
imports/{userId}/{importId}.{ext}
```

- Deterministic: one file per import document — no orphan accumulation
- User-scoped: instructors can only read their own import documents
- `ext` is `pdf` or `docx`

### A.3 Cloud Function Signatures

```typescript
// Callable — invoked by client after file is in Storage
export const processCourseImport = onCall(async (request) => {
  // Input: { importId: string, storagePath: string }
  // 1. Validates caller is admin or instructor
  // 2. Reads file from Storage
  // 3. Extracts text (PDF: pdf-parse; DOCX: mammoth.js)
  // 4. Calls Anthropic API with extraction prompt
  // 5. Parses structured JSON response into ExtractedCourse
  // 6. Writes result to courseImports/{importId}
  // Output: { success: boolean }
});

// Callable — invoked by client after instructor approves
export const promoteCourseImport = onCall(async (request) => {
  // Input: { importId: string, editedCourse: ExtractedCourse }
  // editedCourse is the instructor-reviewed version (may differ from original extraction)
  // 1. Validates caller is admin or instructor
  // 2. Validates importId status === 'pending_review'
  // 3. Idempotency check: if status === 'promoted', return existing promotedCourseId
  // 4. Atomic batch write:
  //    - createCourse() → courseId
  //    - createModule() × N
  //    - createBlocks() × N per module
  // 5. Updates courseImports/{importId} status → 'promoted', promotedCourseId
  // 6. Audit log: IMPORT_APPROVED
  // Output: { courseId: string }
});
```

### A.4 Extraction Prompt Contract

The `processCourseImport` function sends the extracted document text to the Anthropic API with a structured prompt. The prompt must request a JSON response matching `ExtractedCourse` exactly. The function must:
- Validate the JSON response before writing to Firestore
- Reject responses missing required fields (`title`, `modules[]`)
- Default missing optional fields (`ceCredits: 1.0`, `isCritical: false`, `weight: evenly distributed`)
- Never write raw AI output to Firestore without validation

### A.5 ImportService Client Interface

```typescript
// src/services/importService.ts
export async function createImportRecord(
  importId: string,
  fileName: string,
  fileType: 'pdf' | 'docx',
  storagePath: string,
  actorId: string,
  actorName: string
): Promise<void>                                  // Writes initial CourseImport doc

export async function getImportRecord(
  importId: string
): Promise<CourseImport | null>

export async function subscribeToImport(
  importId: string,
  onUpdate: (imp: CourseImport) => void
): () => void                                     // Returns unsubscribe function (onSnapshot)

export async function rejectImport(
  importId: string,
  reason: string,
  actorId: string,
  actorName: string
): Promise<void>

export async function callProcessImport(
  importId: string,
  storagePath: string
): Promise<void>                                  // Calls processCourseImport Cloud Function

export async function callPromoteImport(
  importId: string,
  editedCourse: ExtractedCourse
): Promise<string>                                // Returns courseId
```

---

## A — Execution Steps

### Step A1: Add new audit action types [MODIFY `src/services/auditService.ts`]

**Estimate:** 5 minutes | **Risk:** None

Add to the `AuditActionType` union:
```typescript
| 'IMPORT_INITIATED'
| 'IMPORT_PROCESSING'
| 'IMPORT_APPROVED'
| 'IMPORT_REJECTED'
| 'IMPORT_FAILED'
| 'IMPORT_PROMOTED'
```

**Verification:** TypeScript compiles clean.

---

### Step A2: Add interfaces to `functions/src/types.ts` [MODIFY]

**Estimate:** 20 minutes | **Risk:** Low

Add all interfaces from Section A.1 to the bottom of `functions/src/types.ts`.

**Verification:**
- [ ] `functions` directory compiles: `cd functions && npm run build`
- [ ] Zero TypeScript errors

---

### Step A3: Storage rules — `imports/` path [MODIFY `storage.rules`]

**Estimate:** 15 minutes | **Risk:** Low

Add after existing `modules/` match block:

```javascript
// ============================================
// IMPORT DOCUMENTS (Instructor/Admin uploads)
// ============================================
match /imports/{userId}/{importFile} {
  // Only the uploading user (or admin) can read their own import
  allow read: if isAuthenticated() &&
    (request.auth.uid == userId || isAdmin());

  // Only content authors can upload; PDF and DOCX only; 25MB max
  allow write: if canAuthorContent() &&
    request.auth.uid == userId &&
    (request.resource.contentType == 'application/pdf' ||
     request.resource.contentType == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') &&
    isUnderSizeLimit(25);

  allow delete: if canAuthorContent() && request.auth.uid == userId;
}
```

**Verification:**
- [ ] Staff cannot write to `imports/`
- [ ] Instructor can write their own path
- [ ] Instructor cannot read another user's import path

---

### Step A4: Firestore rules — `courseImports` collection [MODIFY `firestore.rules`]

**Estimate:** 20 minutes | **Risk:** Low

```javascript
// ============================================
// COURSE IMPORTS (Staging collection for document pipeline)
// ============================================
match /courseImports/{importId} {
  // Content authors can read their own imports only
  // Admin can read all (for oversight)
  allow read: if isAdmin() ||
    (canAuthorContent() && resource.data.uploadedBy == request.auth.uid);

  // Create: content authors only, must be their own record
  allow create: if canAuthorContent() &&
    request.resource.data.uploadedBy == request.auth.uid &&
    request.resource.data.keys().hasAll(['uploadedBy', 'status', 'fileName', 'storagePath']);

  // Update: content authors can update their own; Cloud Functions use Admin SDK (bypass rules)
  allow update: if canAuthorContent() &&
    resource.data.uploadedBy == request.auth.uid;

  // Never delete import records (audit trail)
  allow delete: if false;
}
```

**Verification:**
- [ ] Staff cannot create import records
- [ ] Instructor cannot read another instructor's imports
- [ ] Import records cannot be deleted by any role

---

### Step A5: Install Cloud Function dependencies [MODIFY `functions/package.json`]

**Estimate:** 10 minutes | **Risk:** Low

```bash
cd functions
npm install pdf-parse mammoth @anthropic-ai/sdk
npm install -D @types/pdf-parse
```

Set the Anthropic API key as a Firebase Secret:
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
# Paste the key when prompted
```

Add to `functions/src/index.ts` top-level import:
```typescript
import { defineSecret } from 'firebase-functions/params';
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
```

**Verification:**
- [ ] `cd functions && npm run build` succeeds
- [ ] Secret set in Firebase project (verify in GCP Secret Manager console)

---

### Step A6: Implement `processCourseImport` Cloud Function [MODIFY `functions/src/index.ts`]

**Estimate:** 3–4 hours | **Risk:** High (new Cloud Function, external API)

Add after existing Cloud Functions. This function is called by the client after the file is uploaded to Storage.

**Full implementation spec:**

```typescript
export const processCourseImport = onCall(
  { secrets: [anthropicApiKey] },
  async (request) => {
    // 1. Auth check
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');
    const role = request.auth.token.role;
    if (role !== 'admin' && role !== 'instructor') {
      throw new HttpsError('permission-denied', 'Must be admin or instructor');
    }

    const { importId, storagePath } = request.data;
    if (!importId || !storagePath) {
      throw new HttpsError('invalid-argument', 'importId and storagePath required');
    }

    // 2. Update status to 'processing'
    const importRef = db.collection('courseImports').doc(importId);
    await importRef.update({ status: 'processing' });

    try {
      // 3. Read file from Storage
      const bucket = getStorage().bucket();
      const file = bucket.file(storagePath);
      const [fileBuffer] = await file.download();
      const isDocx = storagePath.endsWith('.docx');

      // 4. Extract text from document
      let documentText: string;
      if (isDocx) {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        documentText = result.value;
      } else {
        const pdfData = await pdfParse(fileBuffer);
        documentText = pdfData.text;
      }

      if (!documentText || documentText.trim().length < 100) {
        throw new Error('Document appears empty or too short to extract meaningful content');
      }

      // 5. Call Anthropic API
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: buildExtractionPrompt(documentText),
        }],
      });

      // 6. Parse and validate response
      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                        responseText.match(/({[\s\S]*})/);
      if (!jsonMatch) throw new Error('AI response did not contain valid JSON');

      const extracted: ExtractedCourse = JSON.parse(jsonMatch[1]);

      // 7. Validate extracted structure
      if (!extracted.title || !Array.isArray(extracted.modules) || extracted.modules.length === 0) {
        throw new Error('Extracted content missing required fields: title or modules');
      }

      // 8. Normalize defaults
      const moduleCount = extracted.modules.length;
      const evenWeight = Math.floor(100 / moduleCount);
      extracted.modules = extracted.modules.map((mod, i) => ({
        ...mod,
        isCritical: mod.isCritical ?? false,
        weight: mod.weight ?? (i === moduleCount - 1 ? 100 - evenWeight * (moduleCount - 1) : evenWeight),
        passingScore: mod.passingScore ?? 70,
        estimatedMinutes: mod.estimatedMinutes ?? 15,
        contentBlocks: (mod.contentBlocks ?? []).map((b, j) => ({ ...b, order: j })),
      }));
      extracted.ceCredits = extracted.ceCredits ?? 1.0;
      extracted.category = extracted.category ?? 'compliance';

      // 9. Write result
      await importRef.update({
        status: 'pending_review',
        extractedCourse: extracted,
        extractionError: null,
      });

    } catch (err: any) {
      await importRef.update({
        status: 'failed',
        extractionError: err.message ?? 'Unknown extraction error',
      });
      throw new HttpsError('internal', `Extraction failed: ${err.message}`);
    }

    return { success: true };
  }
);
```

**Extraction prompt helper — define as a pure function in the same file:**

```typescript
function buildExtractionPrompt(documentText: string): string {
  return `You are extracting structured course content from a clinical training document.

Analyze the following document and extract it into a structured course format.
Return ONLY valid JSON matching this exact structure, wrapped in \`\`\`json ... \`\`\` markers:

{
  "title": "Course title",
  "description": "2-3 sentence course description",
  "category": "compliance | clinical_skills | patient_care | safety | onboarding | hospice",
  "ceCredits": 1.0,
  "modules": [
    {
      "title": "Module title",
      "description": "1-2 sentence module description",
      "estimatedMinutes": 20,
      "isCritical": false,
      "weight": 50,
      "passingScore": 70,
      "contentBlocks": [
        { "type": "heading", "content": "Section heading text" },
        { "type": "text", "content": "<p>Paragraph content as HTML.</p>" }
      ]
    }
  ]
}

Rules:
- Create one module per major section or topic
- All module weights must sum to exactly 100
- Content blocks: use "heading" for section titles, "text" for body content
- Text content must be valid HTML (wrap paragraphs in <p> tags, use <strong> for emphasis)
- Do not generate quiz questions — extraction only
- If the document has no clear sections, create a single module

DOCUMENT TEXT:
${documentText.substring(0, 12000)}`;
}
```

**Verification:**
- [ ] `cd functions && npm run build` — zero TypeScript errors
- [ ] Deploy: `firebase deploy --only functions:processCourseImport`
- [ ] Test with a short PDF — status transitions `uploading → processing → pending_review`
- [ ] Firestore shows extracted course structure in `courseImports/{id}`
- [ ] Test with an unsupported file type — status set to `failed` with descriptive error

---

### Step A7: Implement `promoteCourseImport` Cloud Function [MODIFY `functions/src/index.ts`]

**Estimate:** 1.5 hours | **Risk:** Medium (batch write, idempotency)

```typescript
export const promoteCourseImport = onCall(async (request) => {
  // 1. Auth check
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');
  const role = request.auth.token.role;
  if (role !== 'admin' && role !== 'instructor') {
    throw new HttpsError('permission-denied', 'Must be admin or instructor');
  }

  const { importId, editedCourse } = request.data;

  // 2. Read import record
  const importRef = db.collection('courseImports').doc(importId);
  const importDoc = await importRef.get();
  if (!importDoc.exists) throw new HttpsError('not-found', `Import ${importId} not found`);

  const importData = importDoc.data() as CourseImport;

  // 3. Idempotency check
  if (importData.status === 'promoted' && importData.promotedCourseId) {
    return { courseId: importData.promotedCourseId };
  }

  if (importData.status !== 'pending_review') {
    throw new HttpsError('failed-precondition',
      `Import status is '${importData.status}', expected 'pending_review'`);
  }

  // 4. Mark as approved
  await importRef.update({ status: 'approved' });

  try {
    // 5. Atomic batch write — course + all modules + all blocks
    const batch = db.batch();
    const courseId = db.collection('courses').doc().id;
    const courseRef = db.collection('courses').doc(courseId);

    batch.set(courseRef, {
      title: editedCourse.title,
      description: editedCourse.description,
      category: editedCourse.category,
      ceCredits: editedCourse.ceCredits,
      status: 'draft',                        // Always starts as draft
      thumbnailUrl: '',
      estimatedHours: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (let mIdx = 0; mIdx < editedCourse.modules.length; mIdx++) {
      const mod = editedCourse.modules[mIdx];
      const moduleId = db.collection('courses').doc(courseId)
        .collection('modules').doc().id;
      const moduleRef = db.collection('courses').doc(courseId)
        .collection('modules').doc(moduleId);

      batch.set(moduleRef, {
        courseId,
        title: mod.title,
        description: mod.description,
        estimatedMinutes: mod.estimatedMinutes,
        isCritical: mod.isCritical,
        weight: mod.weight,
        passingScore: mod.passingScore,
        order: mIdx,
        status: 'draft',
        blocks: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      for (let bIdx = 0; bIdx < mod.contentBlocks.length; bIdx++) {
        const block = mod.contentBlocks[bIdx];
        const blockRef = db.collection('courses').doc(courseId)
          .collection('modules').doc(moduleId)
          .collection('blocks').doc();

        batch.set(blockRef, {
          moduleId,
          type: block.type,
          order: bIdx,
          required: true,
          data: block.type === 'heading'
            ? { content: block.content, level: 2 }
            : { content: block.content, variant: 'paragraph' },
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();

    // 6. Update import record
    await importRef.update({
      status: 'promoted',
      promotedCourseId: courseId,
      reviewedBy: request.auth.uid,
      reviewedAt: new Date().toISOString(),
    });

    // 7. Audit log
    await db.collection('audit_logs').doc().set({
      actorId: request.auth.uid,
      actorName: importData.uploadedByName,
      actionType: 'IMPORT_APPROVED',
      targetId: courseId,
      details: `Course imported from document: ${importData.fileName}. ${editedCourse.modules.length} modules created.`,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { courseId };

  } catch (err: any) {
    await importRef.update({ status: 'failed', extractionError: err.message });
    throw new HttpsError('internal', `Promotion failed: ${err.message}`);
  }
});
```

**Verification:**
- [ ] `cd functions && npm run build` — zero errors
- [ ] Deploy: `firebase deploy --only functions:promoteCourseImport`
- [ ] Call with a valid `importId` in `pending_review` status → Course + modules + blocks appear in Firestore
- [ ] Call a second time with the same `importId` → returns existing `courseId` (idempotent)
- [ ] Call with `importId` in wrong status → `failed-precondition` error returned to client

---

### Step A8: Modify `src/services/storageService.ts` — add `uploadImportDocument` [MODIFY]

**Estimate:** 30 minutes | **Risk:** Low

Add alongside existing `uploadCourseImage`:

```typescript
const IMPORT_ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const IMPORT_MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export class InvalidImportFileTypeError extends Error {
  constructor() {
    super('Only PDF and Word documents (.docx) are supported.');
    this.name = 'InvalidImportFileTypeError';
  }
}

export class ImportFileTooLargeError extends Error {
  constructor() {
    super('File size exceeds 25 MB limit.');
    this.name = 'ImportFileTooLargeError';
  }
}

export async function uploadImportDocument(
  userId: string,
  importId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  if (!IMPORT_ALLOWED_TYPES.has(file.type)) throw new InvalidImportFileTypeError();
  if (file.size > IMPORT_MAX_SIZE) throw new ImportFileTooLargeError();

  const ext = file.type === 'application/pdf' ? 'pdf' : 'docx';
  const storagePath = `imports/${userId}/${importId}.${ext}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise<UploadResult>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(percent);
      },
      (error) => reject(error),
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        resolve({ downloadUrl, storagePath });
      }
    );
  });
}
```

**Verification:**
- [ ] TypeScript compiles clean
- [ ] Uploading a valid PDF results in file at `imports/{userId}/{importId}.pdf` in Firebase Storage
- [ ] Uploading a `.txt` file throws `InvalidImportFileTypeError`

---

### Step A9: Create `src/services/importService.ts` [NEW]

**Estimate:** 45 minutes | **Risk:** Low

```typescript
import { collection, doc, setDoc, getDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from './firebase';
import { CourseImport, ExtractedCourse } from '../functions/src/types';
import { auditService } from './auditService';
import { generateId } from '../utils';

const IMPORTS_COLLECTION = 'courseImports';

export async function createImportRecord(
  importId: string,
  fileName: string,
  fileType: 'pdf' | 'docx',
  storagePath: string,
  actorId: string,
  actorName: string
): Promise<void> {
  const ref = doc(db, IMPORTS_COLLECTION, importId);
  await setDoc(ref, {
    status: 'uploading',
    uploadedBy: actorId,
    uploadedByName: actorName,
    uploadedAt: new Date().toISOString(),
    fileName,
    fileType,
    storagePath,
    extractedCourse: null,
    extractionError: null,
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    rejectionReason: null,
    promotedCourseId: null,
  });
  await auditService.logToFirestore(actorId, actorName, 'IMPORT_INITIATED', importId,
    `Import initiated for file: ${fileName}`);
}

export async function getImportRecord(importId: string): Promise<CourseImport | null> {
  const snap = await getDoc(doc(db, IMPORTS_COLLECTION, importId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CourseImport;
}

export function subscribeToImport(
  importId: string,
  onUpdate: (imp: CourseImport) => void
): () => void {
  return onSnapshot(doc(db, IMPORTS_COLLECTION, importId), (snap) => {
    if (snap.exists()) onUpdate({ id: snap.id, ...snap.data() } as CourseImport);
  });
}

export async function rejectImport(
  importId: string,
  reason: string,
  actorId: string,
  actorName: string
): Promise<void> {
  await updateDoc(doc(db, IMPORTS_COLLECTION, importId), {
    status: 'rejected',
    rejectionReason: reason,
    reviewedBy: actorId,
    reviewedByName: actorName,
    reviewedAt: new Date().toISOString(),
  });
  await auditService.logToFirestore(actorId, actorName, 'IMPORT_REJECTED', importId,
    `Import rejected. Reason: ${reason}`);
}

export async function callProcessImport(importId: string, storagePath: string): Promise<void> {
  const functions = getFunctions();
  const fn = httpsCallable(functions, 'processCourseImport');
  await fn({ importId, storagePath });
}

export async function callPromoteImport(
  importId: string,
  editedCourse: ExtractedCourse
): Promise<string> {
  const functions = getFunctions();
  const fn = httpsCallable(functions, 'promoteCourseImport');
  const result = await fn({ importId, editedCourse });
  return (result.data as { courseId: string }).courseId;
}
```

**Verification:**
- [ ] TypeScript compiles clean
- [ ] `subscribeToImport` unsubscribe function works (call the returned function)

---

### Step A10: Add "Import Document" button to `CourseManager.tsx` [MODIFY]

**Estimate:** 1 hour | **Risk:** Low

Add alongside the existing "Create New Course" button. Admin and instructor roles only (same as create).

**Flow:**
1. User clicks "Import Document" → file picker opens (`accept=".pdf,.docx"`)
2. File selected → validate type and size client-side
3. Generate `importId = generateId()`
4. Determine `fileType` from `file.type`
5. Show upload modal with progress bar
6. Call `uploadImportDocument(user.uid, importId, file, setProgress)`
7. Call `createImportRecord(importId, file.name, fileType, storagePath, user.uid, user.displayName)`
8. Call `callProcessImport(importId, storagePath)` — this may take 10–30 seconds
9. Subscribe to import via `subscribeToImport` to watch status
10. When status === `'pending_review'` → navigate to `/import-review?importId={importId}`
11. If status === `'failed'` → show error toast with `import.extractionError`

**Upload modal spec:**
- Title: "Importing document…"
- Subtitle: file name
- Progress bar (0–100%) during Storage upload
- After upload: "Analyzing content…" spinner (while Cloud Function runs — no progress bar, indeterminate)
- Cancel button: only enabled during upload phase, not during processing (can't cancel a running Cloud Function)

**Verification:**
- [ ] Button only visible to admin/instructor roles
- [ ] File picker filters to `.pdf` and `.docx`
- [ ] Uploading a `.txt` shows error — upload never starts
- [ ] Uploading a valid PDF shows progress → spinner → navigates to `/import-review`
- [ ] Uploading a file where extraction fails → toast with descriptive error

---

### Step A11: Create `src/pages/ImportReview.tsx` [NEW]

**Estimate:** 2–3 hours | **Risk:** Medium (complex editable UI)

Full-page review interface. The instructor sees the AI-extracted course structure and can edit every field before approving or rejecting.

**Route:** `/import-review` with `importId` from query params

**Page layout (top to bottom):**

```
┌─────────────────────────────────────────────┐
│ ← Back   Review Imported Course   [Reject]  │
│                                   [Approve] │
├─────────────────────────────────────────────┤
│ SOURCE FILE: training_manual.pdf            │
│ Extracted [date] by [name]                  │
├─────────────────────────────────────────────┤
│ Course Metadata (editable)                  │
│  Title: [____________________]              │
│  Description: [______________]              │
│  Category: [select] CE Credits: [__]        │
├─────────────────────────────────────────────┤
│ Modules (1 of 3)                            │
│  ┌─────────────────────────────────────┐   │
│  │ Module 1: Introduction to Hospice   │   │
│  │  Title / weight / critical / score  │   │
│  │  Content blocks (preview + edit)    │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ Module 2: ...                       │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**State:**
```typescript
const [editedCourse, setEditedCourse] = useState<ExtractedCourse | null>(null);
// Initialized from import.extractedCourse when the page loads
// All edits mutate this state; Approve sends editedCourse to promoteCourseImport
```

**Key behaviors:**
- All fields are editable: course title, description, category, CE credits
- Per-module: title, description, weight (number input), `isCritical` (checkbox), `passingScore`
- Weight total indicator: shows running sum, turns red if total ≠ 100
- Content blocks: shown as a read-only preview (collapsible per module). Instructor can delete blocks but not edit block content on this page — that's what `ModuleBuilder` is for after approval
- Approve button: disabled if weight total ≠ 100 or title is empty
- On Approve: call `callPromoteImport(importId, editedCourse)` → navigate to `/course-editor?courseId={courseId}` with a toast: "Course created. Review and publish when ready."
- Reject modal: text area for rejection reason (required), confirm button calls `rejectImport`
- Subscribe to import on mount; if status is already `promoted`, redirect to course editor

**Verification:**
- [ ] Page loads with pre-filled course data from import record
- [ ] All fields editable; changes reflected in `editedCourse` state
- [ ] Weight total indicator shows correct sum and turns red when ≠ 100
- [ ] Approve button disabled when weights ≠ 100 or title empty
- [ ] Approving navigates to CourseEditor with success toast
- [ ] Course + modules + blocks appear in Firestore as `draft`
- [ ] Rejecting writes rejection reason to import record
- [ ] Navigating directly to an already-promoted import redirects to the CourseEditor

---

### Step A12: Add `/import-review` route to `src/App.tsx` [MODIFY]

**Estimate:** 10 minutes | **Risk:** None

Add the route alongside existing routes. Guard: admin and instructor roles only.

```typescript
// In route definitions:
{ path: '/import-review', element: <ImportReview />, roles: ['admin', 'instructor'] }
```

**Verification:**
- [ ] `/import-review?importId=abc` loads the page
- [ ] Staff navigating to this path is redirected to dashboard

---

### Feature A — Verification Checklist

**Upload phase:**
- [ ] "Import Document" button visible to admin/instructor in CourseManager
- [ ] File picker accepts only `.pdf` and `.docx`
- [ ] Invalid file type rejected client-side before upload begins
- [ ] Valid file uploads with progress bar
- [ ] `courseImports/{importId}` document created with status `uploading`
- [ ] Storage file appears at `imports/{userId}/{importId}.pdf`

**Processing phase:**
- [ ] Status transitions: `uploading → processing → pending_review`
- [ ] `extractedCourse` field populated with structured JSON
- [ ] Navigation to `/import-review` triggered automatically

**Review phase:**
- [ ] All course metadata editable
- [ ] Module weights sum indicator correct
- [ ] Approve disabled when weights ≠ 100
- [ ] Content block preview visible per module

**Approval phase:**
- [ ] Approve → Course in Firestore as `draft`
- [ ] Module count matches extracted modules
- [ ] Block count and types match per module
- [ ] Status in `courseImports` → `promoted`
- [ ] `promotedCourseId` populated
- [ ] Audit log entry `IMPORT_APPROVED` created
- [ ] Navigation to CourseEditor with success toast
- [ ] Second approve call returns existing `courseId` (idempotent)

**Rejection phase:**
- [ ] Reject modal requires reason text
- [ ] Status → `rejected`, reason stored
- [ ] Audit log entry `IMPORT_REJECTED` created

**Error handling:**
- [ ] Failed extraction: status → `failed`, `extractionError` message displayed
- [ ] Failed promotion: status → `failed`, toast with error message
- [ ] Empty document: extraction fails with "too short" message
- [ ] Corrupt PDF: extraction fails with descriptive error

**Regression:**
- [ ] Existing "Create New Course" flow unchanged
- [ ] CourseEditor, ModuleBuilder, BlockEditor — no changes
- [ ] All existing Cloud Functions still pass their tests
- [ ] Clean Vite build, zero TypeScript errors

---

## Combined Deployment Order

1. `firebase deploy --only firestore:rules` (after Steps B1, A3, A4)
2. `firebase deploy --only storage` (after Step A3)
3. `firebase deploy --only functions:processCourseImport` (after Step A6)
4. `firebase deploy --only functions:promoteCourseImport` (after Step A7)
5. `npm run build && firebase deploy --only hosting` (after all frontend steps)

---

## Do-Not-Touch Guard List (both features)

| File | Reason |
|------|--------|
| `src/contexts/AuthContext.tsx` | JWT claim handling — never modify |
| `src/services/auditService.ts` | Append-only — consume only, never restructure |
| Auto-save in `CoursePlayer.tsx` | Guide 11 protected |
| Existing 6 Cloud Functions | Grading and enrollment engine — no changes |
| `firestore.rules` grading section | CMS compliance — rules are not filters |
| `src/components/ui/RichTextEditor.tsx` toolbar | Only the BubbleMenu receives additions; existing toolbar untouched |
