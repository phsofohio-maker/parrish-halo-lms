/**
 * GradeBreakdown Component
 *
 * Displays the module-by-module breakdown of a course grade.
 * Shows each module's raw score, weight, weighted contribution,
 * critical flag, and pass/fail status.
 *
 * @module components/grades/GradeBreakdown
 */
import React from 'react';
import { CourseGradeCalculation, ModuleScore } from '../../functions/src/types';
import { Shield, CheckCircle, XCircle, Minus } from 'lucide-react';
import { cn } from '../../utils';

interface GradeBreakdownProps {
  calculation: CourseGradeCalculation;
  showWeights?: boolean;
}

const getStatusColor = (passed: boolean | null): string => {
  if (passed === null) return 'text-amber-600 bg-amber-50 border-amber-200';
  return passed ? 'text-green-600 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200';
};

const getStatusLabel = (passed: boolean | null): string => {
  if (passed === null) return 'Pending';
  return passed ? 'Passed' : 'Failed';
};

const getScoreDisplay = (score: number | null): string => {
  if (score === null) return '--';
  return `${score}%`;
};

const getWeightedDisplay = (weighted: number | null): string => {
  if (weighted === null) return '--';
  return weighted.toFixed(1);
};

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

export const GradeBreakdown: React.FC<GradeBreakdownProps> = ({
  calculation,
  showWeights = true,
}) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 px-6 py-4 flex justify-between items-center">
        <h3 className="text-white font-bold text-sm">Module Grade Breakdown</h3>
        <span className="text-gray-400 text-xs font-medium">
          {calculation.gradedModules}/{calculation.totalModules} modules graded
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 font-semibold text-gray-700">Module</th>
              <th className="px-6 py-3 font-semibold text-gray-700 text-center">Score</th>
              {showWeights && (
                <>
                  <th className="px-6 py-3 font-semibold text-gray-700 text-center">Weight</th>
                  <th className="px-6 py-3 font-semibold text-gray-700 text-center">Weighted</th>
                </>
              )}
              <th className="px-6 py-3 font-semibold text-gray-700 text-center">Critical</th>
              <th className="px-6 py-3 font-semibold text-gray-700 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {calculation.moduleBreakdown.map((mod: ModuleScore) => (
              <tr
                key={mod.moduleId}
                className={cn(
                  'hover:bg-gray-50/50 transition-colors',
                  mod.isCritical && 'bg-gray-50/30'
                )}
              >
                {/* Module Name */}
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {mod.isCritical && (
                      <Shield className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                    <span className="font-medium text-gray-900">{mod.moduleTitle}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Passing: {mod.passingScore}%
                  </p>
                </td>

                {/* Raw Score */}
                <td className="px-6 py-4 text-center">
                  <span className={cn(
                    'font-bold',
                    mod.score === null
                      ? 'text-gray-400'
                      : mod.passed
                        ? 'text-green-600'
                        : mod.passed === false
                          ? 'text-red-600'
                          : 'text-gray-700'
                  )}>
                    {getScoreDisplay(mod.score)}
                  </span>
                </td>

                {/* Weight */}
                {showWeights && (
                  <>
                    <td className="px-6 py-4 text-center text-gray-500 font-mono text-xs">
                      {mod.weight}%
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-xs font-bold text-gray-700">
                      {getWeightedDisplay(mod.weightedScore)}
                    </td>
                  </>
                )}

                {/* Critical Flag */}
                <td className="px-6 py-4 text-center">
                  {mod.isCritical ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                      <Shield className="h-3 w-3" />
                      Required
                    </span>
                  ) : (
                    <Minus className="h-4 w-4 text-gray-300 mx-auto" />
                  )}
                </td>

                {/* Status */}
                <td className="px-6 py-4 text-center">
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border',
                    getStatusColor(mod.passed)
                  )}>
                    {mod.passed === null ? (
                      <Minus className="h-3 w-3" />
                    ) : mod.passed ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {getStatusLabel(mod.passed)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* Overall Score + Progress Ring */}
          <div className="flex items-center gap-6">
            {/* Completion Progress Ring */}
            <div className="relative shrink-0">
              <svg width="56" height="56" className="-rotate-90">
                <circle cx="28" cy="28" r="22" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle
                  cx="28" cy="28" r="22" fill="none"
                  stroke={calculation.completionPercent === 100 ? '#16a34a' : '#2563eb'}
                  strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 22}
                  strokeDashoffset={2 * Math.PI * 22 - (calculation.completionPercent / 100) * 2 * Math.PI * 22}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold text-gray-700">
                  {calculation.completionPercent}%
                </span>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Overall Score</p>
              <p className={cn(
                'text-2xl font-bold',
                calculation.overallPassed ? 'text-green-600' : 'text-red-600'
              )}>
                {calculation.overallScore}%
              </p>
            </div>

            {/* Competency Badge */}
            {(() => {
              const competency = getCompetencyLevel(calculation.overallScore);
              return (
                <span className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border',
                  competencyColors[competency]
                )}>
                  {competency}
                </span>
              );
            })()}
          </div>

          {/* Critical Modules Status */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Critical Modules</p>
              <p className={cn(
                'text-sm font-bold',
                calculation.allCriticalModulesPassed ? 'text-green-600' : 'text-red-600'
              )}>
                {calculation.criticalModulesPassed}/{calculation.totalCriticalModules} passed
              </p>
            </div>
            <div className={cn(
              'h-10 w-10 rounded-full flex items-center justify-center',
              calculation.allCriticalModulesPassed
                ? 'bg-green-100 text-green-600'
                : 'bg-red-100 text-red-600'
            )}>
              {calculation.allCriticalModulesPassed ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
