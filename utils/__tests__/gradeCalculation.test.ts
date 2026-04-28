/**
 * Grade Calculation — Unit Tests
 *
 * Covers all 6 quiz question types plus aggregate quiz scoring and
 * Objective-vs-Subjective block grading. These are the highest-value tests
 * in the codebase: a silent regression here means a nurse passes (or fails)
 * a CMS-audited training incorrectly.
 */

import {
  gradeQuestion,
  gradeQuiz,
  gradeQuizBlock,
  isAnswerComplete,
  isQuizComplete,
  gradeObjSubjBlock,
} from '../gradeCalculation';
import type {
  QuizQuestion,
  QuizBlockData,
  ObjSubjValidatorBlockData,
} from '../../functions/src/types';

const mc = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q1',
  type: 'multiple-choice',
  question: 'Which is correct?',
  options: ['A', 'B', 'C', 'D'],
  correctAnswer: 2,
  points: 10,
  ...overrides,
});

const tf = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q-tf',
  type: 'true-false',
  question: 'The sky is blue.',
  options: ['True', 'False'],
  correctAnswer: 0,
  points: 5,
  ...overrides,
});

const fb = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q-fb',
  type: 'fill-blank',
  question: 'Capital of France?',
  options: [],
  correctAnswer: 'Paris',
  points: 5,
  ...overrides,
});

const matching = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q-m',
  type: 'matching',
  question: 'Match terms.',
  options: [],
  correctAnswer: [],
  matchingPairs: [
    { left: 'A', right: '1' },
    { left: 'B', right: '2' },
  ],
  points: 10,
  ...overrides,
});

const shortAnswer = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q-sa',
  type: 'short-answer',
  question: 'Explain handoff procedure.',
  options: [],
  correctAnswer: 'rubric text',
  points: 20,
  ...overrides,
});

const multiAnswer = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q-ma',
  type: 'multiple-answer',
  question: 'Pick all correct.',
  options: ['A', 'B', 'C', 'D'],
  correctAnswer: [0, 2],
  points: 10,
  ...overrides,
});

describe('gradeQuestion — multiple-choice', () => {
  it('awards full points for the correct index', () => {
    const r = gradeQuestion(mc(), 2);
    expect(r.isCorrect).toBe(true);
    expect(r.earnedPoints).toBe(10);
    expect(r.needsManualReview).toBe(false);
  });

  it('awards zero for the wrong index', () => {
    const r = gradeQuestion(mc(), 1);
    expect(r.isCorrect).toBe(false);
    expect(r.earnedPoints).toBe(0);
  });

  it('awards zero for undefined / null answer', () => {
    expect(gradeQuestion(mc(), undefined).earnedPoints).toBe(0);
    expect(gradeQuestion(mc(), null).earnedPoints).toBe(0);
  });
});

describe('gradeQuestion — true-false', () => {
  it('awards full points for correct boolean index', () => {
    expect(gradeQuestion(tf(), 0).isCorrect).toBe(true);
  });

  it('awards zero for incorrect index', () => {
    expect(gradeQuestion(tf(), 1).isCorrect).toBe(false);
  });
});

describe('gradeQuestion — fill-blank', () => {
  it('case-insensitive match earns full credit', () => {
    expect(gradeQuestion(fb(), 'paris').isCorrect).toBe(true);
    expect(gradeQuestion(fb(), 'PARIS').isCorrect).toBe(true);
  });

  it('trims surrounding whitespace before comparison', () => {
    expect(gradeQuestion(fb(), '  Paris  ').isCorrect).toBe(true);
  });

  it('rejects mismatched answers', () => {
    expect(gradeQuestion(fb(), 'London').isCorrect).toBe(false);
    expect(gradeQuestion(fb(), '').isCorrect).toBe(false);
  });

  it('treats non-string answers as empty', () => {
    expect(gradeQuestion(fb(), 42 as unknown).isCorrect).toBe(false);
  });
});

