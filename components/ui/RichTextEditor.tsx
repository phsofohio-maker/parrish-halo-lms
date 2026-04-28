import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading2, Heading3, List, ListOrdered, Link as LinkIcon,
  Highlighter, Undo2, Redo2, BookOpen, X,
} from 'lucide-react';
import { cn } from '../../utils';
import { ClinicalTerm } from './ClinicalTermExtension';
import {
  createTerm as createGlossaryTerm,
  updateTerm as updateGlossaryTerm,
  getTerm as getGlossaryTerm,
  GlossaryTerm,
} from '../../services/glossaryService';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  variant?: 'paragraph' | 'callout-info' | 'callout-warning' | 'callout-critical';
  className?: string;
  minHeight?: string;
  // Optional — when provided, enables the "Define Term" BubbleMenu action
  // and binds new term definitions to the given course.
  courseId?: string;
  actorId?: string;
  actorName?: string;
}

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', color: undefined, bg: '#FEF3C7', ring: 'ring-amber-400' },
  { name: 'Red', color: 'red', bg: '#FEE2E2', ring: 'ring-red-400' },
  { name: 'Green', color: 'green', bg: '#DCF7E9', ring: 'ring-green-400' },
  { name: 'Blue', color: 'blue', bg: '#DBEAFE', ring: 'ring-blue-400' },
];

function ToolbarButton({
  onClick,
  active = false,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded transition-colors',
        active
          ? 'text-primary-700 bg-primary-50'
          : 'text-gray-500 hover:bg-gray-100'
      )}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
  placeholder = 'Start typing your content here...',
  variant = 'paragraph',
  className,
  minHeight = '120px',
  courseId,
  actorId,
  actorName,
}) => {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [showTermModal, setShowTermModal] = useState(false);

  const termsEnabled = Boolean(courseId && actorId);

  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Typography,
      ClinicalTerm,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === 'heading' ? 'Heading...' : placeholder,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange(editor.getHTML());
      }, 300);
    },
  });

  // Sync content from parent when it changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Close highlight dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) {
        setHighlightOpen(false);
      }
    };
    if (highlightOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [highlightOpen]);

  if (!editor) return null;

  const handleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const handleHighlight = (color?: string) => {
    if (color) {
      editor.chain().focus().toggleHighlight({ color } as any).run();
    } else {
      editor.chain().focus().toggleHighlight().run();
    }
    setHighlightOpen(false);
  };

  return (
    <div
      className={cn(
        'border rounded-lg bg-white transition-colors',
        'focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500',
        variant === 'callout-info' && 'border-l-4 border-l-blue-500 border-gray-200',
        variant === 'callout-warning' && 'border-l-4 border-l-amber-500 border-gray-200',
        variant === 'callout-critical' && 'border-l-4 border-l-red-500 border-gray-200',
        variant === 'paragraph' && 'border-gray-300',
        className
      )}
    >
      {/* Toolbar */}
      <div className="border-b border-gray-200 bg-gray-50 rounded-t-lg px-2 py-1.5 flex items-center gap-0.5 flex-wrap">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={handleLink}
          active={editor.isActive('link')}
          title="Link"
        >
          <LinkIcon className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>

        {/* Highlight with dropdown */}
        <div className="relative" ref={highlightRef}>
          <ToolbarButton
            onClick={() => setHighlightOpen(!highlightOpen)}
            active={editor.isActive('highlight')}
            title="Highlight"
          >
            <Highlighter className="h-4 w-4" strokeWidth={1.75} />
          </ToolbarButton>
          {highlightOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1.5 z-50">
              {HIGHLIGHT_COLORS.map((h) => (
                <button
                  key={h.name}
                  type="button"
                  onClick={() => handleHighlight(h.color)}
                  title={h.name}
                  className={cn(
                    'w-5 h-5 rounded-full border border-gray-300 transition-transform hover:scale-110',
                    editor.isActive('highlight', h.color ? { color: h.color } : {}) && 'ring-2 ring-offset-1'
                  )}
                  style={{ backgroundColor: h.bg }}
                />
              ))}
            </div>
          )}
        </div>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" strokeWidth={1.75} />
        </ToolbarButton>
      </div>

      {/* BubbleMenu */}
      {editor && (
        <BubbleMenu
          editor={editor}
          className="bg-white shadow-lg border border-gray-200 rounded-lg p-1 flex items-center gap-0.5"
        >
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
          >
            <Bold className="h-4 w-4" strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
          >
            <Italic className="h-4 w-4" strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
          >
            <UnderlineIcon className="h-4 w-4" strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton onClick={handleLink} active={editor.isActive('link')}>
            <LinkIcon className="h-4 w-4" strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive('highlight')}
          >
            <Highlighter className="h-4 w-4" strokeWidth={1.75} />
          </ToolbarButton>
          {termsEnabled && (
            <>
              <Separator />
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
        </BubbleMenu>
      )}

      {/* Editor Content */}
      <EditorContent
        editor={editor}
        className="tiptap-content p-4 outline-none"
        style={{ minHeight }}
      />

      {/* Define Term modal */}
      {showTermModal && termsEnabled && courseId && actorId && (
        <DefineTermModal
          editor={editor}
          courseId={courseId}
          actorId={actorId}
          actorName={actorName ?? ''}
          onClose={() => setShowTermModal(false)}
        />
      )}
    </div>
  );
};

