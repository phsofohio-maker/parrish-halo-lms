# HHCALMS Rich Text Editor Integration — Claude Code Execution Brief

**Guide 12 | March 25, 2026 | TipTap WYSIWYG Editor, 3 Surfaces, 5 New Files, 6 Modified Files**

---

## Architecture Decision: Storage Format

**Decision: HTML string stored in Firestore, sanitized with DOMPurify on render.**

Rationale:
- All content authors are authenticated instructors/admins behind JWT role checks. XSS surface is narrow.
- DOMPurify sanitization on output eliminates remaining risk without trusting raw HTML.
- Existing plain text content in Firestore is valid HTML — zero migration cost. A plain string renders correctly inside `<p>` tags.
- TipTap JSON would require building a complete custom renderer mapping every node type to a React component. HTML renders with a single `dangerouslySetInnerHTML` call behind DOMPurify. This saves 1-2 days of work.
- `editor.getHTML()` produces clean semantic HTML (`<p>`, `<strong>`, `<em>`, `<ul>`, `<ol>`, `<a>`, `<mark>`, `<h2>`, `<h3>`).
- Backward compatibility: the existing `content` field on text blocks, course descriptions, and module descriptions continues to hold a string. Old plain text renders correctly. New rich text renders with formatting. No Firestore schema migration needed.

---

## Execution Rules

Complete each fix in order. Verify independently before proceeding.

### Out-of-Scope Files (DO NOT TOUCH)

- `functions/src/index.ts`, `functions/src/types.ts`
- `firestore.rules`, `storage.rules`
- `src/services/*` — no service layer changes
- `src/contexts/AuthContext.tsx`
- Quiz question text / answer option text (not in scope for this brief)

### Conventions

- Inter font, Lucide icons (strokeWidth={1.75}), clinical emerald palette
- The editor component must be headless-styled to match the existing textarea appearance exactly — white background, gray-300 border, rounded-lg, focus:ring-2 ring-primary-500
- No external CSS imports from TipTap. All styling via Tailwind + a minimal `tiptap-styles.css` file
- `stripUndefined` before all Firestore writes

---

## Complete File Change Manifest

| File Path | Action | Purpose |
|-----------|--------|---------|
| `src/components/ui/RichTextEditor.tsx` | CREATE | Reusable TipTap editor component with toolbar |
| `src/components/ui/RichTextRenderer.tsx` | CREATE | Safe HTML renderer with DOMPurify for player/read views |
| `src/components/ui/RichTextEditorMini.tsx` | CREATE | Compact variant for description fields (no headings, no highlight) |
| `src/styles/tiptap.css` | CREATE | Minimal TipTap content styles (lists, links, headings within editor) |
| `src/components/builder/BlockEditor.tsx` | MODIFY | Replace textarea in `text` case with RichTextEditor |
| `src/components/player/BlockRenderer.tsx` | MODIFY | Replace `whitespace-pre-wrap` div with RichTextRenderer |
| `src/pages/CourseEditor.tsx` | MODIFY | Replace description textarea with RichTextEditorMini |
| `src/pages/CourseManager.tsx` | MODIFY | Replace description textarea in creation modal with RichTextEditorMini |
| `src/pages/ModuleBuilder.tsx` | MODIFY | Replace description textarea with RichTextEditorMini |
| `src/pages/CourseDetail.tsx` | MODIFY | Replace plain text description display with RichTextRenderer |

---

## Fix 1: Install Dependencies

**Estimate:** 5 minutes | **Risk:** None

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit \
  @tiptap/extension-underline @tiptap/extension-highlight \
  @tiptap/extension-link @tiptap/extension-typography \
  @tiptap/extension-placeholder \
  dompurify
