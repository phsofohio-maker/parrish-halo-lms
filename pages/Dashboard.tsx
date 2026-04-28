/**
 * Dashboard Page
 * 
 * Main landing page showing compliance overview and assigned courses.
 * Now fetches real data from Firestore.
 * 
 * @module pages/Dashboard
 */

import React, { useState, useEffect } from 'react';
import { User } from '../functions/src/types';
import { useCourses } from '../hooks/useCourses';
import { useUserTranscript } from '../hooks/useCourseGrades';
import { useUserEnrollments } from '../hooks/useUserEnrollments';
import { usePageLoadTracking } from '../hooks/usePageLoadTracking';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { GradeSummaryCard } from '../components/grades/GradeSummaryCard';
import {
  Clock,
  AlertTriangle,
  PlayCircle,
  Award,
  Loader2,
  AlertCircle,
  BookOpen,
  Plus,
  RefreshCw,
  GraduationCap,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../utils';
import { getLastActiveModuleProgress, ModuleProgressRecord } from '../services/progressService';
import { getModules } from '../services/courseService';

interface DashboardProps {
  user: User;
  onNavigate: (path: string, context?: Record<string, any>) => void;
}

// Relative time formatting
const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString();
};

interface ActiveEnrollmentInfo {
  courseId: string;
  lastProgress: ModuleProgressRecord | null;
  lastModuleTitle: string | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onNavigate }) => {
  usePageLoadTracking('dashboard');
  const { hasRole } = useAuth();
  const { courses, isLoading, error, refetch } = useCourses();
  const { courseGrades, isLoading: gradesLoading } = useUserTranscript();
  const { enrollments, isLoading: enrollmentsLoading } = useUserEnrollments();

  // Fix 2.2: Last active module per enrollment
  const [activeInfo, setActiveInfo] = useState<Record<string, ActiveEnrollmentInfo>>({});

  const canAuthor = hasRole(['admin', 'content_author']);

  // Active (in-progress) enrollments
  const activeEnrollments = enrollments.filter(e =>
    e.status === 'in_progress' || e.status === 'not_started' || e.status === 'needs_review'
  );

  // Fetch last active module for each active enrollment
  useEffect(() => {
    if (!user?.uid || activeEnrollments.length === 0) return;

    const fetchActiveInfo = async () => {
      const info: Record<string, ActiveEnrollmentInfo> = {};

      await Promise.all(activeEnrollments.map(async (enrollment) => {
        try {
          const [lastProgress, modules] = await Promise.all([
            getLastActiveModuleProgress(user.uid, enrollment.courseId),
            getModules(enrollment.courseId),
          ]);

          const lastModuleTitle = lastProgress
            ? modules.find(m => m.id === lastProgress.moduleId)?.title || null
            : null;

          info[enrollment.courseId] = { courseId: enrollment.courseId, lastProgress, lastModuleTitle };
        } catch {
          info[enrollment.courseId] = { courseId: enrollment.courseId, lastProgress: null, lastModuleTitle: null };
        }
      }));

      setActiveInfo(info);
    };

    fetchActiveInfo();
  }, [user?.uid, activeEnrollments.length]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user.displayName}
          </h1>
          <p className="text-gray-500 mt-2">
            Here is your compliance overview for {new Date().toLocaleDateString()}
          </p>
        </div>
        {canAuthor && (
          <Button onClick={() => onNavigate('/builder')}>
            <Plus className="h-4 w-4 mr-2" />
            New Module
          </Button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center text-primary-700">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Pending Courses</p>
            <p className="text-2xl font-bold text-gray-900">
              {isLoading ? '—' : courses.filter((c) => c.status !== 'archived').length}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center text-primary-700">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">CE Credits Earned</p>
            <p className="text-2xl font-bold text-gray-900">0.0</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Compliance Alerts</p>
            <p className="text-2xl font-bold text-gray-900">0</p>
          </div>
        </div>
      </div>

      {/* Fix 2.2: Active Enrollments with Resume Context */}
      {activeEnrollments.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-primary-500" />
            Continue Learning
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeEnrollments.map(enrollment => {
              const course = courses.find(c => c.id === enrollment.courseId);
              if (!course) return null;
              const info = activeInfo[enrollment.courseId];
              const lastModuleTitle = info?.lastModuleTitle;
              const lastUpdated = info?.lastProgress?.updatedAt;

              return (
                <div
                  key={enrollment.id}
                  className="bg-white rounded-lg border border-gray-200 p-5 hover:border-primary-300 hover:shadow-sm transition-all"
                >
                  <h3 className="font-bold text-gray-900 mb-2 line-clamp-1">{course.title}</h3>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Progress</span>
                      <span className="font-medium text-gray-700">{enrollment.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 transition-all"
                        style={{ width: `${enrollment.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Last active info */}
                  {lastModuleTitle && (
                    <p className="text-xs text-gray-500 mb-1 line-clamp-1">
                      Last active: {lastModuleTitle}
                    </p>
                  )}
                  {lastUpdated && (
                    <p className="text-xs text-gray-400 mb-3">
                      {formatRelativeTime(lastUpdated)}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {info?.lastProgress ? (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => onNavigate('/player', {
                          courseId: enrollment.courseId,
                          moduleId: info.lastProgress!.moduleId,
                          courseCategory: course.category,
                        })}
                      >
                        Continue{lastModuleTitle ? ` ${lastModuleTitle}` : ''}
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => onNavigate('/course', { courseId: enrollment.courseId })}
                      >
                        <PlayCircle className="h-3 w-3 mr-1" />
                        Start Course
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigate('/course', { courseId: enrollment.courseId })}
                    >
                      View
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grade Summary Cards */}
      {courseGrades.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary-500" />
            Your Course Grades
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courseGrades.map(grade => {
              const course = courses.find(c => c.id === grade.courseId);
              return (
                <GradeSummaryCard
                  key={`${grade.userId}_${grade.courseId}`}
                  courseGrade={grade}
                  courseTitle={course?.title || 'Unknown Course'}
                  onClick={() => onNavigate('/my-grades')}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Course List Section */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">
            {canAuthor ? 'All Courses' : 'Assigned Training'}
          </h2>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={refetch}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('/courses')}>
              View All
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Failed to load courses</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-gray-200 h-64 animate-pulse"
              >
                <div className="h-32 bg-gray-100" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium mb-2">No courses available</p>
            <p className="text-sm text-gray-400 mb-6">
              {canAuthor
                ? 'Create your first course to get started'
                : 'Courses will appear here when assigned'}
            </p>
            {canAuthor && (
              <Button onClick={() => onNavigate('/builder')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Course
              </Button>
            )}
          </div>
        ) : (
          /* Course Cards */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <div
                key={course.id}
                className="group bg-white rounded-lg border border-gray-200 overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:shadow-sm active:translate-y-0 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none"
                onClick={() => onNavigate('/course', { courseId: course.id })}
              >
                {/* Thumbnail */}
                <div className="h-32 bg-gray-100 relative overflow-hidden">
                  {course.thumbnailUrl ? (
                    <img
                      src={course.thumbnailUrl}
                      alt={course.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary-800">
                      <BookOpen className="h-8 w-8 text-white/50" />
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/20 backdrop-blur-sm border border-white/30 text-white">
                      {course.category}
                    </span>
                    {course.status === 'draft' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/80 text-white">
                        Draft
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-bold text-gray-900 mb-1 line-clamp-1 group-hover:text-primary-600 transition-colors">
                    {course.title}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2 min-h-[40px]">
                    {course.description || 'No description'}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {course.modules?.length || 0} modules
                      </span>
                      <span className="flex items-center gap-1">
                        <Award className="h-3 w-3" />
                        {course.ceCredits} CE
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate('/course', { courseId: course.id });
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <PlayCircle className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};