/**
 * Skill-Gap Dashboard
 *
 * Admin view: completion rates, overdue training, expiring credentials,
 * and per-course performance. Aggregates client-side via skillGapService.
 *
 * @module pages/SkillGapDashboard
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart3,
  AlertTriangle,
  Activity,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  Award,
  Users as UsersIcon,
  ShieldAlert,
  ScrollText,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn, formatDate } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { usePageLoadTracking } from '../hooks/usePageLoadTracking';
import {
  getSkillGapData,
  SkillGapData,
  SkillGapFilters,
  StaffComplianceRow,
  ComplianceStatus,
  ExpiringEntry,
} from '../services/skillGapService';

const STATUS_COLOR: Record<ComplianceStatus, { row: string; pill: string; label: string }> = {
  compliant: {
    row: 'bg-green-50/40 hover:bg-green-50',
    pill: 'bg-green-100 text-green-700',
    label: 'Compliant',
  },
  at_risk: {
    row: 'bg-amber-50/40 hover:bg-amber-50',
    pill: 'bg-amber-100 text-amber-700',
    label: 'At Risk',
  },
  non_compliant: {
    row: 'bg-red-50/40 hover:bg-red-50',
    pill: 'bg-red-100 text-red-700',
    label: 'Non-Compliant',
  },
};

const last90DaysISO = (): { start: string; end: string } => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone?: 'neutral' | 'warning' | 'critical' | 'positive';
  hint?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon: Icon, tone = 'neutral', hint }) => {
  const toneClass =
    tone === 'critical' ? 'text-red-600' :
    tone === 'warning' ? 'text-amber-600' :
    tone === 'positive' ? 'text-green-600' :
    'text-gray-900';
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">{label}</p>
          <p className={cn('text-3xl font-bold', toneClass)}>{value}</p>
          {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
        </div>
        <Icon className={cn('h-6 w-6 shrink-0', toneClass)} strokeWidth={1.5} />
      </div>
    </div>
  );
};

const ExpiryGroup: React.FC<{ title: string; items: ExpiringEntry[]; tone: 'red' | 'amber' | 'gray' }> = ({
  title, items, tone,
}) => {
  const headerColor =
    tone === 'red' ? 'text-red-600' :
    tone === 'amber' ? 'text-amber-600' : 'text-gray-500';
  if (items.length === 0) return null;
  return (
    <div className="mb-5">
      <p className={cn('text-xs font-bold uppercase tracking-widest mb-3', headerColor)}>
        {title} ({items.length})
      </p>
      <div className="space-y-1">
        {items.map((entry, idx) => (
          <div key={`${entry.userId}-${entry.certId || entry.source}-${idx}`} className="flex items-center justify-between py-2 px-3 rounded-md bg-white border border-gray-100 text-sm">
            <div className="flex items-center gap-3 min-w-0">
              {entry.source === 'license' ? (
                <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
              ) : (
                <Award className="h-4 w-4 text-primary-500 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{entry.staffName}</p>
                <p className="text-xs text-gray-500 truncate">
                  {entry.source === 'license' ? 'Clinical license' : `${entry.courseName || 'Certificate'} · ${entry.certId}`}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-xs font-bold text-gray-900">{formatDate(entry.expiryDate)}</p>
              <p className="text-[11px] text-gray-400">{entry.daysUntilExpiry}d</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SkillGapDashboard: React.FC = () => {
  usePageLoadTracking('skill_gap_dashboard');
  const { user, hasRole } = useAuth();
  const [data, setData] = useState<SkillGapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Filter state
  const defaults = useMemo(() => last90DaysISO(), []);
  const [department, setDepartment] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(defaults.start);
  const [endDate, setEndDate] = useState<string>(defaults.end);
  const [status, setStatus] = useState<SkillGapFilters['status']>('all');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters: SkillGapFilters = {
        department: department || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status,
      };
      const result = await getSkillGapData(filters);
      setData(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load skill-gap data';
      setError(msg);
      console.error('SkillGapDashboard fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [department, startDate, endDate, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Admin gate — render a friendly message if non-admin somehow reaches the route.
  if (!user) return null;
  if (!hasRole(['admin'])) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-amber-500" />
          <p className="text-sm font-medium text-amber-900">
            The Skill-Gap Dashboard is restricted to administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary-600" />
            Skill-Gap Dashboard
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Compliance overview across staff, courses, and credentials.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading} className="gap-2">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col">
          <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Department</label>
          <select
            value={department}
            onChange={e => setDepartment(e.target.value)}
            className="h-9 px-3 text-sm border border-gray-200 rounded-md bg-white"
          >
            <option value="">All departments</option>
            {data?.departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="h-9 px-3 text-sm border border-gray-200 rounded-md"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="h-9 px-3 text-sm border border-gray-200 rounded-md"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as SkillGapFilters['status'])}
            className="h-9 px-3 text-sm border border-gray-200 rounded-md bg-white"
          >
            <option value="all">All</option>
            <option value="compliant">Compliant</option>
            <option value="at_risk">At Risk</option>
            <option value="non_compliant">Non-Compliant</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <SummaryCard
              label="Total Staff"
              value={data.totalStaff}
              icon={UsersIcon}
              hint={`${data.overallCompletionRate}% overall completion`}
            />
            <SummaryCard
              label="Overdue Training"
              value={data.totalOverdue}
              icon={AlertTriangle}
              tone={data.totalOverdue > 0 ? 'critical' : 'neutral'}
            />
            <SummaryCard
              label="Expiring (30 days)"
              value={data.expiringWithin30}
              icon={Clock}
              tone={data.expiringWithin30 > 0 ? 'warning' : 'neutral'}
              hint={`${data.expiringWithin90} within 90d`}
            />
            <SummaryCard
              label="Avg Pass Rate"
              value={`${data.averagePassRate}%`}
              icon={CheckCircle2}
              tone={data.averagePassRate >= 70 ? 'positive' : 'warning'}
            />
            <SummaryCard
              label="Policy Compliance"
              value={`${data.policyComplianceRate}%`}
              icon={ScrollText}
              tone={data.policyComplianceRate >= 90 ? 'positive' : data.policyComplianceRate >= 70 ? 'warning' : 'critical'}
              hint={`${data.policySignedTotal}/${data.policyRequiredTotal} signed`}
            />
          </div>

          {/* Staff compliance table */}
          <section className="mb-10">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary-500" />
              Staff Compliance
            </h2>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-[11px] font-bold uppercase tracking-widest text-gray-400">
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Department</th>
                      <th className="text-right px-4 py-3">Completed</th>
                      <th className="text-right px-4 py-3">Overdue</th>
                      <th className="text-right px-4 py-3">License</th>
                      <th className="text-right px-4 py-3">Last Activity</th>
                      <th className="text-center px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.staffCompliance.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-gray-400 italic py-12">
                          No staff match the current filters.
                        </td>
                      </tr>
                    ) : (
                      data.staffCompliance.map(staff => (
                        <StaffRow
                          key={staff.userId}
                          staff={staff}
                          isExpanded={expandedUserId === staff.userId}
                          onToggle={() =>
                            setExpandedUserId(expandedUserId === staff.userId ? null : staff.userId)
                          }
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Course performance */}
          <section className="mb-10">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary-500" />
              Course Performance
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.coursePerformance.length === 0 ? (
                <div className="col-span-full text-gray-400 italic text-sm py-8 text-center">
                  No course data in range.
                </div>
              ) : (
                data.coursePerformance.map(course => (
                  <div
                    key={course.courseId}
                    className={cn(
                      'bg-white border rounded-lg p-5',
                      course.flagged ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <p className="font-bold text-gray-900 leading-tight pr-2">{course.title}</p>
                      {course.flagged && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                          Flagged
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[11px] text-gray-400 uppercase font-bold tracking-widest">Enrollments</p>
                        <p className="font-semibold text-gray-900">{course.enrollmentCount}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 uppercase font-bold tracking-widest">Completion</p>
                        <p className="font-semibold text-gray-900">{course.completionRate}%</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 uppercase font-bold tracking-widest">Avg Score</p>
                        <p className="font-semibold text-gray-900">
                          {course.averageScore !== null ? `${course.averageScore}%` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 uppercase font-bold tracking-widest">Pass Rate</p>
                        <p className={cn(
                          'font-semibold',
                          course.passRate === null ? 'text-gray-900' :
                          course.passRate < 70 ? 'text-amber-600' : 'text-green-600'
                        )}>
                          {course.passRate !== null ? `${course.passRate}%` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Policy compliance */}
          <section className="mb-10">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary-500" />
              Policy Compliance
            </h2>
            {data.policyCompliance.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm italic text-gray-400">
                No active policies with required signatures.
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <ul className="divide-y divide-gray-100">
                  {data.policyCompliance.map(policy => {
                    const pct = policy.required
                      ? Math.round((policy.signed / policy.required) * 100)
                      : 100;
                    return (
                      <li key={policy.policyId} className="px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-bold text-gray-900">{policy.title}</p>
                            <p className="text-xs text-gray-500">
                              v{policy.version} · {policy.signed}/{policy.required} signed
                              {policy.outdated > 0 && (
                                <span className="ml-2 text-amber-600">· {policy.outdated} on outdated version</span>
                              )}
                            </p>
                          </div>
                          <span className={cn(
                            'text-sm font-bold',
                            pct >= 90 ? 'text-green-600' :
                            pct >= 70 ? 'text-amber-600' : 'text-red-600'
                          )}>{pct}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                          <div
                            className={cn(
                              'h-full',
                              pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {policy.unsignedStaffNames.length > 0 && (
                          <p className="text-[11px] text-gray-500 truncate">
                            <span className="font-semibold text-gray-600">Pending: </span>
                            {policy.unsignedStaffNames.slice(0, 6).join(', ')}
                            {policy.unsignedStaffNames.length > 6 && ` · +${policy.unsignedStaffNames.length - 6} more`}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          {/* Expiring credentials */}
          <section>
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-500" />
              Expiring Credentials
            </h2>
            <div className="bg-gray-50/60 rounded-lg p-4">
              {data.expiringCerts.length === 0 ? (
                <p className="text-sm italic text-gray-400 text-center py-8">
                  No credentials expire within 90 days.
                </p>
              ) : (
                <>
                  <ExpiryGroup
                    title="Expiring this month"
                    items={data.expiringCerts.filter(e => e.daysUntilExpiry <= 30)}
                    tone="red"
                  />
                  <ExpiryGroup
                    title="Expiring 31–60 days"
                    items={data.expiringCerts.filter(e => e.daysUntilExpiry > 30 && e.daysUntilExpiry <= 60)}
                    tone="amber"
                  />
                  <ExpiryGroup
                    title="Expiring 61–90 days"
                    items={data.expiringCerts.filter(e => e.daysUntilExpiry > 60 && e.daysUntilExpiry <= 90)}
                    tone="gray"
                  />
                </>
              )}
            </div>
          </section>

          <p className="text-[11px] text-gray-400 mt-8 text-right">
            Computed {formatDate(data.computedAt)}
          </p>
        </>
      ) : null}
    </div>
  );
};

interface StaffRowProps {
  staff: StaffComplianceRow;
  isExpanded: boolean;
  onToggle: () => void;
}

const StaffRow: React.FC<StaffRowProps> = ({ staff, isExpanded, onToggle }) => {
  const tone = STATUS_COLOR[staff.status];
  return (
    <>
      <tr
        className={cn('cursor-pointer transition-colors border-t border-gray-100', tone.row)}
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {isExpanded
              ? <ChevronDown className="h-4 w-4 text-gray-400" />
              : <ChevronRight className="h-4 w-4 text-gray-400" />}
            <div>
              <p className="font-semibold text-gray-900">{staff.displayName}</p>
              <p className="text-[11px] text-gray-500">{staff.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-gray-600">
          {staff.department || <span className="text-gray-300 italic">—</span>}
        </td>
        <td className="px-4 py-3 text-right text-gray-900 font-semibold">
          {staff.completedEnrollments}/{staff.totalEnrollments}
        </td>
        <td className={cn('px-4 py-3 text-right font-semibold', staff.overdueCount > 0 ? 'text-red-600' : 'text-gray-300')}>
          {staff.overdueCount}
        </td>
        <td className="px-4 py-3 text-right">
          {staff.licenseExpiry ? (
            <span className={cn(
              'text-xs font-semibold',
              staff.daysUntilLicenseExpiry !== undefined && staff.daysUntilLicenseExpiry < 0 ? 'text-red-600' :
              staff.daysUntilLicenseExpiry !== undefined && staff.daysUntilLicenseExpiry < 30 ? 'text-amber-600' : 'text-gray-600'
            )}>
              {formatDate(staff.licenseExpiry)}
            </span>
          ) : <span className="text-gray-300 italic text-xs">—</span>}
        </td>
        <td className="px-4 py-3 text-right text-xs text-gray-500">
          {staff.lastActivity ? formatDate(staff.lastActivity) : '—'}
        </td>
        <td className="px-4 py-3 text-center">
          <span className={cn('inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-widest', tone.pill)}>
            {tone.label}
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-50/80">
          <td colSpan={7} className="px-6 py-4">
            {staff.perCourse.length === 0 ? (
              <p className="text-xs italic text-gray-400">No enrollments in date range.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    <th className="text-left py-1">Course</th>
                    <th className="text-right py-1">Status</th>
                    <th className="text-right py-1">Progress</th>
                    <th className="text-right py-1">Grade</th>
                    <th className="text-right py-1">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.perCourse.map(p => (
                    <tr key={`${staff.userId}_${p.courseId}`} className="border-t border-gray-100">
                      <td className="py-1.5 text-gray-900">
                        {p.courseTitle}
                        {p.isOverdue && (
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-red-600">Overdue</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right text-gray-600 capitalize">{p.status.replace('_', ' ')}</td>
                      <td className="py-1.5 text-right text-gray-600">{p.progress}%</td>
                      <td className={cn('py-1.5 text-right font-semibold', p.passed ? 'text-green-600' : p.finalGrade !== undefined ? 'text-red-600' : 'text-gray-300')}>
                        {p.finalGrade !== undefined ? `${p.finalGrade}%` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-gray-500">
                        {p.completedAt ? formatDate(p.completedAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
};
