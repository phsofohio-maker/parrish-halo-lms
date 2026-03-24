/**
 * Grade Management Page — Phase E Integration
 * 
 * What changed from the gemini-2 version:
 * 
 * 1. REMOVED: Props dependency (enrollments, courses, onReviewSubmission)
 *    → Now fetches its own data from Firestore via services
 * 2. REMOVED: MOCK_USERS lookup
 *    → Uses Firestore user profiles
 * 3. ADDED: Real gradeService.enterGrade / correctGrade for approvals
 * 4. ADDED: enrollmentService status update on approve/reject
 * 5. ADDED: Per-question grading with score override capability
 * 6. ADDED: Reject workflow with reason field
 * 7. PRESERVED: All existing UI (table, filters, review modal layout)
 * 8. PRESERVED: Per-question-type answer display from gemini-2
 * 
 * Data Flow:
 *   Page Load → enrollmentService.getEnrollmentsByStatus('needs_review')
 *   Review Click → courseService.getModuleWithBlocks (for quiz definitions)
 *   Approve → gradeService.enterGrade + enrollmentService.updateStatus
 *   Reject → enrollmentService.updateStatus('in_progress') + audit log
 * 
 * @module pages/GradeManagement
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Enrollment,
  QuizBlockData,
  QuizQuestion,
  ContentBlock,
  Module,
  Course,
} from '../functions/src/types';
import {
  ClipboardCheck,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  Check,
  X,
  Loader2,
  RefreshCw,
  Shield,
  User,
  FileText,
  MessageSquare,
  Users,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { CourseRoster } from '../components/grades/CourseRoster';
import { cn, formatDate } from '../utils';
import { useAuth } from '../contexts/AuthContext';

// ---- Firestore Services ----
import {
  getUserEnrollments,
  getCourseEnrollments,
  getEnrollment,
  updateEnrollmentProgress,
} from '../services/enrollmentService';
import {
  enterGrade,
  correctGrade,
  getCurrentGrade,
} from '../services/gradeService';
import { getModuleWithBlocks, getCourses } from '../services/courseService';
import { calculateAndSaveCourseGrade } from '../services/courseGradeService';
import { auditService } from '../services/auditService';

// Firestore direct access for the needs_review query
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, DocumentData, Query } from 'firebase/firestore';
import { db } from '../services/firebase';

// ============================================
// TYPES
// ============================================

/** Enriched enrollment with resolved display names and module data */
interface ReviewableSubmission {
  enrollment: Enrollment;
  userName: string;
  userEmail: string;
  courseTitle: string;
  courseId: string;
  moduleId: string;
  moduleData: Module | null; // Loaded on-demand when review modal opens
}

type FilterStatus = 'needs_review' | 'completed' | 'all';
type ViewMode = 'review_queue' | 'course_roster';

// ============================================
// COMPONENT
// ============================================

