import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '../../utils';

interface RichTextRendererProps {
  content: string;
  className?: string;
  // Optional: when provided, clinical-term spans become interactive.
  // The renderer attaches a delegated click handler that resolves the
  // term's data-term-id and calls back with both the id and the anchor
  // element (used to position the popover).
  onTermClick?: (termId: string, anchorEl: HTMLElement) => void;
}

export const RichTextRenderer: React.FC<RichTextRendererProps> = ({
  content,
  className,
  onTermClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'mark', 'code',
      'h2', 'h3', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr', 'span',
    ],
    // data-term-id is a read-only foreign-key reference into the glossary
    // collection. It is never written to innerHTML or evaluated as code.
    ALLOWED_ATTR: ['href', 'target', 'rel', 'data-color', 'class', 'data-term-id', 'data-term'],
    ADD_ATTR: ['target'],
  });

  // If content has no HTML tags, wrap in <p> for consistent rendering
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);
  const finalContent = hasHtml ? sanitized : `<p>${sanitized}</p>`;

  // Delegated click handler for clinical-term spans
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onTermClick) return;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.('.clinical-term') as
        | HTMLElement
        | null;
      if (!target) return;
      const termId = target.getAttribute('data-term-id');
      if (termId) onTermClick(termId, target);
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [onTermClick]);

  return (
    <div
      ref={containerRef}
      className={cn('tiptap-content', className)}
      dangerouslySetInnerHTML={{ __html: finalContent }}
    />
  );
};
