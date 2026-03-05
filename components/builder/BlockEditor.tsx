/**
 * BlockEditor Component — Phase B Integration
 * 
 * What changed from the production version:
 * 
 * 1. IMPORTS: Added QuizQuestion, QuizQuestionType, MatchingPair + new icons (Plus, Minus, Info)
 * 2. NEW FUNCTION: renderQuizQuestionEditor() — extracted, per-question editor with type switching
 * 3. MODIFIED: quiz case in renderContent() — now delegates to renderQuizQuestionEditor
 * 4. MODIFIED: "Add Question" button — new questions default to type: 'multiple-choice'
 * 
 * Everything outside the quiz case is UNCHANGED from production.
 * 
 * @module components/builder/BlockEditor
 */

import React from 'react';
import {
  BlockType,
  ContentBlock,
  QuizBlockData,
  QuizQuestion,
  QuizQuestionType,
  MatchingPair,
  TextBlockData,
  ImageBlockData,
  VideoBlockData,
  CorrectionLogBlockData,
  CorrectionLogEntry,
  ObjSubjValidatorBlockData,
  ObjSubjItem,
} from '../../functions/src/types';
import {
  Trash2, GripVertical, CheckSquare, Image as ImageIcon,
  Type, Video, Hash, Bold, Italic, List, Link as LinkIcon,
  AlertTriangle, Info, AlertOctagon, FileText, Plus, Minus,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../utils';

interface BlockEditorProps {
  block: ContentBlock;
  onChange: (id: string, data: any) => void;
  onDelete: (id: string) => void;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({ block, onChange, onDelete }) => {

  const handleChange = (field: string, value: any) => {
    onChange(block.id, { ...block.data, [field]: value });
  };

  // ============================================
  // RICH TEXT TOOLBAR (unchanged)
  // ============================================

  const renderRichTextToolbar = () => (
    <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 rounded-t-md">
      <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Bold"><Bold className="h-4 w-4" /></button>
      <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Italic"><Italic className="h-4 w-4" /></button>
      <div className="w-px h-4 bg-gray-300 mx-1"></div>
      <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="List"><List className="h-4 w-4" /></button>
      <button className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Link"><LinkIcon className="h-4 w-4" /></button>
    </div>
  );

  // ============================================
  // NEW: Per-Question Editor with Type Switching
  // ============================================

  /**
   * Renders the editor UI for a single quiz question.
   * 
   * Structure:
   *   ┌─────────────────────────────────────────────┐
   *   │ [Q1]  [Type Selector ▾]            [Delete] │  ← Header bar
   *   │                                             │
   *   │ ┌─ Question text textarea ────────────────┐ │  ← Always present
   *   │ └─────────────────────────────────────────┘ │
   *   │                                             │
   *   │ ┌─ Type-specific editor ──────────────────┐ │  ← Switches by q.type
   *   │ │  MC: radio + option inputs               │ │
   *   │ │  TF: True/False radio pair               │ │
   *   │ │  Matching: left/right pair rows           │ │
   *   │ │  Fill-blank: correct answer input         │ │
   *   │ │  Short-answer: rubric textarea            │ │
   *   │ └─────────────────────────────────────────┘ │
   *   └─────────────────────────────────────────────┘
   */
  const renderQuizQuestionEditor = (q: QuizQuestion, qIdx: number, quizData: QuizBlockData) => {

    // Helper: update a single question's fields without touching siblings
    const updateQuestion = (updates: Partial<QuizQuestion>) => {
      const newQuestions = [...quizData.questions];
      newQuestions[qIdx] = { ...q, ...updates };
      handleChange('questions', newQuestions);
    };

    // Helper: remove this question from the array
    const removeQuestion = () => {
      handleChange('questions', quizData.questions.filter((_, idx) => idx !== qIdx));
    };

    return (
      <div key={q.id || qIdx} className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">

        {/* ---- Question Header: Number + Type Selector + Delete ---- */}
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-400">Q{qIdx + 1}</span>

            {/* 
              THIS IS THE KEY ADDITION — the question type selector.
              When the type changes, we re-initialize the answer-specific
              fields so the editor doesn't show stale data from the 
              previous type (e.g. MC options showing on a fill-blank).
            */}
            <select
              className="text-xs font-bold text-primary-600 bg-transparent outline-none border-none p-0 cursor-pointer uppercase"
              value={q.type || 'multiple-choice'}
              onChange={(e) => {
                const newType = e.target.value as QuizQuestionType;

                // Build sensible defaults for the new type.
                // This is the "Pit of Success" — each type starts
                // with exactly the fields it needs, nothing more.
                const defaults: Partial<QuizQuestion> = { type: newType };

                switch (newType) {
                  case 'true-false':
                    defaults.options = ['True', 'False'];
                    defaults.correctAnswer = 0;
                    defaults.matchingPairs = undefined;
                    break;
                  case 'matching':
                    defaults.matchingPairs = [{ left: '', right: '' }];
                    defaults.correctAnswer = [];
                    defaults.options = [];
                    break;
                  case 'fill-blank':
                    defaults.correctAnswer = '';
                    defaults.options = [];
                    defaults.matchingPairs = undefined;
                    break;
                  case 'short-answer':
                    defaults.correctAnswer = '';
                    defaults.options = [];
                    defaults.matchingPairs = undefined;
                    break;
                  case 'multiple-choice':
                  default:
                    defaults.options = ['Option A', 'Option B'];
                    defaults.correctAnswer = 0;
                    defaults.matchingPairs = undefined;
                    break;
                }

                updateQuestion(defaults);
              }}
            >
              <option value="multiple-choice">Multiple Choice</option>
              <option value="true-false">True / False</option>
              <option value="matching">Matching</option>
              <option value="fill-blank">Fill in the Blank</option>
              <option value="short-answer">Short Answer / Essay</option>
            </select>
          </div>

          <button onClick={removeQuestion} className="text-gray-400 hover:text-red-500 p-1 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ---- Question Body ---- */}
        <div className="p-4 space-y-4">

          {/* Question text — always present regardless of type */}
          <textarea
            className="w-full text-sm font-medium border-none focus:ring-0 p-0 resize-none bg-transparent placeholder:text-gray-300 text-gray-900"
            rows={2}
            value={q.question}
            placeholder="Enter the question text..."
            onChange={(e) => updateQuestion({ question: e.target.value })}
          />

          {/* ================================================
              TYPE-SPECIFIC EDITORS
              Each case renders only the controls relevant
              to that question type. No shared state leaks.
              ================================================ */}

          {/* ---- Multiple Choice ---- */}
          {(q.type === 'multiple-choice' || !q.type) && (
            <div className="space-y-2 pl-4 border-l-2 border-gray-100">
              {(q.options || []).map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={q.correctAnswer === oIdx}
                    onChange={() => updateQuestion({ correctAnswer: oIdx })}
                    className="text-primary-600"
                  />
                  <input
                    className="flex-1 text-xs p-1 border-b border-transparent focus:border-primary-300 outline-none text-gray-600"
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...q.options];
                      newOpts[oIdx] = e.target.value;
                      updateQuestion({ options: newOpts });
                    }}
                  />
                  {q.correctAnswer === oIdx && (
                    <span className="text-[10px] font-bold text-green-600 px-1">CORRECT</span>
                  )}
                  <button
                    onClick={() => {
                      const newOpts = q.options.filter((_, idx) => idx !== oIdx);
                      // If we deleted the correct answer, reset to first option
                      const newCorrect = typeof q.correctAnswer === 'number' && q.correctAnswer >= newOpts.length
                        ? 0
                        : q.correctAnswer;
                      updateQuestion({ options: newOpts, correctAnswer: newCorrect });
                    }}
                    className="text-gray-300 hover:text-red-400"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => updateQuestion({ options: [...(q.options || []), 'New Option'] })}
                className="text-[10px] font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Option
              </button>
            </div>
          )}

          {/* ---- True / False ---- */}
          {q.type === 'true-false' && (
            <div className="flex gap-4 pl-4">
              {['True', 'False'].map((label, idx) => (
                <label
                  key={label}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all',
                    q.correctAnswer === idx
                      ? 'bg-green-50 border-green-300 ring-1 ring-green-300'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <input
                    type="radio"
                    checked={q.correctAnswer === idx}
                    onChange={() => updateQuestion({ correctAnswer: idx })}
                    className="text-green-600"
                  />
                  <span className={cn(
                    'text-sm font-medium',
                    q.correctAnswer === idx ? 'text-green-700' : 'text-gray-600'
                  )}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* ---- Matching ---- */}
          {q.type === 'matching' && (
            <div className="space-y-3 pl-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Match Pairs (left → right)
              </p>
              {(q.matchingPairs || []).map((pair, pIdx) => (
                <div key={pIdx} className="flex items-center gap-2">
                  <input
                    className="flex-1 text-xs p-2 bg-gray-50 border border-gray-200 rounded focus:border-primary-300 outline-none"
                    placeholder={`Left ${pIdx + 1}`}
                    value={pair.left}
                    onChange={(e) => {
                      const newPairs = [...(q.matchingPairs || [])];
                      newPairs[pIdx] = { ...pair, left: e.target.value };
                      updateQuestion({ matchingPairs: newPairs });
                    }}
                  />
                  <span className="text-gray-300 text-xs">→</span>
                  <input
                    className="flex-1 text-xs p-2 bg-gray-50 border border-gray-200 rounded focus:border-primary-300 outline-none"
                    placeholder={`Right ${pIdx + 1}`}
                    value={pair.right}
                    onChange={(e) => {
                      const newPairs = [...(q.matchingPairs || [])];
                      newPairs[pIdx] = { ...pair, right: e.target.value };
                      updateQuestion({ matchingPairs: newPairs });
                    }}
                  />
                  <button
                    onClick={() => {
                      const newPairs = (q.matchingPairs || []).filter((_, idx) => idx !== pIdx);
                      updateQuestion({ matchingPairs: newPairs });
                    }}
                    className="text-gray-300 hover:text-red-400"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => updateQuestion({
                  matchingPairs: [...(q.matchingPairs || []), { left: '', right: '' }],
                })}
                className="text-[10px] font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Pair
              </button>
            </div>
          )}

          {/* ---- Fill in the Blank ---- */}
          {q.type === 'fill-blank' && (
            <div className="pl-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                Correct Answer
              </label>
              <input
                className="w-full text-xs p-2 bg-gray-50 border border-gray-200 rounded focus:border-primary-300 outline-none"
                value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
                placeholder="The exact word or phrase the learner must enter..."
                onChange={(e) => updateQuestion({ correctAnswer: e.target.value })}
              />
              <p className="text-[10px] text-gray-400 italic mt-1 flex items-center gap-1">
                <Info className="h-3 w-3" />
                Grading is case-insensitive and trims whitespace.
              </p>
            </div>
          )}

          {/* ---- Short Answer / Essay ---- */}
          {q.type === 'short-answer' && (
            <div className="pl-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Response Guidelines / Rubric
                </label>
                <textarea
                  className="w-full text-xs p-2 bg-gray-50 border border-gray-200 rounded focus:border-primary-300 outline-none min-h-[80px]"
                  value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
                  placeholder="Describe what should be included in the learner's response..."
                  onChange={(e) => updateQuestion({ correctAnswer: e.target.value })}
                />
                <p className="text-[10px] text-gray-400 italic mt-1 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Short answers require manual instructor review. This rubric will be shown to reviewers.
                </p>
              </div>
            </div>
          )}

          {/* ---- Points (always present) ---- */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Points:</span>
            <input
              type="number"
              className="w-16 text-xs p-1 border border-gray-200 rounded text-center font-bold bg-white text-gray-700"
              value={q.points}
              min={1}
              onChange={(e) => updateQuestion({ points: parseInt(e.target.value) || 1 })}
            />
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // MAIN CONTENT RENDERER
  // ============================================

  const renderContent = () => {
    switch (block.type) {
      case 'heading':
        return (
          <div className="space-y-2">
            <input
              type="text"
              className="w-full px-0 py-2 text-2xl font-bold border-b-2 border-gray-100 focus:border-primary-500 outline-none bg-transparent placeholder:text-gray-300 text-gray-900"
              value={(block.data as TextBlockData).content || ''}
              onChange={(e) => handleChange('content', e.target.value)}
              placeholder="Heading Title"
            />
          </div>
        );

      case 'text':
        const textData = block.data as TextBlockData;
        const currentVariant = textData.variant || 'paragraph';

        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              {[
                { id: 'paragraph', icon: FileText, label: 'Text', color: 'bg-gray-100 text-gray-700' },
                { id: 'callout-info', icon: Info, label: 'Info', color: 'bg-blue-100 text-blue-700' },
                { id: 'callout-warning', icon: AlertTriangle, label: 'Warning', color: 'bg-amber-100 text-amber-700' },
                { id: 'callout-critical', icon: AlertOctagon, label: 'Critical', color: 'bg-red-100 text-red-700' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleChange('variant', opt.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                    currentVariant === opt.id
                      ? opt.color
                      : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                  )}
                >
                  <opt.icon className="h-3 w-3" />
                  {opt.label}
                </button>
              ))}
            </div>

            <div className={cn(
              'rounded-md border transition-colors bg-white',
              currentVariant === 'callout-info' && 'border-l-4 border-l-blue-500 border-gray-200',
              currentVariant === 'callout-warning' && 'border-l-4 border-l-amber-500 border-gray-200',
              currentVariant === 'callout-critical' && 'border-l-4 border-l-red-500 border-gray-200',
              currentVariant === 'paragraph' && 'border-gray-300 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500'
            )}>
              {renderRichTextToolbar()}
              <textarea
                className="w-full p-4 min-h-[120px] outline-none resize-y rounded-b-md text-gray-700 text-sm leading-relaxed bg-white"
                value={textData.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Start typing your content here..."
              />
            </div>
          </div>
        );

      case 'image':
        const imgData = block.data as ImageBlockData;
        return (
          <div className="space-y-4">
            <div className="p-6 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 text-center hover:bg-gray-100 transition-colors cursor-pointer group">
              {imgData.url ? (
                <div className="relative">
                  <img src={imgData.url} alt="Preview" className="max-h-64 mx-auto rounded shadow-sm" />
                  <button
                    onClick={() => handleChange('url', '')}
                    className="absolute top-2 right-2 bg-white p-1 rounded-full shadow hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="py-4">
                  <div className="mx-auto h-12 w-12 text-gray-300 group-hover:text-primary-500 transition-colors mb-2">
                    <ImageIcon className="h-full w-full" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Click to upload or drag and drop</p>
                  <p className="text-xs text-gray-500 mt-1">SVG, PNG, JPG or GIF (max. 5MB)</p>
                  <input
                    type="text"
                    placeholder="Or paste image URL..."
                    className="mt-4 w-full max-w-sm text-sm p-2 border rounded text-center bg-white"
                    onChange={(e) => handleChange('url', e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Caption</label>
                <input
                  className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none bg-white text-gray-900"
                  placeholder="Visible below image"
                  value={imgData.caption || ''}
                  onChange={(e) => handleChange('caption', e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Alt Text</label>
                <input
                  className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none bg-white text-gray-900"
                  placeholder="Accessibility description"
                  value={imgData.altText || ''}
                  onChange={(e) => handleChange('altText', e.target.value)}
                />
              </div>
            </div>
          </div>
        );

      case 'video':
        const vidData = block.data as VideoBlockData;
        return (
          <div className="space-y-4">
            {vidData.url && (
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <iframe src={vidData.url} className="w-full h-full" allowFullScreen />
              </div>
            )}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-8">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Title</label>
                <input
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white text-gray-900"
                  value={vidData.title || ''}
                  onChange={(e) => handleChange('title', e.target.value)}
                  placeholder="Video title"
                />
              </div>
              <div className="col-span-4">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Duration (min)</label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white text-gray-900"
                  value={vidData.duration ? vidData.duration / 60 : 0}
                  onChange={(e) => handleChange('duration', parseInt(e.target.value) * 60)}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Embed URL</label>
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm text-primary-600 bg-gray-50"
                value={vidData.url || ''}
                onChange={(e) => handleChange('url', e.target.value)}
                placeholder="https://www.youtube.com/embed/..."
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                Transcript / Summary
                <span className="ml-2 text-gray-400 font-normal normal-case italic">(Recommended for compliance)</span>
              </label>
              <textarea
                className="w-full p-2 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none text-sm h-20 bg-white text-gray-900"
                placeholder="Paste video transcript here..."
                value={vidData.transcript || ''}
                onChange={(e) => handleChange('transcript', e.target.value)}
              />
            </div>
          </div>
        );

      // ============================================
      // QUIZ CASE — MODIFIED FOR PHASE B
      // ============================================
      case 'quiz':
        const quizData = block.data as QuizBlockData;
        return (
          <div className="space-y-4">
            {/* Assessment header — unchanged */}
            <div className="bg-primary-50 p-4 rounded border border-primary-100 flex justify-between items-center">
              <div>
                <h4 className="text-sm font-bold text-primary-900">Assessment Configuration</h4>
                <p className="text-xs text-primary-600">Configure passing requirements for this block</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600 uppercase">Pass Score:</span>
                <input
                  type="number"
                  className="w-16 p-1 text-sm border border-primary-200 rounded text-center font-bold bg-white text-gray-900"
                  value={quizData.passingScore || 80}
                  onChange={(e) => handleChange('passingScore', parseInt(e.target.value))}
                />
                <span className="text-sm font-bold text-gray-400">%</span>
              </div>
            </div>

            {/* Question list — NOW uses renderQuizQuestionEditor */}
            <div className="space-y-4">
              {(quizData.questions || []).map((q, qIdx) =>
                renderQuizQuestionEditor(q, qIdx, quizData)
              )}
            </div>

            {/* Add Question — NOW defaults to type: 'multiple-choice' */}
            <Button
              size="sm"
              variant="outline"
              className="w-full border-dashed border-gray-300 text-gray-500 hover:border-primary-400 hover:text-primary-600"
              onClick={() => {
                const newQ: QuizQuestion = {
                  id: Math.random().toString(),
                  type: 'multiple-choice',
                  question: '',
                  options: ['Option A', 'Option B'],
                  correctAnswer: 0,
                  points: 10,
                };
                handleChange('questions', [...(quizData.questions || []), newQ]);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Question
            </Button>
          </div>
        );

      // ============================================
      // CORRECTION LOG
      // ============================================
      case 'correction_log': {
        const logData = block.data as CorrectionLogBlockData;
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Log Title</label>
              <input
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white text-gray-900"
                value={logData.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="e.g., Patient Assessment Notes"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                Seed Entries ({(logData.entries || []).length})
              </label>
              <p className="text-[10px] text-gray-400 italic mb-2">
                Add initial entries that learners will practice correcting using the single-line-and-initial protocol.
              </p>
              <div className="space-y-2">
                {(logData.entries || []).map((entry, idx) => (
                  <div key={entry.id || idx} className="flex items-start gap-2">
                    <textarea
                      className="flex-1 text-xs p-2 bg-gray-50 border border-gray-200 rounded focus:border-primary-300 outline-none resize-none"
                      rows={2}
                      value={entry.text}
                      placeholder={`Entry ${idx + 1} — e.g., "Patient vitals: BP 120/80, HR 78..."`}
                      onChange={(e) => {
                        const newEntries = [...(logData.entries || [])];
                        newEntries[idx] = { ...entry, text: e.target.value };
                        handleChange('entries', newEntries);
                      }}
                    />
                    <button
                      onClick={() => handleChange('entries', (logData.entries || []).filter((_, i) => i !== idx))}
                      className="text-gray-300 hover:text-red-400 mt-1"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  const newEntry: CorrectionLogEntry = {
                    id: Math.random().toString(36).substr(2, 9),
                    text: '',
                    author: 'Course Author',
                    authorId: 'seed',
                    timestamp: new Date().toISOString(),
                    isOriginal: true,
                  };
                  handleChange('entries', [...(logData.entries || []), newEntry]);
                }}
                className="text-[10px] font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1 mt-2"
              >
                <Plus className="h-3 w-3" /> Add Entry
              </button>
            </div>
          </div>
        );
      }

      // ============================================
      // OBJECTIVE VS. SUBJECTIVE VALIDATOR
      // ============================================
      case 'obj_subj_validator': {
        const objSubjData = block.data as ObjSubjValidatorBlockData;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-8">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Exercise Title</label>
                <input
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white text-gray-900"
                  value={objSubjData.title || ''}
                  onChange={(e) => handleChange('title', e.target.value)}
                  placeholder="e.g., Classify the Clinical Data"
                />
              </div>
              <div className="col-span-4">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Points per Item</label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white text-gray-900 text-center font-bold"
                  value={objSubjData.pointsPerItem || 10}
                  min={1}
                  onChange={(e) => handleChange('pointsPerItem', parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                Items ({(objSubjData.items || []).length})
              </label>
              <div className="space-y-2">
                {(objSubjData.items || []).map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center gap-2">
                    <input
                      className="flex-1 text-xs p-2 bg-gray-50 border border-gray-200 rounded focus:border-primary-300 outline-none"
                      value={item.text}
                      placeholder={`Item ${idx + 1} — e.g., "Patient reports feeling dizzy"`}
                      onChange={(e) => {
                        const newItems = [...(objSubjData.items || [])];
                        newItems[idx] = { ...item, text: e.target.value };
                        handleChange('items', newItems);
                      }}
                    />
                    <select
                      className="text-xs p-2 border border-gray-200 rounded bg-white font-bold"
                      value={item.category}
                      onChange={(e) => {
                        const newItems = [...(objSubjData.items || [])];
                        newItems[idx] = { ...item, category: e.target.value as 'objective' | 'subjective' };
                        handleChange('items', newItems);
                      }}
                    >
                      <option value="objective">Objective</option>
                      <option value="subjective">Subjective</option>
                    </select>
                    <button
                      onClick={() => handleChange('items', (objSubjData.items || []).filter((_, i) => i !== idx))}
                      className="text-gray-300 hover:text-red-400"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  const newItem: ObjSubjItem = {
                    id: Math.random().toString(36).substr(2, 9),
                    text: '',
                    category: 'objective',
                  };
                  handleChange('items', [...(objSubjData.items || []), newItem]);
                }}
                className="text-[10px] font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1 mt-2"
              >
                <Plus className="h-3 w-3" /> Add Item
              </button>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  // ============================================
  // BLOCK SHELL (unchanged)
  // ============================================

  const Icon = {
    heading: Type,
    text: Hash,
    image: ImageIcon,
    video: Video,
    quiz: CheckSquare,
    checklist: CheckSquare,
    correction_log: FileText,
    obj_subj_validator: CheckSquare,
  }[block.type] || Hash;

  return (
    <div className="group border border-gray-200 rounded-lg bg-white shadow-sm transition-all hover:border-primary-300 hover:shadow-md">
      <div className="flex items-center justify-between p-2 pl-4 bg-white border-b border-gray-100 rounded-t-lg">
        <div className="flex items-center gap-3">
          <div className="cursor-move p-1 hover:bg-gray-100 rounded text-gray-300 hover:text-gray-500">
            <GripVertical className="h-4 w-4" />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <Icon className="h-3 w-3" />
            {block.type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1 hover:bg-gray-50 rounded">Settings</button>
          <button onClick={() => onDelete(block.id)} className="p-1.5 text-gray-400 hover:text-critical-500 hover:bg-critical-50 rounded transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-5">
        {renderContent()}
      </div>
    </div>
  );
};