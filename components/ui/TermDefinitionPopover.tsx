import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { GlossaryTerm, getTerm } from '../../services/glossaryService';

interface TermDefinitionPopoverProps {
  termId: string;
  courseId: string;
  anchorEl: HTMLElement;
  onClose: () => void;
  termsCache: Map<string, GlossaryTerm>;
}

export const TermDefinitionPopover: React.FC<TermDefinitionPopoverProps> = ({
  termId,
  courseId,
  anchorEl,
  onClose,
  termsCache,
}) => {
  const cached = termsCache.get(termId) ?? null;
  const [term, setTerm] = useState<GlossaryTerm | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Position relative to the anchor element
  useEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const popoverWidth = 256; // matches w-64
    const top = rect.top > 160 ? rect.top - 8 : rect.bottom + 8;
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - popoverWidth - 8)
    );
    setPosition({ top, left });
  }, [anchorEl]);

  // Fetch term if not cached
  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    getTerm(courseId, termId)
      .then(t => {
        if (cancelled) return;
        setTerm(t);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [termId, courseId, cached]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handlePointer = (e: MouseEvent) => {
      const node = containerRef.current;
      if (!node) return;
      const target = e.target as Node;
      if (node.contains(target)) return;
      if (anchorEl.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [anchorEl, onClose]);

  return (
    <div
      ref={containerRef}
      role="tooltip"
      aria-label={term?.term ?? 'Clinical term'}
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }}
      className="w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <BookOpen className="h-3.5 w-3.5 text-primary-600 shrink-0" strokeWidth={1.75} />
          <span className="text-sm font-medium text-primary-700 truncate">
            {loading ? '…' : term?.term ?? 'Term'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-0.5 rounded shrink-0"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
      <div className="text-xs text-gray-600 leading-relaxed">
        {loading ? (
          <span className="animate-pulse bg-gray-100 rounded h-3 block w-full" />
        ) : (
          term?.definition ?? 'Definition unavailable.'
        )}
      </div>
    </div>
  );
};
