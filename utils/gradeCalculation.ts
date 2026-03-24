/**
 * Grade Calculation Utility
 * 
 * Pure functions for scoring all quiz question types.
 * Zero side effects — no Firebase, no state, no audit logging.
 * This is the Single Source of Truth for "how is a question graded?"
 * 
 * Design Principles:
 * - Pure: Same inputs always produce same outputs
 * - Exhaustive: Every QuizQuestionType has an explicit case
 * - Defensive: Handles undefined/null/malformed answers gracefully
 * - Testable: No dependencies beyond the type definitions
 * 
 * Used by:
 * - CoursePlayer.tsx (calculates score before submission)
 * - QuestionTypeVerificationPanel (validates correctness)
 * - Future: Cloud Functions if server-side grading is needed
 * 
 * @module utils/gradeCalculation
 */

import { QuizQuestion, QuizQuestionType, QuizBlockData, ObjSubjValidatorBlockData } from '../functions/src/types';

// ============================================
// RESULT TYPES
// ============================================

/**
 * Result of grading a single question.
 * Carries enough context for audit logging and review workflows.
 */
export interface QuestionGradeResult {
  /** ID of the question that was graded */
  questionId: string;
  /** Type of question for downstream routing */
  type: QuizQuestionType;
  /** Whether the answer was definitively correct (false for short-answer) */
  isCorrect: boolean;
  /** Whether an instructor must manually verify this answer */
  needsManualReview: boolean;
  /** Points awarded (may be provisional for short-answer) */
  earnedPoints: number;
  /** Maximum possible points for this question */
  maxPoints: number;
}

/**
 * Result of grading an entire quiz block.
 * Contains both the aggregate score and per-question breakdown.
 */
export interface QuizGradeResult {
  /** Percentage score (0-100), rounded to nearest integer */
  score: number;
  /** Whether score meets or exceeds the passing threshold */
  passed: boolean;
  /** Whether any question requires instructor review (short-answer) */
  needsReview: boolean;
  /** Per-question results for detailed feedback */
  results: QuestionGradeResult[];
  /** Sum of all question maxPoints */
  totalPoints: number;
  /** Sum of all question earnedPoints */
  earnedPoints: number;
}

// ============================================
// SINGLE QUESTION GRADING
// ============================================

/**
 * Grades a single question against the user's answer.
 * 
 * Grading rules by type:
 * - multiple-choice: Strict equality on numeric index
 * - true-false: Strict equality on numeric index (0=True, 1=False)
 * - fill-blank: Case-insensitive, whitespace-trimmed string comparison
 * - matching: All pairs must match in order (all-or-nothing)
 * - short-answer: Never auto-graded; provisional credit if length >= 20
 * 
 * @param question - The question definition with correctAnswer
 * @param userAnswer - The learner's submitted answer (type varies by question type)
 * @returns QuestionGradeResult with scoring details
 */
export const gradeQuestion = (
  question: QuizQuestion,
  userAnswer: unknown
): QuestionGradeResult => {
  const base: Pick<QuestionGradeResult, 'questionId' | 'type' | 'maxPoints' | 'needsManualReview'> = {
    questionId: question.id,
    type: question.type,
    maxPoints: question.points,
    needsManualReview: false,
  };

  switch (question.type) {
    // ---- Multiple Choice & True/False ----
    // Both use numeric index comparison against correctAnswer
    case 'multiple-choice':
    case 'true-false': {
      const correct = userAnswer === question.correctAnswer;
      return {
        ...base,
        isCorrect: correct,
        earnedPoints: correct ? question.points : 0,
      };
    }

    // ---- Fill in the Blank ----
    // Case-insensitive, whitespace-trimmed string comparison
    case 'fill-blank': {
      const userStr = typeof userAnswer === 'string' ? userAnswer : '';
      const correctStr = String(question.correctAnswer);
      const correct =
        userStr.toLowerCase().trim() === correctStr.toLowerCase().trim();
      return {
        ...base,
        isCorrect: correct,
        earnedPoints: correct ? question.points : 0,
      };
    }

    // ---- Matching ----
    // All-or-nothing: every pair must match in the correct order
    // userAnswer should be string[] where answers[i] matches matchingPairs[i].right
    case 'matching': {
      const pairs = question.matchingPairs || [];
      const answers: string[] = Array.isArray(userAnswer)
        ? (userAnswer as string[])
        : [];

      // Must have same length and every pair must match
      const allCorrect =
        pairs.length > 0 &&
        answers.length === pairs.length &&
        pairs.every((pair, idx) => pair.right === answers[idx]);

      return {
        ...base,
        isCorrect: allCorrect,
        earnedPoints: allCorrect ? question.points : 0,
      };
    }

    // ---- Multiple Answer ----
    // All-or-nothing: student must select exactly the correct set of options
    case 'multiple-answer': {
      const correctSet = new Set(
        Array.isArray(question.correctAnswer) ? (question.correctAnswer as number[]) : []
      );
      const userSet = new Set(
        Array.isArray(userAnswer) ? (userAnswer as number[]) : []
      );
      const allCorrect =
        correctSet.size > 0 &&
        userSet.size === correctSet.size &&
        [...correctSet].every(idx => userSet.has(idx));
      return {
        ...base,
        isCorrect: allCorrect,
        earnedPoints: allCorrect ? question.points : 0,
      };
    }

    // ---- Short Answer / Essay ----
    // Cannot be auto-graded. Awards provisional credit if answer has substance.
    // Always flagged for manual instructor review.
    case 'short-answer': {
      const hasSubstance =
        typeof userAnswer === 'string' && userAnswer.length >= 20;
      return {
        ...base,
        isCorrect: false, // Never auto-marked correct
        needsManualReview: true,
        earnedPoints: hasSubstance ? question.points : 0,
      };
    }

    // ---- Exhaustive fallback ----
    // If a new question type is added to the union but not handled here,
    // TypeScript's exhaustive check won't catch it at runtime.
    // This default ensures zero points rather than a crash.
    default: {
      const _exhaustiveCheck: never = question.type;
      console.warn(
        `[gradeCalculation] Unhandled question type: ${question.type}. ` +
        `Add a case to gradeQuestion() for this type.`
      );
      return {
        ...base,
        isCorrect: false,
        needsManualReview: false,
        earnedPoints: 0,
      };
    }
  }
};

