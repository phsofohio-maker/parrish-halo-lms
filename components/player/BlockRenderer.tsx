import React, { useState } from 'react';
import { ContentBlock, TextBlockData, VideoBlockData, ImageBlockData, QuizBlockData, CorrectionLogBlockData, ObjSubjValidatorBlockData } from '../../functions/src/types';

/** Normalize YouTube URLs to embed format for the player iframe */
function normalizeYouTubeUrl(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  if (trimmed.includes('youtube.com/embed/')) return trimmed;
  const watchMatch = trimmed.match(/(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]+)/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  return trimmed;
}
import { cn } from '../../utils';
import { Info, AlertTriangle, AlertOctagon, FileText, ChevronDown, ChevronUp, CheckCircle, Check } from 'lucide-react';
import { CorrectionLogPlayer } from './CorrectionLogPlayer';
import { ObjSubjPlayer } from './ObjSubjPlayer';

interface BlockRendererProps {
  block: ContentBlock;
  onQuizAnswer?: (blockId: string, questionIndex: number, answer: any) => void;
  answers?: Record<string, any[]>; // blockId -> array of answers per question (type varies)
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({ block, onQuizAnswer, answers }) => {
  const [showTranscript, setShowTranscript] = useState(false);

  switch (block.type) {
    case 'heading':
      return (
        <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">
          {(block.data as any).content}
        </h2>
      );

    case 'text':
      const textData = block.data as TextBlockData;
      const variant = textData.variant || 'paragraph';

      if (variant === 'paragraph') {
        return <div className="prose prose-slate max-w-none text-gray-700 mb-6 whitespace-pre-wrap">{textData.content}</div>;
      }

      const styles = {
        'callout-info': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', icon: Info, iconColor: 'text-blue-600' },
        'callout-warning': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', icon: AlertTriangle, iconColor: 'text-amber-600' },
        'callout-critical': { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900', icon: AlertOctagon, iconColor: 'text-red-600' },
      }[variant];

      if (!styles) return null;
      const Icon = styles.icon;

      return (
        <div className={cn("p-4 rounded-lg border flex gap-4 mb-6", styles.bg, styles.border)}>
          <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", styles.iconColor)} />
          <div className={cn("text-sm leading-relaxed font-medium", styles.text)}>
            {textData.content}
          </div>
        </div>
      );

    case 'image':
      const imgData = block.data as ImageBlockData;
      return (
        <div className="mb-8">
          <figure className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
            <img 
              src={imgData.url} 
              alt={imgData.altText || 'Course image'} 
              className="w-full h-auto max-h-[500px] object-contain mx-auto"
            />
          </figure>
          {imgData.caption && (
            <figcaption className="text-center text-xs text-gray-500 mt-2 font-medium">
              {imgData.caption}
            </figcaption>
          )}
        </div>
      );

    case 'video':
      const vidData = block.data as VideoBlockData;
      const embedUrl = normalizeYouTubeUrl(vidData.url);
      return (
        <div className="mb-8">
          <div className="aspect-video w-full rounded-lg overflow-hidden shadow-sm border border-gray-200 bg-black">
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allowFullScreen
              title={vidData.title}
            />
          </div>
          <div className="flex items-center justify-between mt-3 px-1">
             <span className="text-sm font-bold text-gray-700">{vidData.title}</span>
             {vidData.transcript && (
               <button 
                 onClick={() => setShowTranscript(!showTranscript)}
                 className="text-xs font-medium text-primary-600 flex items-center gap-1 hover:text-primary-800"
               >
                 {showTranscript ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>}
                 {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
               </button>
             )}
          </div>
          {showTranscript && vidData.transcript && (
            <div className="mt-2 p-4 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600 leading-relaxed h-32 overflow-y-auto">
              {vidData.transcript}
            </div>
          )}
        </div>
      );

    case 'quiz':
      const quizData = block.data as QuizBlockData;
      const blockAnswers = answers?.[block.id] || [];

      return (
        <div className="my-8 border border-primary-200 rounded-lg overflow-hidden bg-white shadow-sm">
          <div className="bg-primary-50 px-6 py-4 border-b border-primary-100 flex justify-between items-center">
             <h3 className="font-bold text-primary-900 flex items-center gap-2">
               <CheckCircle className="h-5 w-5 text-primary-600" />
               {quizData.title || 'Knowledge Check'}
             </h3>
             <span className="text-xs font-bold text-primary-600 bg-white px-2 py-1 rounded border border-primary-200">
               Pass Score: {quizData.passingScore}%
             </span>
          </div>
          <div className="p-6 space-y-8">
            {(quizData.questions || []).map((q, qIdx) => (
              <div key={q.id || qIdx} className="space-y-3">
                <p className="font-medium text-gray-900 text-sm">
                  <span className="text-gray-400 mr-2">{qIdx + 1}.</span>
                  {q.question}
                </p>

                {/* ---- Multiple Choice ---- */}
                {(q.type === 'multiple-choice' || !q.type) && (
                  <div className="space-y-2 pl-6">
                    {(q.options || []).map((opt, oIdx) => {
                      const isSelected = blockAnswers[qIdx] === oIdx;
                      return (
                        <label
                          key={oIdx}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                            isSelected
                              ? "bg-primary-50 border-primary-500 ring-1 ring-primary-500"
                              : "bg-white border-gray-200 hover:border-primary-300 hover:bg-gray-50"
                          )}
                        >
                          <div className={cn(
                            "h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                            isSelected ? "border-primary-600 bg-primary-600" : "border-gray-300 bg-white"
                          )}>
                            {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </div>
                          <span className={cn("text-sm", isSelected ? "text-primary-900 font-medium" : "text-gray-600")}>
                            {opt}
                          </span>
                          <input
                            type="radio"
                            name={`q-${block.id}-${qIdx}`}
                            className="hidden"
                            onChange={() => onQuizAnswer?.(block.id, qIdx, oIdx)}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* ---- Multiple Answer ---- */}
                {q.type === 'multiple-answer' && (
                  <div className="space-y-2 pl-6">
                    <p className="text-xs text-gray-500 italic">Select all that apply</p>
                    {(q.options || []).map((opt, oIdx) => {
                      const selectedArr: number[] = Array.isArray(blockAnswers[qIdx]) ? blockAnswers[qIdx] : [];
                      const isSelected = selectedArr.includes(oIdx);
                      return (
                        <label
                          key={oIdx}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                            isSelected
                              ? "bg-primary-50 border-primary-500 ring-1 ring-primary-500"
                              : "bg-white border-gray-200 hover:border-primary-300 hover:bg-gray-50"
                          )}
                        >
                          <div className={cn(
                            "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                            isSelected ? "border-primary-600 bg-primary-600" : "border-gray-300 bg-white"
                          )}>
                            {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className={cn("text-sm", isSelected ? "text-primary-900 font-medium" : "text-gray-600")}>
                            {opt}
                          </span>
                          <input
                            type="checkbox"
                            className="hidden"
                            onChange={() => {
                              const newArr = isSelected
                                ? selectedArr.filter(i => i !== oIdx)
                                : [...selectedArr, oIdx];
                              onQuizAnswer?.(block.id, qIdx, newArr);
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* ---- True / False ---- */}
                {q.type === 'true-false' && (
                  <div className="flex gap-4 pl-6">
                    {['True', 'False'].map((label, idx) => {
                      const isSelected = blockAnswers[qIdx] === idx;
                      return (
                        <label
                          key={label}
                          className={cn(
                            "flex items-center gap-3 px-6 py-3 rounded-lg border cursor-pointer transition-all flex-1",
                            isSelected
                              ? "bg-primary-50 border-primary-500 ring-1 ring-primary-500"
                              : "bg-white border-gray-200 hover:border-primary-300 hover:bg-gray-50"
                          )}
                        >
                          <div className={cn(
                            "h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                            isSelected ? "border-primary-600 bg-primary-600" : "border-gray-300 bg-white"
                          )}>
                            {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </div>
                          <span className={cn("text-sm font-medium", isSelected ? "text-primary-900" : "text-gray-600")}>
                            {label}
                          </span>
                          <input
                            type="radio"
                            name={`q-${block.id}-${qIdx}`}
                            className="hidden"
                            onChange={() => onQuizAnswer?.(block.id, qIdx, idx)}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* ---- Fill in the Blank ---- */}
                {q.type === 'fill-blank' && (
                  <div className="pl-6">
                    <input
                      type="text"
                      className={cn(
                        "w-full p-3 rounded-lg border text-sm outline-none transition-all",
                        blockAnswers[qIdx]
                          ? "border-primary-300 bg-primary-50 ring-1 ring-primary-200"
                          : "border-gray-200 bg-white focus:border-primary-400 focus:ring-1 focus:ring-primary-200"
                      )}
                      placeholder="Type your answer here..."
                      value={typeof blockAnswers[qIdx] === 'string' ? blockAnswers[qIdx] : ''}
                      onChange={(e) => onQuizAnswer?.(block.id, qIdx, e.target.value)}
                    />
                  </div>
                )}

                {/* ---- Matching ---- */}
                {q.type === 'matching' && q.matchingPairs && (
                  <div className="pl-6 space-y-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Match each item on the left to its correct pair on the right
                    </p>
                    {q.matchingPairs.map((pair, pIdx) => {
                      const currentAnswers: string[] = Array.isArray(blockAnswers[qIdx]) ? blockAnswers[qIdx] : [];
                      const selectedValue = currentAnswers[pIdx] || '';
                      // Collect all right-side values as dropdown options
                      const rightOptions = q.matchingPairs!.map(p => p.right);

                      return (
                        <div key={pIdx} className="flex items-center gap-3">
                          <div className="flex-1 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-700">
                            {pair.left}
                          </div>
                          <span className="text-gray-300 text-sm shrink-0">→</span>
                          <select
                            className={cn(
                              "flex-1 p-3 rounded-lg border text-sm outline-none transition-all cursor-pointer",
                              selectedValue
                                ? "border-primary-300 bg-primary-50 text-primary-900 ring-1 ring-primary-200"
                                : "border-gray-200 bg-white text-gray-500 focus:border-primary-400"
                            )}
                            value={selectedValue}
                            onChange={(e) => {
                              const newAnswers = [...currentAnswers];
                              // Ensure array is long enough
                              while (newAnswers.length < q.matchingPairs!.length) {
                                newAnswers.push('');
                              }
                              newAnswers[pIdx] = e.target.value;
                              onQuizAnswer?.(block.id, qIdx, newAnswers);
                            }}
                          >
                            <option value="">Select a match...</option>
                            {rightOptions.map((opt, optIdx) => (
                              <option key={optIdx} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ---- Short Answer / Essay ---- */}
                {q.type === 'short-answer' && (() => {
                  const answerText = typeof blockAnswers[qIdx] === 'string' ? blockAnswers[qIdx] : '';
                  const charCount = answerText.length;
                  const meetsMinimum = charCount >= 20;

                  return (
                    <div className="pl-6 space-y-2">
                      <textarea
                        className={cn(
                          "w-full p-3 rounded-lg border text-sm outline-none transition-all resize-y min-h-[120px]",
                          meetsMinimum
                            ? "border-primary-300 bg-primary-50 ring-1 ring-primary-200"
                            : "border-gray-200 bg-white focus:border-primary-400 focus:ring-1 focus:ring-primary-200"
                        )}
                        placeholder="Write your response here (minimum 20 characters)..."
                        value={answerText}
                        onChange={(e) => onQuizAnswer?.(block.id, qIdx, e.target.value)}
                      />
                      <div className="flex justify-between items-center px-1">
                        <p className="text-[10px] text-gray-400 italic flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          This response will be reviewed by an instructor.
                        </p>
                        <span className={cn(
                          "text-xs font-medium",
                          meetsMinimum ? "text-green-600" : "text-gray-400"
                        )}>
                          {charCount}/20 min
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      );

    case 'correction_log':
      return (
        <CorrectionLogPlayer
          blockId={block.id}
          data={block.data as CorrectionLogBlockData}
          onAnswer={(bId, qIdx, answer) => onQuizAnswer?.(bId, qIdx, answer)}
          existingAnswers={answers?.[block.id]?.[0]}
        />
      );

    case 'obj_subj_validator':
      return (
        <ObjSubjPlayer
          blockId={block.id}
          data={block.data as ObjSubjValidatorBlockData}
          onAnswer={(bId, qIdx, answer) => onQuizAnswer?.(bId, qIdx, answer)}
          existingAnswers={answers?.[block.id]?.[0]}
        />
      );

    default:
      return null;
  }
};