npm install -D @types/dompurify
```

### Package Purpose Map

| Package | Purpose | Size Impact |
|---------|---------|-------------|
| `@tiptap/react` | React bindings + core | Core dependency |
| `@tiptap/pm` | ProseMirror peer dependencies | Required peer |
| `@tiptap/starter-kit` | Bold, italic, strike, headings, lists, blockquote, code, history | Bundle includes most formatting |
| `@tiptap/extension-underline` | `<u>` mark support | Tiny (~2KB) |
| `@tiptap/extension-highlight` | `<mark>` with multicolor support | Tiny (~3KB) |
| `@tiptap/extension-link` | `<a>` with auto-link detection | Small (~5KB) |
| `@tiptap/extension-typography` | Smart quotes, em-dashes, ellipsis auto-replace | Tiny (~2KB) |
| `@tiptap/extension-placeholder` | Placeholder text in empty editor | Tiny (~2KB) |
| `dompurify` | HTML sanitization for safe rendering | Small (~15KB) |

### Verification

1. `npm ls @tiptap/react` shows installed version.
2. No build errors after install.
3. No peer dependency warnings.

---

## Fix 2: Create TipTap Content Styles

**Estimate:** 15 minutes | **Files:** 1 new, 1 modified | **Risk:** None

### Step 1: Create `src/styles/tiptap.css`

TipTap is headless — it provides zero default styles. The editor content area needs styles for formatted elements. These styles apply ONLY inside the `.tiptap-content` class scope to avoid leaking into the rest of the application.

```css
/* TipTap editor content styles — scoped to .tiptap-content */

.tiptap-content {
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  line-height: 1.6;
  color: #374151;
}

.tiptap-content:focus {
  outline: none;
}

/* Paragraphs */
.tiptap-content p {
  margin-bottom: 0.75rem;
}
.tiptap-content p:last-child {
  margin-bottom: 0;
}

/* Headings (H2 and H3 only — H1 reserved for page titles) */
.tiptap-content h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  line-height: 1.3;
}
.tiptap-content h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1F2937;
  margin-top: 1rem;
  margin-bottom: 0.375rem;
  line-height: 1.4;
}

/* Lists */
.tiptap-content ul {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin-bottom: 0.75rem;
}
.tiptap-content ol {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin-bottom: 0.75rem;
}
.tiptap-content li {
  margin-bottom: 0.25rem;
}
.tiptap-content li p {
  margin-bottom: 0.125rem;
}

/* Links */
.tiptap-content a {
  color: #0F7B4F;
  text-decoration: underline;
  text-decoration-color: #86E4B6;
  text-underline-offset: 2px;
  cursor: pointer;
}
.tiptap-content a:hover {
  color: #064E2B;
  text-decoration-color: #0F7B4F;
}

/* Highlight (clinical emphasis) */
.tiptap-content mark {
  background-color: #FEF3C7;
  color: #92400E;
  padding: 1px 4px;
  border-radius: 2px;
}
.tiptap-content mark[data-color="red"] {
  background-color: #FEE2E2;
  color: #991B1B;
}
.tiptap-content mark[data-color="green"] {
  background-color: #DCF7E9;
  color: #064E2B;
}
.tiptap-content mark[data-color="blue"] {
  background-color: #DBEAFE;
  color: #1E40AF;
}

/* Blockquote */
.tiptap-content blockquote {
  border-left: 3px solid #E5E7EB;
  padding-left: 1rem;
  color: #6B7280;
  font-style: italic;
  margin: 0.75rem 0;
}

/* Code inline */
.tiptap-content code {
  background-color: #F3F4F6;
  color: #1F2937;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 0.8125rem;
}

/* Horizontal rule */
.tiptap-content hr {
  border: none;
  border-top: 1px solid #E5E7EB;
  margin: 1rem 0;
}