// ============================================
// FULL QUIZ GRADING
// ============================================

/**
 * Grades an entire quiz by scoring each question and aggregating.
 * 
 * @param questions - Array of quiz questions
 * @param answers - Array of user answers, positionally matched to questions
 * @param passingScore - Minimum percentage to pass (e.g., 80)
 * @returns QuizGradeResult with aggregate and per-question details
 */
export const gradeQuiz = (
  questions: QuizQuestion[],
  answers: unknown[],
  passingScore: number
): QuizGradeResult => {
  const results = questions.map((q, idx) => gradeQuestion(q, answers[idx]));

  const totalPoints = results.reduce((sum, r) => sum + r.maxPoints, 0);
  const earnedPoints = results.reduce((sum, r) => sum + r.earnedPoints, 0);
  const score =
    totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const needsReview = results.some((r) => r.needsManualReview);

  return {
    score,
    passed: score >= passingScore,
    needsReview,
    results,
    totalPoints,
    earnedPoints,
  };
};

/**
 * Grades a QuizBlockData directly (convenience wrapper).
 * Extracts questions and passingScore from the block data.
 * 
 * @param quizData - The quiz block's data payload
 * @param answers - Array of user answers
 * @param fallbackPassingScore - Used if quizData.passingScore is undefined
 * @returns QuizGradeResult
 */
export const gradeQuizBlock = (
  quizData: QuizBlockData,
  answers: unknown[],
  fallbackPassingScore: number = 80
): QuizGradeResult => {
  return gradeQuiz(
    quizData.questions,
    answers,
    quizData.passingScore ?? fallbackPassingScore
  );
};

// ============================================
// ANSWER VALIDATION
// ============================================

/**
 * Checks whether a user has provided a valid answer for a given question type.
 * Used by the player UI to determine if the submit button should be enabled.
 * 
 * @param question - The question to validate against
 * @param answer - The user's current answer
 * @returns true if the answer is sufficient for submission
 */
export const isAnswerComplete = (
  question: QuizQuestion,
  answer: unknown
): boolean => {
  switch (question.type) {
    case 'multiple-choice':
    case 'true-false':
      return answer !== undefined && answer !== null;

    case 'fill-blank':
      return typeof answer === 'string' && answer.trim().length > 0;

    case 'matching': {
      const pairs = question.matchingPairs || [];
      if (!Array.isArray(answer)) return false;
      const arr = answer as string[];
      return (
        arr.length === pairs.length && arr.every((v) => typeof v === 'string' && v.length > 0)
      );
    }

    case 'short-answer':
      return typeof answer === 'string' && answer.length >= 20;

    case 'multiple-answer':
      return Array.isArray(answer) && (answer as number[]).length > 0;

    default:
      return false;
  }
};

/**
 * Checks whether all questions in a quiz have complete answers.
 * 
 * @param questions - Array of quiz questions
 * @param answers - Array of user answers, positionally matched
 * @returns true if every question has a valid answer
 */
export const isQuizComplete = (
  questions: QuizQuestion[],
  answers: unknown[]
): boolean => {
  return questions.every((q, idx) => isAnswerComplete(q, answers[idx]));
};

// ============================================
// OBJECTIVE VS. SUBJECTIVE GRADING
// ============================================

export interface ObjSubjItemResult {
  itemId: string;
  text: string;
  correctCategory: string;
  userCategory: string;
  isCorrect: boolean;
  earnedPoints: number;
  maxPoints: number;
}

export interface ObjSubjGradeResult {
  score: number;
  passed: boolean;
  totalItems: number;
  correctItems: number;
  earnedPoints: number;
  maxPoints: number;
  itemResults: ObjSubjItemResult[];
}

/**
 * Grades an Objective vs. Subjective Validator block.
 *
 * Each item is all-or-nothing: full points if the learner's
 * categorization matches the correct answer, zero otherwise.
 *
 * @param data - The block's data containing items and pointsPerItem
 * @param userAnswers - Record<itemId, 'objective' | 'subjective'>
 * @param passingScore - Minimum percentage to pass (default 80)
 */
export const gradeObjSubjBlock = (
  data: ObjSubjValidatorBlockData,
  userAnswers: Record<string, string>,
  passingScore: number = 80
): ObjSubjGradeResult => {
  const items = data.items || [];
  const pointsPerItem = data.pointsPerItem || 10;

  const itemResults: ObjSubjItemResult[] = items.map(item => {
    const userCategory = userAnswers[item.id] || '';
    const isCorrect = userCategory.toLowerCase() === item.category.toLowerCase();
    return {
      itemId: item.id,
      text: item.text,
      correctCategory: item.category,
      userCategory,
      isCorrect,
      earnedPoints: isCorrect ? pointsPerItem : 0,
      maxPoints: pointsPerItem,
    };
  });

  const maxPoints = items.length * pointsPerItem;
  const earnedPoints = itemResults.reduce((sum, r) => sum + r.earnedPoints, 0);
  const correctItems = itemResults.filter(r => r.isCorrect).length;
  const score = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0;

  return {
    score,
    passed: score >= passingScore,
    totalItems: items.length,
    correctItems,
    earnedPoints,
    maxPoints,
    itemResults,
  };
};