describe('gradeQuestion — matching', () => {
  it('all pairs in correct order → full credit', () => {
    const r = gradeQuestion(matching(), ['1', '2']);
    expect(r.isCorrect).toBe(true);
    expect(r.earnedPoints).toBe(10);
  });

  it('one pair wrong → zero (all-or-nothing)', () => {
    expect(gradeQuestion(matching(), ['1', '3']).earnedPoints).toBe(0);
  });

  it('wrong array length → zero', () => {
    expect(gradeQuestion(matching(), ['1']).earnedPoints).toBe(0);
  });

  it('non-array answer → zero', () => {
    expect(gradeQuestion(matching(), 'string').earnedPoints).toBe(0);
  });
});

describe('gradeQuestion — short-answer', () => {
  it('always flags for manual review', () => {
    const r = gradeQuestion(shortAnswer(), 'A reasonably detailed response with enough words.');
    expect(r.needsManualReview).toBe(true);
    expect(r.isCorrect).toBe(false); // never auto-marked correct
  });

  it('awards provisional credit when answer >= 20 chars', () => {
    const r = gradeQuestion(shortAnswer(), 'this is a long enough response');
    expect(r.earnedPoints).toBe(20);
  });

  it('awards zero when answer is too short', () => {
    expect(gradeQuestion(shortAnswer(), 'too short').earnedPoints).toBe(0);
  });
});

describe('gradeQuestion — multiple-answer (all-or-nothing)', () => {
  it('exact correct set → full credit', () => {
    const r = gradeQuestion(multiAnswer(), [0, 2]);
    expect(r.isCorrect).toBe(true);
    expect(r.earnedPoints).toBe(10);
  });

  it('exact correct set in different order → full credit', () => {
    expect(gradeQuestion(multiAnswer(), [2, 0]).earnedPoints).toBe(10);
  });

  it('partial correct (subset) → zero', () => {
    expect(gradeQuestion(multiAnswer(), [0]).earnedPoints).toBe(0);
  });

  it('extra wrong answer included → zero', () => {
    expect(gradeQuestion(multiAnswer(), [0, 1, 2]).earnedPoints).toBe(0);
  });

  it('no overlap → zero', () => {
    expect(gradeQuestion(multiAnswer(), [1, 3]).earnedPoints).toBe(0);
  });

  it('non-array answer → zero', () => {
    expect(gradeQuestion(multiAnswer(), 0).earnedPoints).toBe(0);
  });
});

