/**
 * GradeSummaryCard Component
 *
 * Compact card showing a learner's overall course grade at a glance.
 * Used on Dashboard and MyGrades pages.
 *
 * @module components/grades/GradeSummaryCard
 */
import React from 'react';
import { CourseGradeDoc, CourseGradeCalculation } from '../../functions/src/types';
import { Shield, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { cn } from '../../utils';

interface GradeSummaryCardProps {
  courseGrade: CourseGradeDoc | CourseGradeCalculation;
  courseTitle: string;
  onClick?: () => void;
}

type CompetencyLevel = 'Mastery' | 'Competent' | 'Developing' | 'Not Competent';

const getCompetencyLevel = (score: number): CompetencyLevel => {
  if (score >= 90) return 'Mastery';
  if (score >= 80) return 'Competent';
  if (score >= 70) return 'Developing';
  return 'Not Competent';
};

const competencyColors: Record<CompetencyLevel, string> = {
  'Mastery': 'bg-green-100 text-green-700 border-green-200',
  'Competent': 'bg-blue-100 text-blue-700 border-blue-200',
  'Developing': 'bg-amber-100 text-amber-700 border-amber-200',
  'Not Competent': 'bg-red-100 text-red-700 border-red-200',
};

const scoreColors: Record<CompetencyLevel, string> = {
  'Mastery': 'text-green-600',
  'Competent': 'text-blue-600',
  'Developing': 'text-amber-600',
  'Not Competent': 'text-red-600',
};

export const GradeSummaryCard: React.FC<GradeSummaryCardProps> = ({
  courseGrade,
  courseTitle,
  onClick,
}) => {
  const competency = getCompetencyLevel(courseGrade.overallScore);
  const circumference = 2 * Math.PI * 28; // radius = 28
  const dashOffset = circumference - (courseGrade.completionPercent / 100) * circumference;

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg border border-gray-200 shadow-sm p-5 transition-all',
        onClick && 'cursor-pointer hover:shadow-md hover:border-primary-200 group'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Completion Ring */}
        <div className="relative shrink-0">
          <svg width="68" height="68" className="-rotate-90">
            {/* Background circle */}
            <circle
              cx="34"
              cy="34"
              r="28"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="5"
            />
            {/* Progress circle */}
            <circle
              cx="34"
              cy="34"
              r="28"
              fill="none"
              stroke={courseGrade.overallPassed ? '#16a34a' : courseGrade.completionPercent > 0 ? '#2563eb' : '#94a3b8'}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn('text-sm font-bold', scoreColors[competency])}>
              {courseGrade.overallScore}%
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="font-bold text-gray-900 text-sm truncate group-hover:text-primary-600 transition-colors">
                {courseTitle}
              </h4>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {/* Pass/Fail Badge */}
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border',
                  courseGrade.overallPassed
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                )}>
                  {courseGrade.overallPassed ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {courseGrade.overallPassed ? 'Passed' : 'Failed'}
                </span>

                {/* Competency Badge */}
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border',
                  competencyColors[competency]
                )}>
                  {competency}
                </span>
              </div>
            </div>

            {onClick && (
              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary-500 transition-colors shrink-0 mt-1" />
            )}
          </div>

          {/* Critical Modules */}
          <div className="flex items-center gap-1.5 mt-3">
            <Shield className="h-3.5 w-3.5 text-gray-400" />
            <span className={cn(
              'text-xs font-medium',
              courseGrade.allCriticalModulesPassed ? 'text-green-600' : 'text-red-600'
            )}>
              {courseGrade.criticalModulesPassed}/{courseGrade.totalCriticalModules} critical passed
            </span>
            <span className="text-gray-300 mx-1">|</span>
            <span className="text-xs text-gray-400">
              {courseGrade.gradedModules}/{courseGrade.totalModules} modules graded
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