/* Placeholder */
.tiptap-content p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: #9CA3AF;
  pointer-events: none;
  float: left;
  height: 0;
}
```

### Step 2: Import in application entry point

In `src/main.tsx` (or wherever the app's CSS is imported):

```typescript
import './styles/tiptap.css';
```

### Verification

1. The CSS file exists and is imported.
2. No existing styles are affected (all rules scoped to `.tiptap-content`).

---

## Fix 3: Create RichTextEditor Component

**Estimate:** 1.5 hours | **Files:** 1 new | **Risk:** Low

### Create `src/components/ui/RichTextEditor.tsx`

This is the full-featured editor used for text content blocks in ModuleBuilder. It includes headings, highlight colors, and all formatting options.

```typescript
interface RichTextEditorProps {
  content: string;              // HTML string (or plain text — both accepted)
  onChange: (html: string) => void;
  placeholder?: string;
  variant?: 'paragraph' | 'callout-info' | 'callout-warning' | 'callout-critical';
  className?: string;
  minHeight?: string;           // default "120px"
}
```

### Extension Configuration

```typescript
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },      // No H1 (reserved for page titles)
    codeBlock: false,                   // Not needed in clinical training content
  }),
  Underline,
  Highlight.configure({ multicolor: true }),
  Link.configure({
    openOnClick: false,                 // Don't navigate in editor mode
    autolink: true,                     // Auto-detect URLs as you type
    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
  }),
  Typography,                           // Smart quotes, em-dashes, ellipsis
  Placeholder.configure({
    placeholder: ({ node }) =>
      node.type.name === 'heading' ? 'Heading...' : 'Start typing your content here...',
  }),
];
```

### Toolbar Design

The toolbar sits above the editor content area, inside the same bordered container. It replaces the old fake toolbar that was removed in the Course Builder Fixes brief.

**Toolbar layout (single row, grouped by function):**

```
[B] [I] [U] [S] | [H2] [H3] | [UL] [OL] | [Link] [Highlight ▾] | [Undo] [Redo]
```

**Toolbar button spec:**

- Size: `p-1.5`, icon size `h-4 w-4` (Lucide icons)
- Default: `text-gray-500 hover:bg-gray-100 rounded`
- Active (format is applied): `text-primary-700 bg-primary-50`
- Group separator: `w-px h-5 bg-gray-200 mx-1`
- All buttons check `editor.isActive('bold')` etc. for active state
- Keyboard shortcuts work automatically (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Z, Ctrl+Shift+Z)

**Highlight dropdown:**

The highlight button has a small dropdown with 4 color options:
- Yellow (default `<mark>`) — for general emphasis
- Red (`data-color="red"`) — for critical clinical warnings
- Green (`data-color="green"`) — for correct/approved content
- Blue (`data-color="blue"`) — for informational callouts

Each is a small 16x16 circle button in the dropdown. Clicking applies `editor.chain().focus().toggleHighlight({ color }).run()`.

**Link button behavior:**

1. If text is selected and no link exists: prompt for URL via `window.prompt('Enter URL:')`. Apply link.
2. If cursor is inside a link: toggle to remove link.
3. If text is selected and is already a link: remove link.

### BubbleMenu (Selection Toolbar)

Use TipTap's `BubbleMenu` component to show a floating toolbar when text is selected. This provides quick access to the most common formatting without scrolling to the top toolbar.

**BubbleMenu contents:** `[B] [I] [U] [Link] [Highlight]`

The BubbleMenu appears above the selection, has the same button styling as the main toolbar, and uses a white background with `shadow-lg border border-gray-200 rounded-lg p-1`.

### Editor Container Styling

The editor must visually match the existing textarea it replaces:

```
Container: border border-gray-300 rounded-lg bg-white
           focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500
           transition-colors

Toolbar:   border-b border-gray-200 bg-gray-50 rounded-t-lg px-2 py-1.5
           flex items-center gap-0.5 flex-wrap

Content:   [.tiptap-content class applied]
           p-4 min-h-[120px] (or minHeight prop)
           outline-none
