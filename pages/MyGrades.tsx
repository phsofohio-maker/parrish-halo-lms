/**
 * My Grades Page - Firestore Integration
 *
 * Converted from template's props version to use Firestore.
 * Fetches the current user's enrollments and resolves course data
 * to display a personal transcript view.
 *
 * @module pages/MyGrades
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Enrollment, Course, CourseGradeCalculation } from '../functions/src/types';
import { GraduationCap, Award, FileText, CheckCircle2, Download, Printer, Clock, Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { GradeBreakdown } from '../components/grades/GradeBreakdown';
import { formatDate, cn } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { getUserEnrollments } from '../services/enrollmentService';
import { getPublishedCourses } from '../services/courseService';
import { getSavedCourseGrade } from '../services/courseGradeService';

export const MyGrades: React.FC = () => {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseGrades, setCourseGrades] = useState<Record<string, CourseGradeCalculation>>({});
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);

    try {
      const [fetchedEnrollments, fetchedCourses] = await Promise.all([
        getUserEnrollments(user.uid),
        getPublishedCourses(),
      ]);
      setEnrollments(fetchedEnrollments);
      setCourses(fetchedCourses);

      // Fetch course grades for completed enrollments
      const grades: Record<string, CourseGradeCalculation> = {};
      for (const enrollment of fetchedEnrollments) {
        try {
          const grade = await getSavedCourseGrade(user.uid, enrollment.courseId);
          if (grade) {
            grades[enrollment.courseId] = grade;
          }
        } catch {
          // Grade may not exist yet
        }
      }
      setCourseGrades(grades);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load grades';
      setError(msg);
      console.error('MyGrades fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!user) return null;

  const completed = enrollments.filter(e => e.status === 'completed');
  const inProgress = enrollments.filter(e => e.status === 'in_progress' || e.status === 'needs_review');

  const getCourse = (id: string) => courses.find(c => c.id === id);

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 leading-none">
            <GraduationCap className="h-8 w-8 text-primary-600" />
            Educational Transcript
          </h1>
          <p className="text-gray-500 mt-2">Official record of completed training and continuing education units.</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading} className="gap-2">
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                Refresh
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
                <Printer className="h-4 w-4" />
                Print Transcript
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Export PDF
            </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs relative overflow-hidden">
            <Award className="absolute -bottom-4 -right-4 h-24 w-24 opacity-20 rotate-12 text-primary-100" />
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Total Credits</p>
            <p className="text-3xl font-bold text-gray-900">{completed.reduce((acc, e) => acc + (getCourse(e.courseId)?.ceCredits || 0), 0).toFixed(1)} <span className="text-lg text-gray-500">CEU</span></p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs">
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Courses Passed</p>
            <p className="text-3xl font-bold text-gray-900">{completed.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs">
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Compliance Rate</p>
            <p className="text-3xl font-bold text-gray-900">{enrollments.length > 0 ? Math.round((completed.length / enrollments.length) * 100) : 100}%</p>
        </div>
      </div>

      <div className="space-y-12">
        <section>
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Completed Curricula
          </h3>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
            {completed.length === 0 ? (
                <div className="p-12 text-center text-gray-400 italic">No completed courses yet.</div>
            ) : (
                completed.map(e => {
                    const c = getCourse(e.courseId);
                    const grade = courseGrades[e.courseId];
                    const isExpanded = expandedCourseId === e.courseId;
                    return (
                        <div key={e.id}>
                            <div
                                className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => grade && setExpandedCourseId(isExpanded ? null : e.courseId)}
                            >
                                <div className="flex items-center gap-4">
                                    {grade ? (
                                        isExpanded
                                            ? <ChevronDown className="h-5 w-5 text-primary-500 shrink-0" />
                                            : <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                                    ) : (
                                        <div className="h-10 w-10 bg-green-50 rounded-lg flex items-center justify-center text-green-600">
                                            <FileText className="h-6 w-6" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="font-bold text-gray-900">{c?.title || 'Unknown Course'}</p>
                                        <p className="text-xs text-gray-500">Earned: {e.completedAt ? formatDate(e.completedAt) : e.lastAccessedAt ? formatDate(e.lastAccessedAt) : 'N/A'} - {c?.ceCredits || 0} CE Credits</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">Grade</p>
                                        <p className="text-sm font-bold text-green-600">{grade ? `${grade.overallScore}%` : e.score !== undefined ? `${e.score}%` : 'Pass'}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" className="text-primary-600">Certificate</Button>
                                </div>
                            </div>
                            {isExpanded && grade && (
                                <div className="px-6 pb-6">
                                    <GradeBreakdown calculation={grade} />
                                </div>
                            )}
                        </div>
                    );
                })
            )}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            In Progress & Awaiting Review
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {inProgress.length === 0 ? (
                <div className="text-gray-400 italic text-sm">No active enrollments.</div>
            ) : (
                inProgress.map(e => {
                    const c = getCourse(e.courseId);
                    return (
                        <div key={e.id} className="bg-white p-5 rounded-lg border border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden">
                                    {c?.thumbnailUrl ? (
                                      <img src={c.thumbnailUrl} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full bg-gray-200" />
                                    )}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900">{c?.title || 'Unknown Course'}</p>
                                    <p className="text-xs text-gray-500">Status: {e.status === 'needs_review' ? 'Awaiting Instructor' : 'In Progress'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="w-32">
                                    <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1">
                                        <span>PROGRESS</span>
                                        <span>{e.progress}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary-500" style={{ width: `${e.progress}%` }} />
                                    </div>
                                </div>
                                <Button size="sm" variant="outline">Resume</Button>
                            </div>
                        </div>
                    );
                })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
