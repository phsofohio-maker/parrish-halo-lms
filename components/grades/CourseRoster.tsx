/**
 * CourseRoster Component
 *
 * Admin/Instructor view showing all enrolled learners for a course
 * with their current grade status. Expandable rows show per-module
 * GradeBreakdown inline.
 *
 * @module components/grades/CourseRoster
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Enrollment,
  CourseGradeCalculation,
} from '../../functions/src/types';
import {
  Users,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  Shield,
  CheckCircle,
  XCircle,
  Filter,
  Clock,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { cn, formatDate } from '../../utils';
import { GradeBreakdown } from './GradeBreakdown';
import { getCourseEnrollments } from '../../services/enrollmentService';
import { getCourseGradesForCourse } from '../../services/courseGradeService';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';

interface CourseRosterProps {
  courseId: string;
}

type RosterFilter = 'all' | 'passing' | 'failing' | 'needs_review' | 'not_started';

interface RosterEntry {
  enrollment: Enrollment;
  userName: string;
  userEmail: string;
  courseGrade: CourseGradeCalculation | null;
}

type SortField = 'name' | 'score' | 'completion' | 'status' | 'lastActivity';
type SortDirection = 'asc' | 'desc';

export const CourseRoster: React.FC<CourseRosterProps> = ({ courseId }) => {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const fetchRoster = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch enrollments and course grades in parallel (bulk)
      const [enrollments, allCourseGrades] = await Promise.all([
        getCourseEnrollments(courseId),
        getCourseGradesForCourse(courseId).catch(() => []),
      ]);

      // Index grades by userId for O(1) lookup
      const gradesByUserId = new Map<string, CourseGradeCalculation>(
        allCourseGrades.map(g => [g.userId, g] as [string, CourseGradeCalculation])
      );

      const rosterEntries: RosterEntry[] = [];

      for (const enrollment of enrollments) {
        // Resolve user name
        let userName = 'Unknown Staff';
        let userEmail = '';
        try {
          const userSnap = await getDocs(
            query(collection(db, 'users'), where('uid', '==', enrollment.userId))
          );
          if (!userSnap.empty) {
            const userData = userSnap.docs[0].data();
            userName = userData.displayName || userData.email || 'Unknown';
            userEmail = userData.email || '';
          }
        } catch {
          // Non-critical
        }

        rosterEntries.push({
          enrollment,
          userName,
          userEmail,
          courseGrade: gradesByUserId.get(enrollment.userId) ?? null,
        });
      }

      setEntries(rosterEntries);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load roster';
      setError(msg);
      console.error('CourseRoster fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Filtering
  const filteredEntries = entries.filter(entry => {
    switch (filter) {
      case 'passing':
        return entry.courseGrade?.overallPassed === true;
      case 'failing':
        return entry.courseGrade !== null && entry.courseGrade.overallPassed === false;
      case 'needs_review':
        return entry.enrollment.status === 'needs_review';
      case 'not_started':
        return entry.enrollment.status === 'not_started' || !entry.courseGrade;
      default:
        return true;
    }
  });

  // Sorting
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'name':
        cmp = a.userName.localeCompare(b.userName);
        break;
      case 'score':
        cmp = (a.courseGrade?.overallScore ?? -1) - (b.courseGrade?.overallScore ?? -1);
        break;
      case 'completion':
        cmp = (a.courseGrade?.completionPercent ?? 0) - (b.courseGrade?.completionPercent ?? 0);
        break;
      case 'status':
        cmp = a.enrollment.status.localeCompare(b.enrollment.status);
        break;
      case 'lastActivity':
        cmp = (a.enrollment.lastAccessedAt || '').localeCompare(b.enrollment.lastAccessedAt || '');
        break;
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleExpand = (userId: string) => {
    setExpandedUserId(prev => prev === userId ? null : userId);
  };

  const SortHeader: React.FC<{ field: SortField; label: string; className?: string }> = ({ field, label, className }) => (
    <th
      className={cn('px-6 py-3 font-semibold text-gray-700 cursor-pointer hover:text-primary-600 select-none', className)}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortField === field && (
          <span className="text-primary-600">{sortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </span>
    </th>
  );

  const getStatusBadge = (entry: RosterEntry) => {
    const status = entry.enrollment.status;
    if (status === 'needs_review') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
          Needs Review
        </span>
      );
    }
    if (status === 'not_started') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-50 text-gray-500 border border-gray-200">
          Not Started
        </span>
      );
    }
    if (entry.courseGrade?.overallPassed) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-700 border border-green-200">
          <CheckCircle className="h-3 w-3" />
          Passed
        </span>
      );
    }
    if (status === 'completed' || status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
        In Progress
      </span>
    );
  };

  // Stats
  const totalStudents = entries.length;
  const passing = entries.filter(e => e.courseGrade?.overallPassed).length;
  const failing = entries.filter(e => e.courseGrade && !e.courseGrade.overallPassed).length;
  const avgScore = entries.length > 0
    ? Math.round(entries.reduce((sum, e) => sum + (e.courseGrade?.overallScore ?? 0), 0) / entries.filter(e => e.courseGrade).length) || 0
    : 0;

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-gray-400" />
          <span className="font-bold text-gray-700">{totalStudents}</span>
          <span className="text-gray-500">enrolled</span>
        </div>
        <div className="h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="font-bold text-green-700">{passing}</span>
          <span className="text-gray-500">passing</span>
        </div>
        <div className="h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-2 text-sm">
          <XCircle className="h-4 w-4 text-red-500" />
          <span className="font-bold text-red-700">{failing}</span>
          <span className="text-gray-500">failing</span>
        </div>
        <div className="h-4 w-px bg-gray-200" />
        <div className="text-sm text-gray-500">
          Avg: <span className="font-bold text-gray-700">{avgScore}%</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchRoster} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-gray-400" />
        {([
          { key: 'all' as const, label: 'All' },
          { key: 'passing' as const, label: 'Passing' },
          { key: 'failing' as const, label: 'Failing' },
          { key: 'needs_review' as const, label: 'Needs Review' },
          { key: 'not_started' as const, label: 'Not Started' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'px-3 py-1 text-xs font-bold rounded-md transition-all',
              filter === tab.key
                ? 'bg-primary-600 text-white'
                : 'text-gray-500 hover:text-primary-600 bg-white border border-gray-200'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-8 px-4 py-3" />
              <SortHeader field="name" label="Learner" />
              <SortHeader field="score" label="Overall Score" className="text-center" />
              <SortHeader field="completion" label="Completion" className="text-center" />
              <th className="px-6 py-3 font-semibold text-gray-700 text-center">Critical Modules</th>
              <SortHeader field="status" label="Status" className="text-center" />
              <SortHeader field="lastActivity" label="Last Activity" className="text-center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                  Loading roster...
                </td>
              </tr>
            ) : sortedEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-400 italic">
                  {entries.length === 0
                    ? 'No learners enrolled in this course.'
                    : `No learners matching "${filter}" filter.`}
                </td>
              </tr>
            ) : (
              sortedEntries.map(entry => (
                <React.Fragment key={entry.enrollment.id}>
                  <tr
                    className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                    onClick={() => toggleExpand(entry.enrollment.userId)}
                  >
                    {/* Expand Arrow */}
                    <td className="px-4 py-4">
                      {expandedUserId === entry.enrollment.userId ? (
                        <ChevronDown className="h-4 w-4 text-primary-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </td>

                    {/* Learner Name */}
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{entry.userName}</div>
                      <div className="text-xs text-gray-400">{entry.userEmail || entry.enrollment.userId}</div>
                    </td>

                    {/* Overall Score */}
                    <td className="px-6 py-4 text-center">
                      {entry.courseGrade ? (
                        <span className={cn(
                          'text-lg font-bold',
                          entry.courseGrade.overallPassed ? 'text-green-600' : 'text-red-600'
                        )}>
                          {entry.courseGrade.overallScore}%
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">--</span>
                      )}
                    </td>

                    {/* Completion */}
                    <td className="px-6 py-4 text-center">
                      {entry.courseGrade ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                entry.courseGrade.completionPercent === 100 ? 'bg-green-500' : 'bg-primary-500'
                              )}
                              style={{ width: `${entry.courseGrade.completionPercent}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-gray-600">
                            {entry.courseGrade.completionPercent}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">{entry.enrollment.progress}%</span>
                      )}
                    </td>

                    {/* Critical Modules */}
                    <td className="px-6 py-4 text-center">
                      {entry.courseGrade ? (
                        <span className={cn(
                          'inline-flex items-center gap-1 text-xs font-bold',
                          entry.courseGrade.allCriticalModulesPassed ? 'text-green-600' : 'text-red-600'
                        )}>
                          <Shield className="h-3.5 w-3.5" />
                          {entry.courseGrade.criticalModulesPassed}/{entry.courseGrade.totalCriticalModules}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">--</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(entry)}
                    </td>

                    {/* Last Activity */}
                    <td className="px-6 py-4 text-center text-xs text-gray-500 font-mono">
                      {entry.enrollment.lastAccessedAt
                        ? formatDate(entry.enrollment.lastAccessedAt)
                        : '--'}
                    </td>
                  </tr>

                  {/* Expanded GradeBreakdown */}
                  {expandedUserId === entry.enrollment.userId && (
                    <tr>
                      <td colSpan={7} className="px-8 py-6 bg-gray-50">
                        {entry.courseGrade ? (
                          <GradeBreakdown calculation={entry.courseGrade} />
                        ) : (
                          <div className="text-center py-8 text-gray-400">
                            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="font-medium text-gray-500">Grade Not Yet Calculated</p>
                            <p className="text-xs mt-1">This learner's course grade will appear here once their assessments are graded.</p>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