export const GradeManagement: React.FC = () => {
  const { user, hasRole } = useAuth();

  // ---- State ----
  const [submissions, setSubmissions] = useState<ReviewableSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('needs_review');

  // View mode: review queue vs course roster
  const [viewMode, setViewMode] = useState<ViewMode>('review_queue');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  // Review modal state
  const [reviewingSubmission, setReviewingSubmission] = useState<ReviewableSubmission | null>(null);
  const [isLoadingModule, setIsLoadingModule] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [overrideScore, setOverrideScore] = useState<number | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  // ============================================
  // DATA FETCHING
  // ============================================

  /**
   * Fetches all enrollments that match the current filter.
   * 
   * For 'needs_review': queries Firestore directly for status === 'needs_review'
   * For 'completed' / 'all': broader query with client-side filtering
   * 
   * Also resolves user display names from the users collection.
   */
  const fetchSubmissions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Query enrollments by status
      let enrollmentQuery: Query<DocumentData, DocumentData>;
      if (filter === 'all') {
        enrollmentQuery = query(
          collection(db, 'enrollments'),
          where('status', 'in', ['needs_review', 'completed'])
        );
      } else {
        enrollmentQuery = query(
          collection(db, 'enrollments'),
          where('status', '==', filter)
        );
      }

      const enrollmentSnap = await getDocs(enrollmentQuery);
      const enriched: ReviewableSubmission[] = [];

      for (const enrollDoc of enrollmentSnap.docs) {
        const data = enrollDoc.data() as Record<string, any>;
        const enrollment: Enrollment = {
          id: enrollDoc.id,
          userId: data.userId,
          courseId: data.courseId,
          progress: data.progress ?? 0,
          status: data.status ?? 'not_started',
          enrolledAt: data.enrolledAt?.toDate?.()?.toISOString() ?? '',
          lastAccessedAt: data.updatedAt?.toDate?.()?.toISOString() ?? '',
          score: data.score,
          quizAnswers: (() => {
            const raw = data.quizAnswers;
            if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
            return raw;
          })(),
        };

        // Resolve user name
        let userName = 'Unknown Staff';
        let userEmail = '';
        try {
          const userDoc = await getDocs(
            query(collection(db, 'users'), where('uid', '==', data.userId))
          );
          if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            userName = userData.displayName || userData.email || 'Unknown';
            userEmail = userData.email || '';
          }
        } catch {
          // Non-critical — display with fallback name
        }

        // Resolve course title and find the module with quiz blocks
        let courseTitle = 'Unknown Course';
        let moduleId = '';
        try {
          const courseDoc = await getDocs(
            query(collection(db, 'courses'), where('__name__', '==', data.courseId))
          );
          if (!courseDoc.empty) {
            courseTitle = courseDoc.docs[0].data().title || 'Untitled Course';
          }
          // Find the module that contains quiz blocks (prioritize modules with short-answer)
          const modulesSnap = await getDocs(
            collection(db, `courses/${data.courseId}/modules`)
          );
          if (!modulesSnap.empty) {
            // Try to find a module with quiz blocks first
            for (const modDoc of modulesSnap.docs) {
              const blocksSnap = await getDocs(
                collection(db, `courses/${data.courseId}/modules/${modDoc.id}/blocks`)
              );
              const hasQuiz = blocksSnap.docs.some(b => b.data().type === 'quiz');
              if (hasQuiz) {
                moduleId = modDoc.id;
                break;
              }
            }
            // Fallback to first module if no quiz blocks found
            if (!moduleId) {
              moduleId = modulesSnap.docs[0].id;
            }
          }
        } catch {
          // Non-critical
        }

        enriched.push({
          enrollment,
          userName,
          userEmail,
          courseTitle,
          courseId: data.courseId,
          moduleId,
          moduleData: null, // Lazy-loaded when modal opens
        });
      }

      setSubmissions(enriched);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load submissions';
      setError(msg);
      console.error('GradeManagement fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Fetch courses for the roster view
  useEffect(() => {
    const loadCourses = async () => {
      try {
        const fetchedCourses = await getCourses();
        setCourses(fetchedCourses);
        if (fetchedCourses.length > 0 && !selectedCourseId) {
          setSelectedCourseId(fetchedCourses[0].id);
        }
      } catch {
        // Non-critical for review queue
      }
    };
    loadCourses();
  }, []);

  // ============================================
  // REVIEW MODAL ACTIONS
  // ============================================

  /**
   * Opens the review modal and lazy-loads the module data
   * so we can display quiz questions alongside student answers.
   */
  const openReview = async (submission: ReviewableSubmission) => {
    setReviewingSubmission(submission);
    setReviewNotes('');
    setOverrideScore(null);
    setShowRejectForm(false);
    setRejectReason('');

    // Load module data if not already cached
    if (!submission.moduleData && submission.courseId && submission.moduleId) {
      setIsLoadingModule(true);
      try {
        const moduleData = await getModuleWithBlocks(submission.courseId, submission.moduleId);
        if (moduleData) {
          // Update the submission in state with loaded module
          const updated = { ...submission, moduleData };
          setReviewingSubmission(updated);
          setSubmissions(prev =>
            prev.map(s => s.enrollment.id === submission.enrollment.id ? updated : s)
          );
        }
      } catch (err) {
        console.error('Failed to load module for review:', err);
      } finally {
        setIsLoadingModule(false);
      }
    }
  };

  /**
   * Approve a submission:
   * 1. Enter a grade via gradeService (creates audit trail)
   * 2. Update enrollment status to 'completed'
   * 3. Refresh the list
   */
  const handleApprove = async () => {
    if (!reviewingSubmission || !user) return;
    setIsSubmittingReview(true);

    const { enrollment, courseId, moduleId } = reviewingSubmission;
    const passingScore = reviewingSubmission.moduleData?.passingScore ?? 80;

    // Use override score if instructor set one, otherwise use the student's original score
    const finalScore = overrideScore ?? enrollment.score ?? 100;

    try {
      // 1. Enter grade through the official gradeService (audit-logged)
      await enterGrade(
        enrollment.userId,
        courseId,
        moduleId,
        finalScore,
        passingScore,
        user.uid,
        user.displayName || 'Instructor',
        reviewNotes || `Instructor review approved. ${overrideScore !== null ? `Score overridden to ${overrideScore}%.` : 'Original score accepted.'}`
      );

      // 2. Update enrollment status to completed
      const enrollmentRef = doc(db, 'enrollments', enrollment.id);
      await updateDoc(enrollmentRef, {
        status: 'completed',
        score: finalScore,
        updatedAt: serverTimestamp(),
      });

      // 3. Trigger course grade recalculation (Cloud Function 6 equivalent)
      try {
        await calculateAndSaveCourseGrade(
          enrollment.userId,
          courseId,
          user.uid,
          user.displayName || 'Instructor'
        );
      } catch (gradeCalcErr) {
        // Non-blocking: grade entry succeeded, recalculation can be retried
        console.warn('Course grade recalculation failed (non-blocking):', gradeCalcErr);
      }

      // 4. Audit the review action specifically
      await auditService.logToFirestore(
        user.uid,
        user.displayName || 'Instructor',
        'ASSESSMENT_GRADE',
        enrollment.id,
        `Approved submission for user ${enrollment.userId} on course ${courseId}. ` +
        `Final score: ${finalScore}%. ` +
        (reviewNotes ? `Notes: ${reviewNotes}` : 'No additional notes.')
      );

      // 5. Close modal and refresh
      setReviewingSubmission(null);
      await fetchSubmissions();

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to approve submission';
      console.error('Approve error:', err);
      alert(`Error: ${msg}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  /**
   * Reject a submission:
   * 1. Reset enrollment status to 'in_progress' (allows retry)
   * 2. Log rejection with reason in audit trail
   * 3. Refresh the list
   */
  const handleReject = async () => {
    if (!reviewingSubmission || !user || !rejectReason.trim()) return;
    setIsSubmittingReview(true);

    const { enrollment, courseId } = reviewingSubmission;

    try {
      // 1. Reset enrollment to in_progress
      const enrollmentRef = doc(db, 'enrollments', enrollment.id);
      await updateDoc(enrollmentRef, {
        status: 'in_progress',
        updatedAt: serverTimestamp(),
      });

      // 2. Audit the rejection
      await auditService.logToFirestore(
        user.uid,
        user.displayName || 'Instructor',
        'ASSESSMENT_GRADE',
        enrollment.id,
        `Rejected submission for user ${enrollment.userId} on course ${courseId}. ` +
        `Reason: ${rejectReason}. Learner may retry.`
      );

      // 3. Close and refresh
      setReviewingSubmission(null);
      await fetchSubmissions();

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reject submission';
      console.error('Reject error:', err);
      alert(`Error: ${msg}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // ============================================
  // ANSWER DISPLAY HELPERS
  // ============================================

  /**
   * Renders a student's answer in a human-readable format
   * based on the question type. Handles all 5 types.
   */
  const renderStudentAnswer = (q: QuizQuestion, answer: any): React.ReactNode => {
    if (answer === undefined || answer === null) {
      return <span className="text-gray-400 italic">(No answer provided)</span>;
    }

    switch (q.type) {
      case 'multiple-choice':
      case 'true-false': {
        const selectedOption = typeof answer === 'number' && q.options[answer]
          ? q.options[answer]
          : String(answer);
        const isCorrect = answer === q.correctAnswer;
        return (
          <div className="flex items-start gap-2">
            <span className={cn(
              'inline-block mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
              isCorrect ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50'
            )}>
              {isCorrect
                ? <Check className="h-2.5 w-2.5 text-green-600" />
                : <X className="h-2.5 w-2.5 text-red-500" />}
            </span>
            <span className={cn('text-sm', isCorrect ? 'text-green-700' : 'text-red-700')}>
              {selectedOption}
            </span>
          </div>
        );
      }

      case 'fill-blank': {
        const correctStr = String(q.correctAnswer).toLowerCase().trim();
        const answerStr = String(answer).toLowerCase().trim();
        const isCorrect = correctStr === answerStr;
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-sm font-medium',
                isCorrect ? 'text-green-700' : 'text-red-700'
              )}>
                "{answer}"
              </span>
              {isCorrect
                ? <Check className="h-3.5 w-3.5 text-green-500" />
                : <X className="h-3.5 w-3.5 text-red-400" />}
            </div>
            {!isCorrect && (
              <p className="text-[10px] text-gray-400">
                Expected: <span className="font-bold text-gray-600">"{q.correctAnswer}"</span>
              </p>
            )}
          </div>
        );
      }

      case 'matching': {
        const pairs = q.matchingPairs || [];
        const answers = Array.isArray(answer) ? answer as string[] : [];
        return (
          <div className="space-y-1.5">
            {pairs.map((pair, pIdx) => {
              const userMatch = answers[pIdx] || '(not matched)';
              const isCorrect = pair.right === userMatch;
              return (
                <div key={pIdx} className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-gray-700 min-w-[100px]">{pair.left}</span>
                  <span className="text-gray-300">=</span>
                  <span className={cn(
                    'font-medium',
                    isCorrect ? 'text-green-700' : 'text-red-600'
                  )}>
                    {userMatch}
                  </span>
                  {isCorrect
                    ? <Check className="h-3 w-3 text-green-500" />
                    : <X className="h-3 w-3 text-red-400" />}
                </div>
              );
            })}
          </div>
        );
      }

      case 'multiple-answer': {
        const correctSet = new Set(
          Array.isArray(q.correctAnswer) ? (q.correctAnswer as number[]) : []
        );
        const selected: number[] = Array.isArray(answer) ? answer : [];
        return (
          <div className="space-y-1.5">
            {(q.options || []).map((opt, oIdx) => {
              const wasSelected = selected.includes(oIdx);
              const isCorrectOption = correctSet.has(oIdx);
              const isRight = wasSelected === isCorrectOption;
              return (
                <div key={oIdx} className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    'inline-block h-4 w-4 rounded border-2 flex-shrink-0 flex items-center justify-center',
                    wasSelected
                      ? (isRight ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50')
                      : (isCorrectOption ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-gray-50')
                  )}>
                    {wasSelected && (isRight
                      ? <Check className="h-2.5 w-2.5 text-green-600" />
                      : <X className="h-2.5 w-2.5 text-red-500" />)}
                    {!wasSelected && isCorrectOption && <span className="text-amber-500 text-[8px] font-bold">!</span>}
                  </span>
                  <span className={cn(
                    'font-medium',
                    wasSelected && isRight && 'text-green-700',
                    wasSelected && !isRight && 'text-red-600',
                    !wasSelected && isCorrectOption && 'text-amber-600',
                    !wasSelected && !isCorrectOption && 'text-gray-400'
                  )}>
                    {opt}
                  </span>
                </div>
              );
            })}
          </div>
        );
      }

      case 'short-answer': {
        return (
          <div className="bg-white p-3 rounded border border-gray-200 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {String(answer)}
          </div>
        );
      }

      default:
        return <span className="text-sm text-gray-600">{JSON.stringify(answer)}</span>;
    }
  };

  // ============================================
  // REVIEW MODAL
  // ============================================

  const renderReviewModal = () => {
    if (!reviewingSubmission) return null;

    const { enrollment, userName, courseTitle, moduleData } = reviewingSubmission;
    const quizBlocks = moduleData?.blocks.filter(b => b.type === 'quiz') || [];

    return (
      <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

          {/* ---- Header ---- */}
          <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary-600" />
                Review Submission
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-medium text-gray-700">{userName}</span> · {courseTitle}
              </p>
              {enrollment.score !== undefined && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Auto-graded score: <span className="font-bold text-gray-600">{enrollment.score}%</span>
                  <span className="ml-1">(provisional — includes essay credit)</span>
                </p>
              )}
            </div>
            <Button variant="ghost" onClick={() => setReviewingSubmission(null)}>Close</Button>
          </div>

          {/* ---- Body: Quiz Questions + Answers ---- */}
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
            {isLoadingModule ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading assessment data...
              </div>
            ) : quizBlocks.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No quiz data available for this submission.</p>
                <p className="text-xs mt-1">Module data may not have loaded correctly.</p>
              </div>
            ) : (
              <div className="space-y-8 max-w-3xl mx-auto">
                {quizBlocks.map(block => {
                  const quiz = block.data as QuizBlockData;
                  const userAnswers = enrollment.quizAnswers?.[block.id] || [];

                  return (
                    <div key={block.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      {/* Quiz title bar */}
                      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <span className="font-bold text-gray-700">{quiz.title || 'Knowledge Check'}</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">
                          {quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Questions */}
                      <div className="p-6 space-y-6">
                        {quiz.questions.map((q, qIdx) => {
                          const ans = userAnswers[qIdx];
                          const isEssay = q.type === 'short-answer';

                          return (
                            <div key={q.id || qIdx} className="space-y-3 pb-6 border-b border-gray-100 last:border-0 last:pb-0">
                              {/* Question header */}
                              <div className="flex justify-between items-start">
                                <p className="font-semibold text-gray-900 text-sm">
                                  <span className="text-gray-400 mr-2">{qIdx + 1}.</span>
                                  {q.question}
                                </p>
                                <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-50 px-2 py-0.5 rounded shrink-0 ml-4">
                                  {q.type}
                                </span>
                              </div>

                              {/* Student answer */}
                              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  Student Response
                                </p>
                                {renderStudentAnswer(q, ans)}
                              </div>

                              {/* Rubric / exemplar — shown for essay questions */}
                              {isEssay && q.correctAnswer && (
                                <div className="bg-primary-50 p-4 rounded-lg border border-primary-100">
                                  <p className="text-[10px] font-bold text-primary-600 uppercase mb-2 flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    Instructor Guidelines / Exemplar
                                  </p>
                                  <p className="text-xs text-primary-900 leading-relaxed">
                                    {String(q.correctAnswer)}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ---- Footer: Actions ---- */}
          <div className="p-6 border-t border-gray-200 bg-white">
            {showRejectForm ? (
              /* ---- Reject Form ---- */
              <div className="space-y-3">
                <p className="text-sm font-bold text-red-700">Reject Submission</p>
                <p className="text-xs text-gray-500">
                  The learner will be returned to "In Progress" and may retry the assessment.
                </p>
                <textarea
                  className="w-full p-3 border border-red-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-300 bg-red-50 text-gray-800"
                  rows={3}
                  placeholder="Reason for rejection (required — this is logged in the audit trail)..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                    disabled={isSubmittingReview}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                    onClick={handleReject}
                    disabled={isSubmittingReview || !rejectReason.trim()}
                  >
                    {isSubmittingReview
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Rejecting...</>
                      : <><X className="h-3.5 w-3.5" /> Confirm Rejection</>}
                  </Button>
                </div>
              </div>
            ) : (
              /* ---- Approve / Reject Buttons ---- */
              <div className="space-y-4">
                {/* Optional score override & notes */}
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      <MessageSquare className="h-3 w-3 inline mr-1" />
                      Review Notes (optional)
                    </label>
                    <input
                      type="text"
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-300 bg-white text-gray-700"
                      placeholder="Add notes visible in the audit trail..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                    />
                  </div>
                  <div className="w-32">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Override Score
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm text-center font-bold outline-none focus:ring-2 focus:ring-primary-300 bg-white text-gray-700"
                        placeholder={String(enrollment.score ?? '—')}
                        value={overrideScore ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOverrideScore(val === '' ? null : Math.max(0, Math.min(100, parseInt(val) || 0)));
                        }}
                      />
                      <span className="text-sm font-bold text-gray-400">%</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                    onClick={() => setShowRejectForm(true)}
                    disabled={isSubmittingReview}
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject & Return
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setReviewingSubmission(null)}
                      disabled={isSubmittingReview}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="gap-1.5"
                      onClick={handleApprove}
                      disabled={isSubmittingReview}
                    >
                      {isSubmittingReview
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
                        : <><Check className="h-4 w-4" /> Approve Submission</>}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // ACCESS CONTROL
  // ============================================

  if (!hasRole || !hasRole(['admin', 'instructor'])) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="bg-white rounded-lg border border-red-200 p-8 max-w-md text-center">
          <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">
            Grade management is restricted to administrators and instructors.
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Review Modal */}
      {renderReviewModal()}

      {/* Page Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary-600" />
            Grade Management Center
          </h1>
          <p className="text-gray-500 mt-1">Review clinical assessments and verify staff competencies.</p>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex bg-white border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => setViewMode('review_queue')}
            className={cn(
              'px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2',
              viewMode === 'review_queue'
                ? 'bg-primary-100 text-primary-800 font-semibold'
                : 'text-gray-500 hover:text-primary-600'
            )}
          >
            <ClipboardCheck className="h-4 w-4" />
            Review Queue
          </button>
          <button
            onClick={() => setViewMode('course_roster')}
            className={cn(
              'px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2',
              viewMode === 'course_roster'
                ? 'bg-primary-100 text-primary-800 font-semibold'
                : 'text-gray-500 hover:text-primary-600'
            )}
          >
            <Users className="h-4 w-4" />
            Course Roster
          </button>
        </div>

        {viewMode === 'review_queue' && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSubmissions}
              disabled={isLoading}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              Refresh
            </Button>

            <div className="flex bg-white border border-gray-200 rounded-lg p-1">
              {[
                { key: 'needs_review' as const, label: 'Needs Review' },
                { key: 'completed' as const, label: 'Verified' },
                { key: 'all' as const, label: 'All' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    'px-4 py-1.5 text-xs font-bold rounded-md transition-all',
                    filter === tab.key
                      ? 'bg-primary-100 text-primary-800 font-semibold'
                      : 'text-gray-500 hover:text-primary-600'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {viewMode === 'course_roster' && courses.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Course:</label>
            <select
              value={selectedCourseId || ''}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Course Roster View */}
      {viewMode === 'course_roster' && selectedCourseId && (
        <CourseRoster courseId={selectedCourseId} />
      )}

      {viewMode === 'course_roster' && !selectedCourseId && (
        <div className="bg-white rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No courses available</p>
          <p className="text-sm text-gray-400 mt-1">Create and publish courses to view the roster.</p>
        </div>
      )}

      {/* Review Queue View */}
      {viewMode === 'review_queue' && (
        <>
      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">{error}</p>
            <p className="text-xs text-red-600 mt-0.5">Check Firestore security rules and network connectivity.</p>
          </div>
        </div>
      )}

      {/* Submissions Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-gray-700">Staff Member</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Course</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Submitted</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Status</th>
              <th className="px-6 py-4 font-semibold text-gray-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                  Loading submissions...
                </td>
              </tr>
            ) : submissions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">
                  No submissions found matching "{filter}".
                </td>
              </tr>
            ) : (
              submissions.map(sub => (
                <tr key={sub.enrollment.id} className="hover:bg-gray-50/50 group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{sub.userName}</div>
                    <div className="text-xs text-gray-400">{sub.userEmail || sub.enrollment.userId}</div>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-700">{sub.courseTitle}</td>
                  <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                    {sub.enrollment.lastAccessedAt ? formatDate(sub.enrollment.lastAccessedAt) : '—'}
                  </td>
                  <td className="px-6 py-4">
                    {sub.enrollment.status === 'needs_review' ? (
                      <span className="flex items-center gap-1.5 text-amber-600 font-bold text-xs uppercase tracking-tight bg-amber-50 px-2 py-1 rounded border border-amber-100 w-fit">
                        <Clock className="h-3.5 w-3.5" />
                        Needs Review
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-green-600 font-bold text-xs uppercase tracking-tight bg-green-50 px-2 py-1 rounded border border-green-100 w-fit">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Verified
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant={sub.enrollment.status === 'needs_review' ? 'primary' : 'outline'}
                      size="sm"
                      className="gap-1.5"
                      onClick={() => openReview(sub)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Review
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
};