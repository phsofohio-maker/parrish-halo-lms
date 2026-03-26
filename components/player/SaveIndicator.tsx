import React, { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { cn } from '../../utils';

export type SaveStatus = 'idle' | 'saving' | 'saved';

interface SaveIndicatorProps {
  status: SaveStatus;
  savedAt?: string | null;
}

export const SaveIndicator: React.FC<SaveIndicatorProps> = ({ status, savedAt }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === 'saving' || status === 'saved') {
      setVisible(true);
    }
    if (status === 'saved') {
      const timer = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (!visible) return null;

  const timeLabel = savedAt
    ? new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs transition-opacity duration-300',
        status === 'saving' ? 'text-gray-400' : 'text-green-600',
        !visible && 'opacity-0'
      )}
    >
      {status === 'saving' ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Saving...</span>
        </>
      ) : (
        <>
          <Check className="h-3 w-3" />
          <span>Saved{timeLabel ? ` at ${timeLabel}` : ''}</span>
        </>
      )}
    </div>
  );
};