```

When `variant` is a callout type, the container gets a left border accent:
- `callout-info`: `border-l-4 border-l-blue-500`
- `callout-warning`: `border-l-4 border-l-amber-500`
- `callout-critical`: `border-l-4 border-l-red-500`

### onChange Debouncing

The editor fires `onUpdate` on every keystroke. Debounce the `onChange` callback to avoid excessive parent re-renders:

```typescript
const editor = useEditor({
  extensions,
  content,
  onUpdate: ({ editor }) => {
    // Debounce: only fire onChange after 300ms of inactivity
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(editor.getHTML());
    }, 300);
  },
});
```

Use a `useRef` for the timeout ID. Clean up in `useEffect` return.

**CRITICAL:** The editor must sync content changes from the parent prop. If the parent updates `content` externally (e.g., on module reload), the editor must update. Use a `useEffect` that calls `editor.commands.setContent(content)` when `content` changes AND differs from `editor.getHTML()`. This prevents infinite loops.

### Verification

1. Render the component standalone with test content.
2. Type text. Bold with Ctrl+B. Confirm `<strong>` tags in output.
3. Type `**bold**` — confirm markdown shortcut auto-formats to bold.
4. Type a URL — confirm it auto-links.
5. Type `"hello"` — confirm smart quotes render as curly quotes.
6. Select text, click highlight, pick red. Confirm `<mark data-color="red">` in output.
7. Click H2 button. Confirm heading renders in editor.
8. Select text. Confirm BubbleMenu appears.
9. Undo/Redo works with Ctrl+Z / Ctrl+Shift+Z.

---

## Fix 4: Create RichTextRenderer Component

**Estimate:** 30 minutes | **Files:** 1 new | **Risk:** Low

### Create `src/components/ui/RichTextRenderer.tsx`

This component safely renders HTML content in read-only contexts (CoursePlayer, CourseDetail, MyGrades).

```typescript
import DOMPurify from 'dompurify';

interface RichTextRendererProps {
  content: string;         // HTML string or plain text
  className?: string;
}

export const RichTextRenderer: React.FC<RichTextRendererProps> = ({
  content,
  className,
}) => {
  // Sanitize HTML to prevent XSS
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'mark', 'code',
      'h2', 'h3', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'data-color', 'class'],
    ADD_ATTR: ['target'],  // Allow target="_blank" on links
  });

  // If content has no HTML tags, wrap in <p> for consistent rendering
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);
  const finalContent = hasHtml ? sanitized : `<p>${sanitized}</p>`;

  return (
    <div
      className={cn('tiptap-content', className)}
      dangerouslySetInnerHTML={{ __html: finalContent }}
    />
  );
};
```

### Key Design Points

- `ALLOWED_TAGS` is a strict whitelist. Only the tags TipTap produces are permitted. Script tags, iframes, forms, etc. are stripped.
- `ALLOWED_ATTR` prevents attribute injection (no `onclick`, `onerror`, etc.).
- Plain text detection: if the content string has no HTML tags (i.e., it's legacy plain text from before the editor), wrap it in `<p>` for consistent styling.
- The `tiptap-content` class applies the same styles used in the editor, so content looks identical in author and reader views.

### Verification

1. Render with HTML content. Confirm formatting displays.
2. Render with plain text (no HTML tags). Confirm it wraps in `<p>` and renders cleanly.
3. Render with `<script>alert('xss')</script>` injected. Confirm script tag is stripped.
4. Render with `<a onclick="alert('xss')" href="safe.html">link</a>`. Confirm `onclick` is stripped, `href` preserved.
5. Links open in new tab (`target="_blank"` with `rel="noopener noreferrer"`).

---

## Fix 5: Create RichTextEditorMini Component

**Estimate:** 30 minutes | **Files:** 1 new | **Risk:** None

### Create `src/components/ui/RichTextEditorMini.tsx`

A compact variant for description fields. No headings, no highlight, shorter min-height. Used for course descriptions and module descriptions.

```typescript
interface RichTextEditorMiniProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;    // Approximate height in textarea-equivalent rows (default 3)
}
```

### Differences from full RichTextEditor

| Feature | Full (text blocks) | Mini (descriptions) |
|---------|-------------------|---------------------|
| Headings | H2, H3 | None |
| Highlight | 4 colors | None |
| BubbleMenu | Yes | No |
| Toolbar | Full | `[B] [I] [U] | [UL] [OL] | [Link]` |
| Min height | 120px | ~72px (3 rows) |
| Placeholder | "Start typing..." | Prop-based |

### Implementation

Reuse the same TipTap core but with a reduced extension set:

```typescript
const miniExtensions = [
  StarterKit.configure({
    heading: false,           // No headings in descriptions
    codeBlock: false,
    blockquote: false,
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
  }),
  Typography,
  Placeholder.configure({ placeholder: placeholder || 'Add a description...' }),
];
```

The toolbar is a single row: `[B] [I] [U] | [UL] [OL] | [Link]` using the same button components as the full editor.

### Verification

1. Render in CourseEditor description field. Confirm compact height.
2. No heading buttons visible.
3. Bold, italic, underline, lists, links all work.
4. Type a URL — auto-links.

---

## Fix 6: Wire into BlockEditor (Text Content Blocks)

**Estimate:** 45 minutes | **Files:** 1 modified | **Risk:** Medium (replaces core authoring surface)

### File: `src/components/builder/BlockEditor.tsx`

In the `text` case of `renderContent()`, replace the plain `<textarea>` with `RichTextEditor`.

### Current Code (to replace)

```tsx
case 'text':
  const textData = block.data as TextBlockData;
  const currentVariant = textData.variant || 'paragraph';
  return (
    <div className="space-y-3">
      {/* Variant selector (Info, Warning, Critical) */}
      <div className="flex gap-2">
        {/* ... variant buttons ... */}
      </div>
      <div className={cn('rounded-md border ...', /* variant classes */)}>
        <textarea
          className="w-full p-4 min-h-[120px] outline-none ..."
          value={textData.content || ''}
          onChange={(e) => handleChange('content', e.target.value)}
          placeholder="Start typing your content here..."
        />
      </div>
    </div>
  );