describe('gradeQuiz — aggregate scoring', () => {
  it('computes percentage rounded to nearest integer', () => {
    const result = gradeQuiz(
      [mc({ id: 'a', points: 10 }), mc({ id: 'b', points: 20, correctAnswer: 1 })],
      [2, 1],
      80
    );
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.totalPoints).toBe(30);
    expect(result.earnedPoints).toBe(30);
    expect(result.needsReview).toBe(false);
  });

  it('partial credit calculates correct percentage', () => {
    const result = gradeQuiz(
      [mc({ id: 'a' }), mc({ id: 'b', correctAnswer: 0 })],
      [2, 99], // first right, second wrong
      80
    );
    expect(result.score).toBe(50);
    expect(result.passed).toBe(false);
  });

  it('flags needsReview when any short-answer is present', () => {
    const result = gradeQuiz(
      [mc(), shortAnswer()],
      [2, 'an adequate written response with enough characters'],
      80
    );
    expect(result.needsReview).toBe(true);
  });

  it('handles zero-point edge case (no questions)', () => {
    const result = gradeQuiz([], [], 80);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('passing threshold is inclusive', () => {
    // 80% pass threshold, 80% earned → passes
    const result = gradeQuiz(
      [mc({ points: 10 }), mc({ points: 10, correctAnswer: 0 }), mc({ points: 10, correctAnswer: 0 }),
       mc({ points: 10, correctAnswer: 0 }), mc({ points: 10, correctAnswer: 0 })],
      [2, 0, 0, 0, 99],
      80
    );
    expect(result.score).toBe(80);
    expect(result.passed).toBe(true);
  });
});

describe('gradeQuizBlock — convenience wrapper', () => {
  it('uses passingScore from QuizBlockData', () => {
    const data: QuizBlockData = {
      title: 'Module 1 Quiz',
      passingScore: 70,
      questions: [mc({ points: 10 }), mc({ points: 10, correctAnswer: 0 })],
    };
    // 50% correct, threshold 70% → fail
    expect(gradeQuizBlock(data, [2, 99]).passed).toBe(false);
    // 100% correct → pass
    expect(gradeQuizBlock(data, [2, 0]).passed).toBe(true);
  });

  it('falls back to 80 when passingScore undefined', () => {
    const data = {
      title: 'q',
      questions: [mc()],
    } as unknown as QuizBlockData;
    expect(gradeQuizBlock(data, [2]).passed).toBe(true);
  });
});

describe('isAnswerComplete', () => {
  it('multiple-choice: requires defined value', () => {
    expect(isAnswerComplete(mc(), 0)).toBe(true);
    expect(isAnswerComplete(mc(), undefined)).toBe(false);
    expect(isAnswerComplete(mc(), null)).toBe(false);
  });

  it('fill-blank: requires non-empty trimmed string', () => {
    expect(isAnswerComplete(fb(), 'x')).toBe(true);
    expect(isAnswerComplete(fb(), '   ')).toBe(false);
    expect(isAnswerComplete(fb(), '')).toBe(false);
  });

  it('matching: requires array matching pair count with no empties', () => {
    expect(isAnswerComplete(matching(), ['1', '2'])).toBe(true);
    expect(isAnswerComplete(matching(), ['1'])).toBe(false);
    expect(isAnswerComplete(matching(), ['1', ''])).toBe(false);
  });

  it('short-answer: requires >= 20 chars', () => {
    expect(isAnswerComplete(shortAnswer(), 'short')).toBe(false);
    expect(isAnswerComplete(shortAnswer(), 'a'.repeat(20))).toBe(true);
  });

  it('multiple-answer: requires non-empty array', () => {
    expect(isAnswerComplete(multiAnswer(), [0])).toBe(true);
    expect(isAnswerComplete(multiAnswer(), [])).toBe(false);
  });
});

describe('isQuizComplete', () => {
  it('returns true only when every question has a valid answer', () => {
    const qs = [mc(), fb()];
    expect(isQuizComplete(qs, [0, 'paris'])).toBe(true);
    expect(isQuizComplete(qs, [0, ''])).toBe(false);
    expect(isQuizComplete(qs, [undefined, 'paris'])).toBe(false);
  });
});

describe('gradeObjSubjBlock', () => {
  const block: ObjSubjValidatorBlockData = {
    title: 'Categorize observations',
    pointsPerItem: 10,
    items: [
      { id: 'i1', text: 'BP 120/80', category: 'objective' },
      { id: 'i2', text: 'Patient feels anxious', category: 'subjective' },
      { id: 'i3', text: 'Temperature 98.6F', category: 'objective' },
    ],
  };

  it('all correct → 100%', () => {
    const r = gradeObjSubjBlock(
      block,
      { i1: 'objective', i2: 'subjective', i3: 'objective' }
    );
    expect(r.score).toBe(100);
    expect(r.correctItems).toBe(3);
    expect(r.passed).toBe(true);
  });

  it('case-insensitive category match', () => {
    const r = gradeObjSubjBlock(block, { i1: 'OBJECTIVE', i2: 'Subjective', i3: 'objective' });
    expect(r.score).toBe(100);
  });

  it('partial correct counts each item independently', () => {
    const r = gradeObjSubjBlock(
      block,
      { i1: 'objective', i2: 'objective', i3: 'objective' } // i2 wrong
    );
    expect(r.correctItems).toBe(2);
    expect(r.score).toBe(67); // 2/3 → 66.67 → 67
    expect(r.passed).toBe(false);
  });

  it('missing answers count as incorrect', () => {
    const r = gradeObjSubjBlock(block, {});
    expect(r.correctItems).toBe(0);
    expect(r.score).toBe(0);
  });

  it('uses custom passing score', () => {
    const r = gradeObjSubjBlock(
      block,
      { i1: 'objective', i2: 'objective', i3: 'objective' },
      50
    );
    expect(r.passed).toBe(true); // 67 >= 50
  });

  it('zero items → zero score, fail', () => {
    const r = gradeObjSubjBlock({ ...block, items: [] }, {});
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });
});
