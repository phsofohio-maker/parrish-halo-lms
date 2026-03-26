/**
 * Course Player Page
 *
 * Integrates with Firestore for:
 * - Enrollment verification
 * - Progress tracking per block
 * - Quiz attempt recording
 * - Grade persistence
 * - Draft answer auto-save (Fix 1.1)
 * - Unsaved work warning (Fix 1.2)
 * - Content block read-tracking (Fix 1.3)
 * - Save status indicator (Fix 2.1)
 * - Module-to-module navigation (Fix 2.3)
 * - Estimated duration display (Fix 2.4)
 * - Quiz attempt visibility (Fix 3.1)
 * - Completion receipt screen (Fix 3.3)
 *
 * @module pages/CoursePlayer
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Module, QuizBlockData, ContentBlock, ObjSubjValidatorBlockData, CorrectionLogEntry, CourseGradeCalculation } from '../functions/src/types';
import { BlockRenderer } from '../components/player/BlockRenderer';
import { SaveIndicator, SaveStatus } from '../components/player/SaveIndicator';
import { Button } from '../components/ui/Button';
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Award,
  Loader2,
  Lock,
  BookOpen,
  ChevronRight,
  Clock,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '../utils';
import { gradeQuiz, gradeObjSubjBlock } from '../utils/gradeCalculation';

// Hooks
import { useEnrollment } from '../hooks/useUserEnrollments';
import { useModuleProgress } from '../hooks/useModuleProgress';
import { useMyGrade } from '../hooks/useGrade';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { QuizQuestion } from '../functions/src/types';

// Services
import { getModuleWithBlocks, getModules } from '../services/courseService';
import { enterGrade } from '../services/gradeService';
import { calculateAndSaveCourseGrade, getSavedCourseGrade } from '../services/courseGradeService';
import { saveDraftAnswers, loadDraftAnswers, clearDraftAnswers } from '../services/progressService';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { auditService } from '../services/auditService';
import { LicenseGate } from '../components/clinical/LicenseGate';
import { checkAvailability } from '../utils/availabilityUtils';

interface CoursePlayerProps {
  courseId: string;
  moduleId: string;
  courseCategory?: string;
  onBack: () => void;
  onNavigate?: (path: string, context?: Record<string, any>) => void;
}

export const CoursePlayer: React.FC<CoursePlayerProps> = ({
  courseId,
  moduleId,
  courseCategory,
  onBack,
  onNavigate,
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();

  // Module data state
  const [moduleData, setModuleData] = useState<Module | null>(null);
  const [isLoadingModule, setIsLoadingModule] = useState(true);
  const [moduleError, setModuleError] = useState<string | null>(null);

  // All modules in course (for Fix 2.3: module-to-module navigation)
  const [allModules, setAllModules] = useState<Module[]>([]);

  // Quiz answers (local state, auto-saved to Firestore)
  const [answers, setAnswers] = useState<Record<string, any[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fix 1.1: Draft save state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const lastSavedRef = useRef<string>('');
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);

  // Fix 1.2: Unsaved work confirmation dialog
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // Fix 3.3: Course completion receipt
  const [courseGrade, setCourseGrade] = useState<CourseGradeCalculation | null>(null);
  const [showCourseComplete, setShowCourseComplete] = useState(false);

  // Fix 1.3: IntersectionObserver refs
  const observedBlocksRef = useRef<Set<string>>(new Set());
  const blockTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Hooks for persistent data
  const {
    enrollment,
    isEnrolled,
    isLoading: enrollmentLoading,
    enroll
  } = useEnrollment(courseId);

  const {
    progress,
    completionPercent,
    isComplete: moduleComplete,
    completeBlock,
    submitQuiz,
    isLoading: progressLoading
  } = useModuleProgress(courseId, moduleId);

  const {
    grade,
    isPassed,
    competencyLevel,
    isLoading: gradeLoading
  } = useMyGrade(moduleId);

  // ============================================
  // MODULE LOADING
  // ============================================

  useEffect(() => {
    const loadModule = async () => {
      if (!courseId || !moduleId) return;

      setIsLoadingModule(true);
      setModuleError(null);

      try {
        const [data, modules] = await Promise.all([
          getModuleWithBlocks(courseId, moduleId),
          getModules(courseId),
        ]);

        if (!data) {
          setModuleError('Module not found');
          return;
        }
        const avail = checkAvailability(data.availability);
        if (avail.status !== 'available') {
          setModuleError(
            avail.status === 'not_yet_open'
              ? `This module is not yet available. ${avail.message || ''}`
              : 'This module is no longer available.'
          );
          return;
        }
        setModuleData(data);
        setAllModules(modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      } catch (err) {
        setModuleError(err instanceof Error ? err.message : 'Failed to load module');
      } finally {
        setIsLoadingModule(false);
      }
    };

    loadModule();
  }, [courseId, moduleId]);

  // ============================================
  // FIX 1.1: DRAFT ANSWER PERSISTENCE
  // ============================================

  // Load draft answers on mount
  useEffect(() => {
    if (!user?.uid || !moduleId || !moduleData || isPassed || draftLoaded) return;

    const loadDraft = async () => {
      try {
        const draft = await loadDraftAnswers(user.uid, moduleId);
        if (draft) {
          setAnswers(draft.answers);
          lastSavedRef.current = JSON.stringify(draft.answers);
          setLastSavedAt(draft.savedAt);
          addToast({
            type: 'info',
            title: 'Resuming where you left off',
            message: draft.savedAt
              ? `Draft saved ${new Date(draft.savedAt).toLocaleString()}`
              : 'Your previous answers have been restored.',
          });
        }
      } catch (err) {
        console.warn('Failed to load draft answers:', err);
      } finally {
        setDraftLoaded(true);
      }
    };

    loadDraft();
  }, [user?.uid, moduleId, moduleData, isPassed, draftLoaded, addToast]);

  // Auto-save debounce (30 seconds)
  useEffect(() => {
    if (!user?.uid || !moduleId || isPassed) return;

    const currentSnapshot = JSON.stringify(answers);
    if (currentSnapshot === lastSavedRef.current || currentSnapshot === '{}') return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        await saveDraftAnswers(user.uid, moduleId, answers);
        lastSavedRef.current = currentSnapshot;
        const now = new Date().toISOString();
        setLastSavedAt(now);
        setSaveStatus('saved');
      } catch (err) {
        console.warn('Draft auto-save failed:', err);
        setSaveStatus('idle');
      }
    }, 30_000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [answers, user?.uid, moduleId, isPassed]);

  // ============================================
  // FIX 1.2: UNSAVED WORK WARNING
  // ============================================

  const hasUnsavedWork = useMemo(() => {
    if (moduleComplete || isPassed) return false;
    return Object.keys(answers).some(blockId => {
      const blockAnswers = answers[blockId];
      return blockAnswers && blockAnswers.length > 0 &&
        blockAnswers.some((a: any) => a !== undefined && a !== null && a !== '');
    });
  }, [answers, moduleComplete, isPassed]);

  // beforeunload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWork) {
        e.preventDefault();
        // Best-effort fire-and-forget save before unload
        if (user?.uid && moduleId) {
          saveDraftAnswers(user.uid, moduleId, answers);
        }
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedWork, user?.uid, moduleId, answers]);

  // Guarded back navigation
  const handleBack = useCallback(() => {
    if (hasUnsavedWork) {
      setShowLeaveDialog(true);
    } else {
      onBack();
    }
  }, [hasUnsavedWork, onBack]);

  const handleConfirmLeave = useCallback(async () => {
    setShowLeaveDialog(false);
    if (user?.uid && moduleId) {
      try {
        await saveDraftAnswers(user.uid, moduleId, answers);
      } catch { /* best effort */ }
    }
    onBack();
  }, [user?.uid, moduleId, answers, onBack]);

  // ============================================
  // FIX 1.3: CONTENT BLOCK READ-TRACKING
  // ============================================

  useEffect(() => {
    if (!moduleData || !user?.uid || isPassed) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const blockId = entry.target.getAttribute('data-block-id');
        if (!blockId) return;

        const block = moduleData.blocks.find(b => b.id === blockId);
        if (!block) return;
        // Skip assessable blocks (handled by quiz submission)
        if (block.type === 'quiz' || block.type === 'obj_subj_validator') return;
        // Skip already completed or already observed
        if (observedBlocksRef.current.has(blockId)) return;
        if (progress?.completedBlocks[blockId]?.completed) {
          observedBlocksRef.current.add(blockId);
          return;
        }

        if (entry.isIntersecting) {
          const timer = setTimeout(async () => {
            observedBlocksRef.current.add(blockId);
            const requiredBlocks = moduleData.blocks.filter(b => b.required !== false).length;
            await completeBlock(blockId, requiredBlocks);
            setSaveStatus('saved');
            setLastSavedAt(new Date().toISOString());
          }, 3000);
          blockTimersRef.current.set(blockId, timer);
        } else {
          const timer = blockTimersRef.current.get(blockId);
          if (timer) {
            clearTimeout(timer);
            blockTimersRef.current.delete(blockId);
          }
        }
      });
    }, { threshold: 0.6 });

    // Small delay to ensure DOM has rendered block elements
    const mountTimer = setTimeout(() => {
      document.querySelectorAll('[data-block-id]').forEach(el => observer.observe(el));
    }, 500);

    return () => {
      clearTimeout(mountTimer);
      observer.disconnect();
      blockTimersRef.current.forEach(timer => clearTimeout(timer));
      blockTimersRef.current.clear();
    };
  }, [moduleData, user?.uid, isPassed, progress, completeBlock]);

  // ============================================
  // QUIZ ANSWER HANDLING
  // ============================================

  const handleQuizAnswer = (blockId: string, questionIndex: number, answer: any) => {
    if (isPassed) return;
    setAnswers(prev => {
      const blockAnswers = prev[blockId] ? [...prev[blockId]] : [];
      blockAnswers[questionIndex] = answer;
      return { ...prev, [blockId]: blockAnswers };
    });
  };

  const isQuestionAnswered = (q: QuizQuestion, answer: any): boolean => {
    if (answer === undefined || answer === null) return false;

    switch (q.type) {
      case 'matching':
        return Array.isArray(answer)
          && answer.length === (q.matchingPairs?.length ?? 0)
          && answer.every((v: any) => v !== undefined && v !== '');
      case 'short-answer':
        return typeof answer === 'string' && answer.trim().length >= 20;
      case 'fill-blank':
        return typeof answer === 'string' && answer.trim().length > 0;
      case 'multiple-answer':
        return Array.isArray(answer) && answer.length > 0;
      case 'multiple-choice':
      case 'true-false':
      default:
        return answer !== undefined && answer !== '';
    }
  };

  const handleBlockComplete = async (blockId: string) => {
    if (!moduleData || !user) return;
    const requiredBlocks = moduleData.blocks.filter(b => b.required).length;
    await completeBlock(blockId, requiredBlocks);
  };

  const calculateQuizScore = (quizBlock: ContentBlock) => {
    const quiz = quizBlock.data as QuizBlockData;
    const blockAnswers = answers[quizBlock.id] || [];
    const result = gradeQuiz(quiz.questions, blockAnswers, quiz.passingScore);
    const passingScore = quiz.passingScore || moduleData?.passingScore || 80;
    return {
      score: result.score,
      passed: result.score >= passingScore,
      needsReview: result.needsReview,
    };
  };

  // ============================================
  // MODULE SUBMISSION
  // ============================================

  const handleSubmit = async () => {
    if (!moduleData || !user) return;

    setIsSubmitting(true);

    try {
      const requiredBlocks = moduleData.blocks.filter(b => b.required).length;
      let anyNeedsReview = false;

      for (const block of moduleData.blocks) {
        if (block.type === 'quiz') {
          const { score, passed, needsReview } = calculateQuizScore(block);
          if (needsReview) anyNeedsReview = true;
          await submitQuiz(block.id, score, passed, requiredBlocks);
        }
      }

      for (const block of moduleData.blocks) {
        if (block.type === 'obj_subj_validator') {
          const data = block.data as ObjSubjValidatorBlockData;
          const userAnswers = (answers[block.id]?.[0] || {}) as Record<string, string>;
          const result = gradeObjSubjBlock(data, userAnswers, moduleData.passingScore || 80);
          await submitQuiz(block.id, result.score, result.passed, requiredBlocks);
        }
      }

      for (const block of moduleData.blocks) {
        if (block.type !== 'quiz' && block.type !== 'obj_subj_validator' && block.required) {
          const isAlreadyComplete = progress?.completedBlocks[block.id]?.completed;
          if (!isAlreadyComplete) {
            await completeBlock(block.id, requiredBlocks);
          }
        }
      }

      if (anyNeedsReview && enrollment) {
        const enrollmentRef = doc(db, 'enrollments', enrollment.id);
        await updateDoc(enrollmentRef, {
          status: 'needs_review',
          quizAnswers: JSON.stringify(answers),
          updatedAt: serverTimestamp(),
        });

        await auditService.logToFirestore(
          user.uid,
          user.displayName || 'Learner',
          'ASSESSMENT_SUBMIT',
          enrollment.id,
          `Module ${moduleData.title} submitted for instructor review (contains short-answer questions)`
        );

        addToast({ type: 'success', title: 'Submitted for review', message: 'Your answers have been submitted. An instructor will review your short-answer responses.' });
      } else if (enrollment) {
        const enrollmentRef = doc(db, 'enrollments', enrollment.id);

        let totalScore = 0;
        let scoredBlockCount = 0;
        let allPassed = true;

        for (const block of moduleData.blocks) {
          if (block.type === 'quiz') {
            const { score, passed } = calculateQuizScore(block);
            totalScore += score;
            scoredBlockCount++;
            if (!passed) allPassed = false;
          }
          if (block.type === 'obj_subj_validator') {
            const data = block.data as ObjSubjValidatorBlockData;
            const userAnswers = (answers[block.id]?.[0] || {}) as Record<string, string>;
            const result = gradeObjSubjBlock(data, userAnswers, moduleData.passingScore || 80);
            totalScore += result.score;
            scoredBlockCount++;
            if (!result.passed) allPassed = false;
          }
        }

        const overallScore = scoredBlockCount > 0 ? Math.round(totalScore / scoredBlockCount) : 0;
        const passingScore = moduleData.passingScore || 80;

        try {
          await enterGrade(
            user.uid, courseId, moduleId, overallScore, passingScore,
            user.uid, user.displayName || 'Learner', 'Auto-graded submission'
          );
        } catch (gradeErr) {
          console.warn('Grade entry failed (non-blocking):', gradeErr);
        }

        try {
          await calculateAndSaveCourseGrade(
            user.uid, courseId, user.uid, user.displayName || 'Learner'
          );
        } catch (courseGradeErr) {
          console.warn('Course grade calculation failed (non-blocking):', courseGradeErr);
        }

        await updateDoc(enrollmentRef, {
          quizAnswers: JSON.stringify(answers),
          score: overallScore,
          status: allPassed ? 'completed' : 'in_progress',
          progress: allPassed ? 100 : (enrollment.progress ?? 0),
          ...(allPassed ? { completedAt: serverTimestamp() } : {}),
          updatedAt: serverTimestamp(),
        });

        addToast({
          type: allPassed ? 'success' : 'warning',
          title: allPassed ? 'Module submitted successfully' : 'Assessment not passed',
          message: allPassed
            ? `You scored ${overallScore}%. Your grade is being recorded.`
            : `You scored ${overallScore}%. A minimum of ${passingScore}% is required.`,
        });

        // Fix 3.3: Check if this was the last module — show course completion receipt
        if (allPassed && isLastModule) {
          pollForCourseGrade();
        }
      }

      // Fix 1.1: Clear draft after successful submit
      try {
        await clearDraftAnswers(user.uid, moduleId);
        lastSavedRef.current = '';
      } catch { /* non-blocking */ }

    } catch (err) {
      console.error('Submit error:', err);
      addToast({
        type: 'error',
        title: 'Submission failed',
        message: 'Your answers have been saved as a draft. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // FIX 2.3: MODULE-TO-MODULE NAVIGATION
  // ============================================

  const currentModuleIndex = allModules.findIndex(m => m.id === moduleId);
  const nextModule = currentModuleIndex >= 0 && currentModuleIndex < allModules.length - 1
    ? allModules[currentModuleIndex + 1] : null;
  const isLastModule = currentModuleIndex >= 0 && currentModuleIndex === allModules.length - 1;

  const handleNavigateToModule = (targetModuleId: string) => {
    if (onNavigate) {
      onNavigate('/player', { courseId, moduleId: targetModuleId, courseCategory });
    }
  };

  const handleReturnToCourse = () => {
    if (onNavigate) {
      onNavigate('/course', { courseId });
    } else {
      onBack();
    }
  };

  // ============================================
  // FIX 3.3: COURSE COMPLETION RECEIPT
  // ============================================

  const pollForCourseGrade = useCallback(async () => {
    if (!user?.uid) return;
    let attempts = 0;
    const poll = async () => {
      try {
        const cg = await getSavedCourseGrade(user.uid, courseId);
        if (cg) {
          setCourseGrade(cg);
          setShowCourseComplete(true);
          return;
        }
      } catch { /* retry */ }
      attempts++;
      if (attempts < 5) {
        setTimeout(poll, 2000);
      } else {
        // Fallback — show course complete without grade details
        setShowCourseComplete(true);
      }
    };
    // Small initial delay for cloud function to fire
    setTimeout(poll, 1500);
  }, [user?.uid, courseId]);

  // ============================================
  // FIX 3.1: QUIZ ATTEMPT VISIBILITY
  // ============================================

  const getBlockAttempts = (blockId: string): number => {
    return progress?.completedBlocks[blockId]?.attempts || 0;
  };

  // ============================================
  // DERIVED STATE
  // ============================================

  const allQuestionsAnswered = moduleData?.blocks.every(block => {
    if (block.type === 'quiz') {
      const quiz = block.data as QuizBlockData;
      const blockAnswers = answers[block.id] || [];
      return quiz.questions.every((q, idx) => isQuestionAnswered(q, blockAnswers[idx]));
    }
    if (block.type === 'obj_subj_validator') {
      const data = block.data as ObjSubjValidatorBlockData;
      const cats = answers[block.id]?.[0] as Record<string, string> | undefined;
      if (!cats || !data.items) return false;
      return data.items.every(item => cats[item.id] !== undefined);
    }
    if (block.type === 'correction_log' && block.required) {
      const entries = answers[block.id]?.[0] as CorrectionLogEntry[] | undefined;
      if (!entries) return false;
      return entries.some(e => !e.isOriginal);
    }
    return true;
  }) ?? false;

  const getOverallResult = (): { score: number; passed: boolean } | null => {
    if (!moduleData) return null;

    const scoredBlocks: { score: number }[] = [];

    for (const block of moduleData.blocks) {
      if (block.type === 'quiz') {
        scoredBlocks.push(calculateQuizScore(block));
      } else if (block.type === 'obj_subj_validator') {
        const data = block.data as ObjSubjValidatorBlockData;
        const userAnswers = (answers[block.id]?.[0] || {}) as Record<string, string>;
        const result = gradeObjSubjBlock(data, userAnswers, moduleData.passingScore || 80);
        scoredBlocks.push({ score: result.score });
      }
    }

    if (scoredBlocks.length === 0) return { score: 100, passed: true };

    const totalScore = scoredBlocks.reduce((sum, b) => sum + b.score, 0);
    const avgScore = Math.round(totalScore / scoredBlocks.length);
    return { score: avgScore, passed: avgScore >= (moduleData.passingScore || 80) };
  };

  // ============================================
  // RENDER STATES
  // ============================================

  const isLoading = isLoadingModule || enrollmentLoading || progressLoading || gradeLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-primary-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600 font-medium">Loading module...</p>
        </div>
      </div>
    );
  }

  if (moduleError || !moduleData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="bg-white rounded-lg border border-red-200 p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Failed to Load</h2>
          <p className="text-gray-600 mb-6">{moduleError || 'Module not found'}</p>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (!isEnrolled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md text-center shadow-sm">
          <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Enrollment Required</h2>
          <p className="text-gray-600 mb-6">
            You need to be enrolled in this course to access the content.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={onBack} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
            <Button onClick={enroll}>
              <BookOpen className="h-4 w-4 mr-2" />
              Enroll Now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // FIX 3.3: COURSE COMPLETION RECEIPT
  // ============================================

  if (showCourseComplete) {
    const competency = courseGrade
      ? courseGrade.overallScore >= 90 ? 'MASTERY'
        : courseGrade.overallScore >= 80 ? 'COMPETENT'
        : courseGrade.overallScore >= 70 ? 'DEVELOPING'
        : 'NOT COMPETENT'
      : null;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-8 text-center border border-gray-200">
          <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Award className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Course Completed!</h2>
          <p className="text-gray-500 mb-6">
            Congratulations! You have completed all modules.
          </p>

          {courseGrade ? (
            <>
              <div className="text-4xl font-bold text-green-600 mb-2">
                {courseGrade.overallScore}%
              </div>
              <p className={cn(
                "text-sm font-bold mb-4",
                courseGrade.overallPassed ? "text-green-600" : "text-red-600"
              )}>
                {courseGrade.overallPassed ? 'PASSED' : 'NOT PASSED'}
              </p>
              {competency && (
                <div className="mb-6">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium",
                    competency === 'MASTERY' && "bg-purple-100 text-purple-700",
                    competency === 'COMPETENT' && "bg-green-100 text-green-700",
                    competency === 'DEVELOPING' && "bg-yellow-100 text-yellow-700",
                    competency === 'NOT COMPETENT' && "bg-red-100 text-red-700"
                  )}>
                    {competency}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 mb-6">
              Your grade will appear on your Dashboard shortly.
            </p>
          )}

          <div className="bg-gray-50 rounded border border-gray-200 p-4 mb-6 text-xs text-gray-500">
            Completed: {new Date().toLocaleDateString()}<br/>
            {courseGrade && <>Certificate ID: HHCA-{courseGrade.courseId.slice(-8).toUpperCase()}</>}
          </div>

          <div className="flex gap-3 justify-center">
            {onNavigate && (
              <Button variant="outline" onClick={() => onNavigate('/my-grades')}>
                View Grade Breakdown
              </Button>
            )}
            <Button onClick={() => onNavigate ? onNavigate('/') : onBack()}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // ALREADY PASSED STATE (Fix 2.3 enhanced)
  // ============================================

  if (isPassed && grade) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8 text-center border border-gray-200">
          <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Award className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Module Completed!</h2>
          <p className="text-gray-500 mb-4">
            You have successfully passed <strong>{moduleData.title}</strong> with a score of{' '}
            <span className="text-green-600 font-bold">{grade.score}%</span>.
          </p>
          {competencyLevel && (
            <div className="mb-6">
              <span className={cn(
                "px-3 py-1 rounded-full text-sm font-medium",
                competencyLevel === 'mastery' && "bg-purple-100 text-purple-700",
                competencyLevel === 'competent' && "bg-green-100 text-green-700",
                competencyLevel === 'developing' && "bg-yellow-100 text-yellow-700",
                competencyLevel === 'not_competent' && "bg-red-100 text-red-700"
              )}>
                {competencyLevel.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          )}
          <div className="bg-gray-50 rounded border border-gray-200 p-4 mb-6 text-xs text-gray-500">
            Completed: {new Date(grade.gradedAt).toLocaleDateString()}<br/>
            Certificate ID: {grade.id.slice(-12).toUpperCase()}
          </div>

          {/* Fix 2.3: Next Module / Return to Course buttons */}
          <div className="flex flex-col gap-2">
            {nextModule && (
              <Button onClick={() => handleNavigateToModule(nextModule.id)} className="w-full">
                Next Module: {nextModule.title}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            {isLastModule && (
              <Button onClick={() => pollForCourseGrade()} className="w-full">
                View Course Results
              </Button>
            )}
            <Button onClick={handleReturnToCourse} variant="outline" className="w-full">
              Return to Course
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // MAIN PLAYER VIEW
  // ============================================

  const result = moduleComplete ? getOverallResult() : null;

  return (
    <LicenseGate courseCategory={courseCategory}>
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-gray-900 line-clamp-1">
              {moduleData.title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              {completionPercent}% Complete
              {/* Fix 2.4: Estimated duration */}
              {moduleData.estimatedMinutes > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <Clock className="h-3 w-3" />
                  {moduleData.estimatedMinutes} min
                </>
              )}
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          {/* Fix 2.1: Save status indicator */}
          <SaveIndicator status={saveStatus} savedAt={lastSavedAt} />

          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="text-right mr-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Progress</p>
              <p className="text-xs font-bold text-primary-600">{completionPercent}%</p>
            </div>
            <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-3xl mx-auto py-12 px-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 md:p-12">

            {/* Failed attempt message */}
            {result && !result.passed && (
              <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-800">
                <AlertCircle className="h-5 w-5" />
                <div className="flex-1">
                  <p className="font-bold text-sm">Assessment Not Passed</p>
                  <p className="text-xs">
                    You scored {result.score}%. A minimum of {moduleData.passingScore}% is required.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => setAnswers({})}
                >
                  Retry
                </Button>
              </div>
            )}

            {/* Blocks */}
            {moduleData.blocks.map(block => (
              <div key={block.id} data-block-id={block.id} className="relative">
                {/* Fix 3.1: Quiz attempt counter */}
                {block.type === 'quiz' && (() => {
                  const attempts = getBlockAttempts(block.id);
                  if (attempts === 0) return null;
                  const isThirdAttempt = attempts >= 2;
                  return (
                    <div className={cn(
                      "mb-3 px-4 py-2 rounded-lg border text-xs font-medium flex items-center gap-2",
                      isThirdAttempt
                        ? "bg-red-50 border-red-200 text-red-800"
                        : "bg-amber-50 border-amber-200 text-amber-800"
                    )}>
                      {isThirdAttempt ? (
                        <ShieldAlert className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      {isThirdAttempt
                        ? 'This is your final attempt before supervisor review is required. Take your time.'
                        : `Attempt ${attempts + 1} of 3 — ${3 - attempts - 1 === 0 ? 'one more failed attempt will require supervisor approval to retry.' : `${3 - attempts - 1} more failed attempt${3 - attempts - 1 > 1 ? 's' : ''} before supervisor review.`}`
                      }
                    </div>
                  );
                })()}

                <BlockRenderer
                  block={block}
                  onQuizAnswer={handleQuizAnswer}
                  answers={answers}
                />

                {/* Completion indicator for non-quiz blocks */}
                {block.type !== 'quiz' && block.required && (
                  <div className="flex justify-end mt-2 mb-6">
                    {progress?.completedBlocks[block.id]?.completed ? (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Completed
                      </span>
                    ) : (
                      <button
                        onClick={() => handleBlockComplete(block.id)}
                        className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1"
                      >
                        <CheckCircle className="h-3 w-3" />
                        Mark as read
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Submit section */}
            <div className="mt-16 pt-8 border-t border-gray-100 flex flex-col items-center gap-4">
              <p className="text-sm text-gray-500 italic text-center">
                By submitting, you acknowledge that you have reviewed all training materials above.
              </p>
              <Button
                size="lg"
                className="w-full md:w-auto px-12"
                onClick={handleSubmit}
                disabled={!allQuestionsAnswered || isSubmitting || isPassed}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : isPassed ? (
                  'Already Completed'
                ) : (
                  'Complete & Submit Module'
                )}
              </Button>

              {!allQuestionsAnswered && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Please answer all knowledge check questions to proceed.
                </p>
              )}
            </div>
          </div>

          <div className="text-center mt-8 text-xs text-gray-400">
            Harmony Health LMS &bull; Secure Audit Logging Enabled
          </div>
        </div>
      </div>

      {/* Fix 1.2: Leave confirmation dialog */}
      {showLeaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Unsaved Answers</h3>
            <p className="text-sm text-gray-600 mb-6">
              You have unsaved answers. Your progress has been auto-saved and will be here when you return. Leave anyway?
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
                Stay
              </Button>
              <Button onClick={handleConfirmLeave}>
                Leave
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </LicenseGate>
  );
};