```

### New Code

```tsx
case 'text':
  const textData = block.data as TextBlockData;
  const currentVariant = textData.variant || 'paragraph';
  return (
    <div className="space-y-3">
      {/* Variant selector (UNCHANGED — keep as-is) */}
      <div className="flex gap-2">
        {/* ... existing variant buttons ... */}
      </div>
      <RichTextEditor
        content={textData.content || ''}
        onChange={(html) => handleChange('content', html)}
        placeholder="Start typing your content here..."
        variant={currentVariant}
        minHeight="120px"
      />
    </div>
  );
```

### Ripple Effect

- The `content` field in `TextBlockData` was a plain string. It remains a string — now it contains HTML instead of plain text.
- The variant selector (paragraph, callout-info, callout-warning, callout-critical) is kept as-is. The `variant` prop is passed to `RichTextEditor` which applies the left-border accent.
- Old plain text content renders correctly because `RichTextEditor` accepts plain text and wraps it appropriately via TipTap's content initialization.

### Verification

1. Open ModuleBuilder. Open an existing module with a text block containing plain text.
2. The plain text should render in the editor with formatting toolbar above.
3. Add bold, italic, a heading. Save. Reload. Formatting persists.
4. Switch variant to "Warning". Left border accent appears on editor container.
5. No Firestore write errors (content is still a string field — now HTML).

---

## Fix 7: Wire into BlockRenderer (CoursePlayer — Read View)

**Estimate:** 30 minutes | **Files:** 1 modified | **Risk:** Low

### File: `src/components/player/BlockRenderer.tsx`

In the text block rendering case, replace the plain `whitespace-pre-wrap` div with `RichTextRenderer`.

### Current Pattern (likely)

```tsx
case 'text':
  return (
    <div className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed">
      {textData.content}
    </div>
  );
```

### New Pattern

```tsx
case 'text':
  return (
    <RichTextRenderer
      content={textData.content || ''}
      className="text-sm leading-relaxed"
    />
  );
```

### Ripple Effect

- Plain text content (pre-editor): `RichTextRenderer` detects no HTML tags and wraps in `<p>`. Renders identically to the old `whitespace-pre-wrap` div.
- Rich text content (post-editor): Renders with formatting. Links are clickable. Headings display.
- DOMPurify sanitizes on every render. Performance is negligible for content-length strings.

### Verification

1. View a course module with old plain text content. Renders correctly.
2. View a module with new rich text content (bold, lists, links). Renders with formatting.
3. Click a link in the content. Opens in new tab.
4. Inspect DOM. No unsanitized attributes or tags.

---

## Fix 8: Wire into Description Fields

**Estimate:** 45 minutes | **Files:** 3 modified | **Risk:** Low

### 8A: CourseEditor.tsx — Course Description

Replace the description `<textarea>` in the metadata panel:

```tsx
// BEFORE:
<textarea
  value={editDescription}
  onChange={(e) => setEditDescription(e.target.value)}
  rows={3}
  className="w-full px-3 py-2 border border-gray-300 ..."
