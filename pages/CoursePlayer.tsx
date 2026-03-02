/**
 * Course Player Page (Updated)
 * 
 * Now integrates with Firestore for:
 * - Enrollment verification
 * - Progress tracking per block
 * - Quiz attempt recording
 * - Grade persistence
 * 
 * @module pages/CoursePlayer
 */

import React, { useState, useEffect } from 'react';
import { Module, QuizBlockData, ContentBlock, ObjSubjValidatorBlockData, CorrectionLogEntry } from '../functions/src/types';
import { BlockRenderer } from '../components/player/BlockRenderer';
import { Button } from '../components/ui/Button';
import { 
  ArrowLeft, 
  CheckCircle, 
  AlertCircle, 
  Award, 
  Loader2,
  Lock,
  BookOpen
} from 'lucide-react';
import { cn } from '../utils';
import { gradeQuestion , gradeQuiz, gradeObjSubjBlock } from '../utils/gradeCalculation';

// Hooks
import { useEnrollment } from '../hooks/useUserEnrollments';
import { useModuleProgress } from '../hooks/useModuleProgress';
import { useMyGrade } from '../hooks/useGrade';
import { useAuth } from '../contexts/AuthContext';
import { QuizQuestion } from '../functions/src/types'; // Ensure QuizQuestion is imported

// Services for module fetching and enrollment updates
import { getModuleWithBlocks } from '../services/courseService';
import { enterGrade } from '../services/gradeService';
import { calculateAndSaveCourseGrade } from '../services/courseGradeService';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { auditService } from '../services/auditService';
import { LicenseGate } from '../components/clinical/LicenseGate';

interface CoursePlayerProps {
  courseId: string;
  moduleId: string;
  courseCategory?: string;
  onBack: () => void;
}

