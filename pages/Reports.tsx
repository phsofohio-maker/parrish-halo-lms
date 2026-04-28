/**
 * Reports Page
 *
 * Admin and instructor surface for generating CMS audit-ready reports
 * in PDF and CSV formats. Three report types: Staff Training Completion,
 * Certification Registry, and Grade & Assessment History.
 *
 * @module pages/Reports
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, GraduationCap, Award, ClipboardList,
  Download, Loader2, AlertCircle, ShieldAlert, RefreshCw, FileSpreadsheet,
  ScrollText,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { usePageLoadTracking } from '../hooks/usePageLoadTracking';
import {
  buildReport,
  getInstructorCourseIds,
  ReportType,
  ReportFilters,
  BuiltReport,
} from '../services/reportsService';
import { exportToCsv } from '../utils/exportCsv';
import { exportToPdf } from '../utils/exportPdf';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';

const REPORT_DEFS: Array<{
  type: ReportType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    type: 'staff_completion',
    title: 'Staff Training Completion',
    description: 'Per-staff, per-course enrollment, completion, and grade record. Use for CMS audit response.',
    icon: GraduationCap,
  },
  {
    type: 'certification',
    title: 'Certification Registry',
    description: 'Issued certificates with cert IDs, issue and expiry dates, and CE credits awarded.',
    icon: Award,
  },
  {
    type: 'grade_history',
    title: 'Grade & Assessment History',
    description: 'Module-level quiz and assessment grades with grader, attempt count, and pass/fail.',
    icon: ClipboardList,
  },
  {
    type: 'policy_signature',
    title: 'Policy Signature Audit',
    description: 'Required policy acknowledgments with signed/unsigned status and outdated-version detection.',
    icon: ScrollText,
  },
];

const last12MonthsISO = (): { start: string; end: string } => {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

export const Reports: React.FC = () => {
  usePageLoadTracking('reports');
  const { user, hasRole } = useAuth();
  const { addToast } = useToast();

  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [report, setReport] = useState<BuiltReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [instructorCourseIds, setInstructorCourseIds] = useState<string[] | null>(null);

  const defaults = useMemo(() => last12MonthsISO(), []);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [department, setDepartment] = useState<string>('');

  const isAdmin = hasRole(['admin']);
  const isInstructor = hasRole(['instructor']);
  const canAccess = isAdmin || isInstructor;

  // Load department list & instructor scope on mount.
  useEffect(() => {
    if (!user || !canAccess) return;
    (async () => {
      try {
        const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('displayName')));
        const depts = Array.from(new Set(
          usersSnap.docs
            .map(d => d.data().department as string | undefined)
            .filter((d): d is string => !!d)
        )).sort();
        setDepartments(depts);

        if (isInstructor && !isAdmin) {
          const ids = await getInstructorCourseIds(user.uid);
          setInstructorCourseIds(ids);
        }
      } catch (err) {
        console.error('Reports init error:', err);
      }
    })();
  }, [user, canAccess, isAdmin, isInstructor]);

  const generateReport = useCallback(async (type: ReportType) => {
    setIsLoading(true);
    setError(null);
    try {
      const filters: ReportFilters = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        department: department || undefined,
        courseIds: instructorCourseIds || undefined,
      };
      const result = await buildReport(type, filters);
      setReport(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate report';
      setError(msg);
      addToast({ type: 'error', title: 'Report failed', message: msg });
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, department, instructorCourseIds, addToast]);

  // Re-run when filters or selected type change.
  useEffect(() => {
    if (selectedType) generateReport(selectedType);
  }, [selectedType, generateReport]);

  const handleSelect = (type: ReportType) => {
    setSelectedType(type);
  };

  const filenameBase = (r: BuiltReport): string => {
    const ts = new Date(r.generatedAt).toISOString().slice(0, 10);
    const slug = r.type.replace(/_/g, '-');
    return `parrish-halo-${slug}-${ts}`;
  };

  const handleDownloadPdf = () => {
    if (!report) return;
    exportToPdf({
      title: report.title,
      subtitle: report.subtitle,
      dateRange: report.dateRange,
      summary: report.summary,
      headers: report.headers,
      rows: report.rows,
      filename: filenameBase(report),
    });
    addToast({ type: 'success', title: 'PDF downloaded', message: report.title });
  };

  const handleDownloadCsv = () => {
    if (!report) return;
    exportToCsv(filenameBase(report), report.headers, report.rows);
    addToast({ type: 'success', title: 'CSV downloaded', message: report.title });
  };

  const handleDownloadBoth = () => {
    handleDownloadPdf();
    handleDownloadCsv();
  };

  if (!user) return null;
  if (!canAccess) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-amber-500" />
          <p className="text-sm font-medium text-amber-900">
            Reports are restricted to administrators and instructors.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-7 w-7 text-primary-600" />
          Reports
        </h1>
        <p className="text-gray-500 mt-2 text-sm">
          Generate CMS audit-ready compliance reports.
          {isInstructor && !isAdmin && instructorCourseIds && (
            <span className="ml-2 text-amber-600 text-xs">
              · Scoped to {instructorCourseIds.length} course(s) you've graded
            </span>
          )}
        </p>
      </div>

      {/* Report selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {REPORT_DEFS.map(def => (
          <button
            key={def.type}
            onClick={() => handleSelect(def.type)}
            className={cn(
              'text-left bg-white border-2 rounded-lg p-5 transition-all',
              selectedType === def.type
                ? 'border-primary-500 shadow-md'
                : 'border-gray-200 hover:border-gray-300'
            )}
          >
            <def.icon className={cn(
              'h-7 w-7 mb-3',
              selectedType === def.type ? 'text-primary-600' : 'text-gray-400'
            )} />
            <p className="font-bold text-gray-900 mb-1">{def.title}</p>
            <p className="text-xs text-gray-500 leading-relaxed">{def.description}</p>
          </button>
        ))}
      </div>

      {/* Configuration + preview */}
      {selectedType && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
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
              <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Department</label>
              <select
                value={department}
                onChange={e => setDepartment(e.target.value)}
                className="h-9 px-3 text-sm border border-gray-200 rounded-md bg-white"
              >
                <option value="">All</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedType && generateReport(selectedType)}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={handleDownloadPdf}
                disabled={!report || report.rows.length === 0}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                PDF
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleDownloadCsv}
                disabled={!report || report.rows.length === 0}
                className="gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadBoth}
                disabled={!report || report.rows.length === 0}
              >
                Both
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
            </div>
          ) : report ? (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
                <p className="font-bold text-gray-900">{report.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{report.dateRange} · {report.rows.length} row(s)</p>
                <div className="flex flex-wrap gap-6 mt-3">
                  {report.summary.map(s => (
                    <div key={s.label}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{s.label}</p>
                      <p className="text-sm font-bold text-gray-900">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              {report.rows.length === 0 ? (
                <p className="text-center text-gray-400 italic py-12">No data in this date range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        {report.headers.map(h => (
                          <th key={h} className="text-left px-3 py-2 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="border-t border-gray-100">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-1.5 text-gray-700">{String(cell)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {report.rows.length > 10 && (
                    <p className="text-center text-[11px] text-gray-400 italic py-3 border-t border-gray-100">
                      Preview limited to 10 rows · {report.rows.length - 10} more in download
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