// ============================================
// Define Term Modal
// Inline component — opens from the BubbleMenu when an author selects
// text and clicks "Define Term". Writes a glossary term to Firestore
// and applies the ClinicalTerm mark to the selected range.
// ============================================

interface DefineTermModalProps {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  courseId: string;
  actorId: string;
  actorName: string;
  onClose: () => void;
}

const DefineTermModal: React.FC<DefineTermModalProps> = ({
  editor,
  courseId,
  actorId,
  actorName,
  onClose,
}) => {
  const existingAttrs = editor.getAttributes('clinicalTerm') as
    | { termId?: string; term?: string }
    | undefined;
  const isEditing = Boolean(existingAttrs?.termId);

  const initialTerm = (() => {
    if (existingAttrs?.term) return existingAttrs.term;
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, ' ').trim();
  })();

  const [termValue, setTermValue] = useState(initialTerm);
  const [definitionValue, setDefinitionValue] = useState('');
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing || !existingAttrs?.termId) {
      setLoadingExisting(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const existing = await getGlossaryTerm(courseId, existingAttrs.termId!);
        if (!cancelled && existing) {
          setTermValue(existing.term);
          setDefinitionValue(existing.definition);
        }
      } catch {
        // ignore — modal stays editable
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditing, existingAttrs?.termId, courseId]);

  const handleSave = async () => {
    if (!termValue.trim() || !definitionValue.trim()) {
      setError('Term and definition are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let termId = existingAttrs?.termId;
      if (isEditing && termId) {
        await updateGlossaryTerm(
          courseId,
          termId,
          { term: termValue.trim(), definition: definitionValue.trim() },
          actorId,
          actorName
        );
      } else {
        termId = await createGlossaryTerm(
          courseId,
          termValue.trim(),
          definitionValue.trim(),
          actorId,
          actorName
        );
      }
      editor
        .chain()
        .focus()
        .setClinicalTerm({ termId, term: termValue.trim() })
        .run();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save term.');
    } finally {
      setSaving(false);
    }
  };

  // Escape key closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30"
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-lg border border-gray-200 shadow-lg p-4 w-80"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-primary-600" strokeWidth={1.75} />
            <span className="text-sm font-semibold text-gray-800">
              {isEditing ? 'Edit Clinical Term' : 'Define Clinical Term'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
            title="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">
              Term
            </label>
            <input
              type="text"
              value={termValue}
              onChange={(e) => setTermValue(e.target.value)}
              className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none bg-white text-gray-900"
              disabled={loadingExisting || saving}
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">
              Definition
            </label>
            <textarea
              value={definitionValue}
              onChange={(e) => setDefinitionValue(e.target.value)}
              rows={4}
              className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none bg-white text-gray-900 resize-none"
              disabled={loadingExisting || saving}
              placeholder="1–3 sentences of plain text…"
            />
          </div>
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="text-xs px-3 py-1.5 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={loadingExisting || saving}
            >
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Term'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Re-export type for parent components that want it.
export type { GlossaryTerm };