export const CoursePlayer: React.FC<CoursePlayerProps> = ({
  courseId,
  moduleId,
  courseCategory,
  onBack
}) => {
  const { user } = useAuth();
  
  // Module data state
  const [moduleData, setModuleData] = useState<Module | null>(null);
  const [isLoadingModule, setIsLoadingModule] = useState(true);
  const [moduleError, setModuleError] = useState<string | null>(null);
  
  // Quiz answers (local state until submission)
  const [answers, setAnswers] = useState<Record<string, any[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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

  // Load module data
  useEffect(() => {
    const loadModule = async () => {
      if (!courseId || !moduleId) return;
      
      setIsLoadingModule(true);
      setModuleError(null);
      
      try {
        const data = await getModuleWithBlocks(courseId, moduleId);
        if (!data) {
          setModuleError('Module not found');
          return;
        }
        setModuleData(data);
      } catch (err) {
        setModuleError(err instanceof Error ? err.message : 'Failed to load module');
      } finally {
        setIsLoadingModule(false);
      }
    };
    
    loadModule();
  }, [courseId, moduleId]);

  // Handle quiz answer selection
  const handleQuizAnswer = (blockId: string, questionIndex: number, answer: any) => {
    if (isPassed) return;
    setAnswers(prev => {
      const blockAnswers = prev[blockId] ? [...prev[blockId]] : [];
      blockAnswers[questionIndex] = answer;
      return { ...prev, [blockId]: blockAnswers };
    });
  };

  // PHASE C: Step 3 - Per-type validation logic
  const isQuestionAnswered = (q: QuizQuestion, answer: any): boolean => {
    if (answer === undefined || answer === null) return false;

    switch (q.type) {
      case 'matching':
        // Ensure it's an array matching the length of pairs and all slots are filled
        return Array.isArray(answer) 
          && answer.length === (q.matchingPairs?.length ?? 0)
          && answer.every(v => v !== undefined && v !== '');
      
      case 'short-answer':
        // Minimum 20 characters for clinical reflections
        return typeof answer === 'string' && answer.trim().length >= 20;
      
      case 'fill-blank':
        return typeof answer === 'string' && answer.trim().length > 0;
      
      case 'multiple-choice':
      case 'true-false':
      default:
        return answer !== undefined && answer !== '';
    }
  };

  // Mark a content block as viewed/completed
  const handleBlockComplete = async (blockId: string) => {
    if (!moduleData || !user) return;
    
    const requiredBlocks = moduleData.blocks.filter(b => b.required).length;
    await completeBlock(blockId, requiredBlocks);
  };

  // Calculate quiz score
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

  // Submit module (process all quizzes)
  const handleSubmit = async () => {
    if (!moduleData || !user) return;

    setIsSubmitting(true);

    try {
      const requiredBlocks = moduleData.blocks.filter(b => b.required).length;
      let anyNeedsReview = false;

      // Process each quiz block
      for (const block of moduleData.blocks) {
        if (block.type === 'quiz') {
          const { score, passed, needsReview } = calculateQuizScore(block);
          if (needsReview) anyNeedsReview = true;
          await submitQuiz(block.id, score, passed, requiredBlocks);
        }
      }

      // Process obj_subj_validator blocks
      for (const block of moduleData.blocks) {
        if (block.type === 'obj_subj_validator') {
          const data = block.data as ObjSubjValidatorBlockData;
          const userAnswers = (answers[block.id]?.[0] || {}) as Record<string, string>;
          const result = gradeObjSubjBlock(data, userAnswers, moduleData.passingScore || 80);
          await submitQuiz(block.id, result.score, result.passed, requiredBlocks);
        }
      }

      // Mark non-assessable blocks as complete (correction_log and content blocks)
      for (const block of moduleData.blocks) {
        if (block.type !== 'quiz' && block.type !== 'obj_subj_validator' && block.required) {
          const isAlreadyComplete = progress?.completedBlocks[block.id]?.completed;
          if (!isAlreadyComplete) {
            await completeBlock(block.id, requiredBlocks);
          }
        }
      }

      // If any quiz has short-answer questions requiring review,
      // set enrollment to needs_review and persist quiz answers
      if (anyNeedsReview && enrollment) {
        const enrollmentRef = doc(db, 'enrollments', enrollment.id);
        await updateDoc(enrollmentRef, {
          status: 'needs_review',
          quizAnswers: answers,
          updatedAt: serverTimestamp(),
        });

        await auditService.logToFirestore(
          user.uid,
          user.displayName || 'Learner',
          'ASSESSMENT_SUBMIT',
          enrollment.id,
          `Module ${moduleData.title} submitted for instructor review (contains short-answer questions)`
        );
      } else if (enrollment) {
        // Auto-graded only — persist answers, enter grade, and calculate course grade
        const enrollmentRef = doc(db, 'enrollments', enrollment.id);

        // Calculate overall score from all quiz/assessment blocks
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

        // 1. Enter the grade into the grades collection (audit-logged)
        try {
          await enterGrade(
            user.uid,
            courseId,
            moduleId,
            overallScore,
            passingScore,
            user.uid,
            user.displayName || 'Learner',
            'Auto-graded submission'
          );
        } catch (gradeErr) {
          console.warn('Grade entry failed (non-blocking):', gradeErr);
        }

        // 2. Calculate and save the course-level grade
        try {
          await calculateAndSaveCourseGrade(
            user.uid,
            courseId,
            user.uid,
            user.displayName || 'Learner'
          );
        } catch (courseGradeErr) {
          console.warn('Course grade calculation failed (non-blocking):', courseGradeErr);
        }

        // 3. Update enrollment with score, answers, and status
        await updateDoc(enrollmentRef, {
          quizAnswers: answers,
          score: overallScore,
          status: allPassed ? 'completed' : 'in_progress',
          progress: allPassed ? 100 : (enrollment.progress ?? 0),
          ...(allPassed ? { completedAt: serverTimestamp() } : {}),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Updated "allQuestionsAnswered" — now includes obj/subj and correction_log blocks
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
      return entries.some(e => !e.isOriginal); // At least one correction made
    }
    return true;
  }) ?? false;

  // Calculate overall quiz result for display (includes quiz + obj/subj blocks)
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

  // Loading state
  const isLoading = isLoadingModule || enrollmentLoading || progressLoading || gradeLoading;
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-brand-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-600 font-medium">Loading module...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (moduleError || !moduleData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="bg-white rounded-xl border border-red-200 p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Failed to Load</h2>
          <p className="text-slate-600 mb-6">{moduleError || 'Module not found'}</p>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Not enrolled state
  if (!isEnrolled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-md text-center shadow-sm">
          <Lock className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Enrollment Required</h2>
          <p className="text-slate-600 mb-6">
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

  // Already passed state
  if (isPassed && grade) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center border border-slate-200">
          <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Award className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Module Completed!</h2>
          <p className="text-slate-500 mb-4">
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
          <div className="bg-slate-50 rounded border border-slate-200 p-4 mb-6 text-xs text-slate-500">
            Completed: {new Date(grade.gradedAt).toLocaleDateString()}<br/>
            Certificate ID: {grade.id.slice(-12).toUpperCase()}
          </div>
          <Button onClick={onBack} className="w-full">Return to Catalog</Button>
        </div>
      </div>
    );
  }

  // Main player view
  const result = moduleComplete ? getOverallResult() : null;

  return (
    <LicenseGate courseCategory={courseCategory}>
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 bg-white sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-900 line-clamp-1">
              {moduleData.title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              {completionPercent}% Complete
            </div>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="hidden md:flex items-center gap-2">
          <div className="text-right mr-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progress</p>
            <p className="text-xs font-bold text-brand-600">{completionPercent}%</p>
          </div>
          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-brand-500 transition-all duration-300" 
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-3xl mx-auto py-12 px-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
            
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
              <div key={block.id} className="relative">
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
                        className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1"
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
            <div className="mt-16 pt-8 border-t border-slate-100 flex flex-col items-center gap-4">
              <p className="text-sm text-slate-500 italic text-center">
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
          
          <div className="text-center mt-8 text-xs text-slate-400">
            Harmony Health LMS &bull; Secure Audit Logging Enabled
          </div>
        </div>
      </div>
    </div>
    </LicenseGate>
  );
};