/>

// AFTER:
<RichTextEditorMini
  content={editDescription}
  onChange={(html) => setEditDescription(html)}
  placeholder="Describe what this course covers..."
  rows={3}
/>
```

### 8B: CourseManager.tsx — Creation Modal Description

Replace the description `<textarea>` in the creation modal:

```tsx
// Same pattern as 8A
<RichTextEditorMini
  content={newCourse.description}
  onChange={(html) => setNewCourse({ ...newCourse, description: html })}
  placeholder="Brief course description..."
  rows={3}
/>
```

### 8C: ModuleBuilder.tsx — Module Description

Replace the description `<textarea>` in the module metadata panel:

```tsx
// BEFORE:
<textarea
  value={module.description || ''}
  onChange={(e) => updateModuleMetadata({ description: e.target.value })}
  rows={2}
  ...
/>

// AFTER:
<RichTextEditorMini
  content={module.description || ''}
  onChange={(html) => updateModuleMetadata({ description: html })}
  placeholder="Brief description of what this module covers..."
  rows={2}
/>
```

### 8D: CourseDetail.tsx — Description Display (Read View)

In the course detail page where the description is displayed to students:

```tsx
// BEFORE (likely):
<p className="text-gray-600">{course.description}</p>

// AFTER:
<RichTextRenderer content={course.description || ''} />
```

### Verification

1. CourseEditor: type a description with bold text. Save. Reload. Bold persists.
2. CourseManager: create a course with a formatted description. Opens in CourseEditor. Description preserved.
3. ModuleBuilder: format module description. Save. Reload. Formatting persists.
4. CourseDetail: view a course with a rich description. Formatting displays correctly.
5. View a course with an old plain text description. Renders correctly (no broken HTML).

---

## Ripple Effect Summary

### No Firestore Schema Changes

All `content` and `description` fields were already `string` type in Firestore. They continue to hold strings — now those strings may contain HTML. No security rules changes needed.

### Backward Compatibility

Old plain text content is valid input for both `RichTextEditor` (TipTap accepts plain text) and `RichTextRenderer` (detects absence of HTML tags, wraps in `<p>`). Zero migration required.

### Security

DOMPurify on `RichTextRenderer` is the single enforcement point. The allowed tag/attribute whitelist is strict. Even if malicious HTML were stored in Firestore (e.g., via direct API access), it would be sanitized on render.

### Bundle Size Impact

TipTap core + StarterKit + extensions: ~80-100KB gzipped. DOMPurify: ~15KB gzipped. Total impact: ~115KB. This is acceptable for a content authoring platform.

### Print Stylesheet Compatibility

Rich text content uses standard semantic HTML tags (`<strong>`, `<em>`, `<ul>`, etc.) which render correctly in print without any additional styles.

### No Impact on Grading

Quiz blocks are not affected. Text blocks are not graded. The content field change is purely presentational.

---

## Execution Order Summary

| # | Fix | Estimate | Dependency |
|---|-----|----------|------------|
| 1 | Install dependencies | 5 min | None |
| 2 | TipTap content styles | 15 min | None |
| 3 | RichTextEditor component | 1.5 hrs | Fixes 1, 2 |
| 4 | RichTextRenderer component | 30 min | Fix 1 |
| 5 | RichTextEditorMini component | 30 min | Fix 3 |
| 6 | Wire into BlockEditor | 45 min | Fix 3 |
| 7 | Wire into BlockRenderer | 30 min | Fix 4 |
| 8 | Wire into description fields | 45 min | Fixes 4, 5 |

**Total: ~5 focused hours across 5 new files and 6 modified files.**
