/**
 * Correction Log Player Component
 *
 * Implements the medical "single-line-and-initial" correction protocol.
 * When a learner corrects a saved entry:
 *   - Original text gets strikethrough (never deleted)
 *   - Correction appears below with timestamp + user initials
 *   - Entries are immutable once saved — corrections are additive only
 *
 * CMS audit requirement: all corrections must be traceable.
 *
 * @module components/player/CorrectionLogPlayer
 */

import React, { useState } from 'react';
import { CorrectionLogBlockData, CorrectionLogEntry } from '../../functions/src/types';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../utils';
import { Pencil, X, Check, FileText, Clock } from 'lucide-react';

interface CorrectionLogPlayerProps {
  blockId: string;
  data: CorrectionLogBlockData;
  onAnswer: (blockId: string, questionIndex: number, answer: any) => void;
  existingAnswers?: CorrectionLogEntry[];
}

const getInitials = (name: string): string => {
  return name
    .split(/[\s,]+/)
    .filter(part => part.length > 0 && !['RN', 'CNA', 'LPN', 'MSW', 'CHPNA', 'Dr.'].includes(part))
    .map(part => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
};

export const CorrectionLogPlayer: React.FC<CorrectionLogPlayerProps> = ({
  blockId,
  data,
  onAnswer,
  existingAnswers,
}) => {
  const { user } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');

  // Merge seed entries with any corrections the learner has already made
  const allEntries: CorrectionLogEntry[] = existingAnswers && existingAnswers.length > 0
    ? existingAnswers
    : data.entries || [];

  const handleStartCorrection = (entryId: string) => {
    setEditingId(entryId);
    setCorrectionText('');
  };

  const handleCancelCorrection = () => {
    setEditingId(null);
    setCorrectionText('');
  };

  const handleSubmitCorrection = () => {
    if (!correctionText.trim() || !editingId || !user) return;

    const correction: CorrectionLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      text: correctionText.trim(),
      author: user.displayName,
      authorId: user.uid,
      timestamp: new Date().toISOString(),
      isOriginal: false,
      supersedes: editingId,
    };

    const updated = [...allEntries, correction];
    onAnswer(blockId, 0, updated);

    setEditingId(null);
    setCorrectionText('');
  };

  // Group corrections by their supersedes target
  const correctionsFor = (entryId: string): CorrectionLogEntry[] =>
    allEntries.filter(e => e.supersedes === entryId);

  const originalEntries = allEntries.filter(e => e.isOriginal);
  const hasCorrections = allEntries.some(e => !e.isOriginal);

  return (
    <div className="my-8 border border-red-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
        <h3 className="font-bold text-red-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-red-600" />
          {data.title || 'Correction Log'}
        </h3>
        <span className="text-xs font-bold text-red-600 bg-white px-2 py-1 rounded border border-red-200">
          Single-Line-and-Initial Protocol
        </span>
      </div>

      <div className="p-6 space-y-4">
        <p className="text-xs text-gray-500 italic mb-4">
          Click the pencil icon next to an entry to practice making a correction. Original text will be struck through and your correction appended with your initials and a timestamp.
        </p>

        {originalEntries.map(entry => {
          const corrections = correctionsFor(entry.id);
          const isSuperseded = corrections.length > 0;

          return (
            <div key={entry.id} className="border border-gray-200 rounded-lg p-4">
              {/* Original entry */}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className={cn(
                    "text-sm leading-relaxed",
                    isSuperseded ? "line-through text-gray-400" : "text-gray-700"
                  )}>
                    {entry.text}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {entry.author} &middot; {new Date(entry.timestamp).toLocaleString()}
                  </p>
                </div>
                {!isSuperseded && editingId !== entry.id && (
                  <button
                    onClick={() => handleStartCorrection(entry.id)}
                    className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors shrink-0"
                    title="Correct this entry"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Corrections */}
              {corrections.map(corr => (
                <div key={corr.id} className="mt-3 pl-4 border-l-2 border-red-300">
                  <p className="text-sm text-gray-800 leading-relaxed">{corr.text}</p>
                  <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Corrected by {getInitials(corr.author)} &middot; {new Date(corr.timestamp).toLocaleString()}
                  </p>
                </div>
              ))}

              {/* Inline correction editor */}
              {editingId === entry.id && (
                <div className="mt-3 pl-4 border-l-2 border-primary-300 space-y-2">
                  <textarea
                    className="w-full text-sm p-3 border border-primary-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-400 resize-none bg-primary-50"
                    rows={3}
                    value={correctionText}
                    onChange={(e) => setCorrectionText(e.target.value)}
                    placeholder="Enter the corrected text..."
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={handleCancelCorrection}
                      className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button
                      onClick={handleSubmitCorrection}
                      disabled={!correctionText.trim()}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> Submit Correction
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {hasCorrections && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700 flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            You have made corrections to this log. Original entries are preserved with strikethrough per CMS compliance protocol.
          </div>
        )}
      </div>
    </div>
  );
};
