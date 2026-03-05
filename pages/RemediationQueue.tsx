/**
 * Remediation Queue Page
 *
 * Admin/Instructor view for managing remediation requests.
 * Cloud Function 1 (onGradeCreate) auto-creates remediation_requests
 * when a learner fails a module 3+ times. This page surfaces those
 * requests and allows supervisors to approve (unlock retry) or deny.
 *
 * Data Flow:
 *   onGradeCreate → remediation_requests (status: 'pending')
 *   Admin clicks Unlock → resetEnrollment() + update doc status to 'approved'
 *   Cloud Function 4 (onRemediationUpdate) → resets progress server-side
 *
 * @module pages/RemediationQueue
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Unlock,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle,
  User,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn, formatDate } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { resetEnrollment } from '../services/enrollmentService';
import { auditService } from '../services/auditService';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '../services/firebase';

// ============================================
// TYPES
// ============================================

interface RemediationRequest {
  id: string;
  userId: string;
  moduleId: string;
  courseId: string;
  supervisorId: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  denialReason?: string;
}

interface EnrichedRequest extends RemediationRequest {
  userName: string;
  userEmail: string;
  moduleTitle: string;
  courseTitle: string;
  attemptCount: number;
}

type FilterStatus = 'pending' | 'approved' | 'denied' | 'all';

// ============================================
// COMPONENT
// ============================================

export const RemediationQueue: React.FC = () => {
  const { user, hasRole } = useAuth();

  const [requests, setRequests] = useState<EnrichedRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('pending');

  // Deny modal state
  const [denyingRequestId, setDenyingRequestId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let q;
      if (filter === 'all') {
        q = query(
          collection(db, 'remediation_requests'),
          orderBy('requestedAt', 'desc')
        );
      } else {
        q = query(
          collection(db, 'remediation_requests'),
          where('status', '==', filter),
          orderBy('requestedAt', 'desc')
        );
      }

      const snapshot = await getDocs(q);
      const enriched: EnrichedRequest[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as Record<string, any>;

        // Resolve user name
        let userName = 'Unknown Staff';
        let userEmail = '';
        try {
          const userSnap = await getDocs(
            query(collection(db, 'users'), where('uid', '==', data.userId))
          );
          if (!userSnap.empty) {
            const userData = userSnap.docs[0].data();
            userName = userData.displayName || userData.email || 'Unknown';
            userEmail = userData.email || '';
          }
        } catch {
          // Non-critical
        }

        // Resolve module title
        let moduleTitle = 'Unknown Module';
        let courseTitle = 'Unknown Course';
        try {
          if (data.courseId) {
            const courseSnap = await getDocs(
              query(collection(db, 'courses'), where('__name__', '==', data.courseId))
            );
            if (!courseSnap.empty) {
              courseTitle = courseSnap.docs[0].data().title || 'Untitled Course';

              // Get module title from course subcollection
              if (data.moduleId) {
                const moduleSnap = await getDocs(
                  collection(db, `courses/${data.courseId}/modules`)
                );
                const mod = moduleSnap.docs.find(d => d.id === data.moduleId);
                if (mod) {
                  moduleTitle = mod.data().title || 'Untitled Module';
                }
              }
            }
          }
        } catch {
          // Non-critical
        }

        // Get attempt count from progress
        let attemptCount = 0;
        try {
          const progressSnap = await getDocs(
            query(
              collection(db, 'progress'),
              where('userId', '==', data.userId),
              where('moduleId', '==', data.moduleId)
            )
          );
          if (!progressSnap.empty) {
            attemptCount = progressSnap.docs[0].data().totalAttempts || 0;
          }
        } catch {
          // Non-critical
        }

        enriched.push({
          id: docSnap.id,
          userId: data.userId,
          moduleId: data.moduleId,
          courseId: data.courseId || '',
          supervisorId: data.supervisorId || '',
          reason: data.reason || 'Multiple failed attempts',
          status: data.status || 'pending',
          requestedAt: data.requestedAt?.toDate?.()?.toISOString() || '',
          resolvedAt: data.resolvedAt?.toDate?.()?.toISOString(),
          resolvedBy: data.resolvedBy,
          denialReason: data.denialReason,
          userName,
          userEmail,
          moduleTitle,
          courseTitle,
          attemptCount,
        });
      }

      setRequests(enriched);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load remediation requests';
      setError(msg);
      console.error('RemediationQueue fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Approve remediation: reset enrollment + update request status.
   * Cloud Function 4 (onRemediationUpdate) will also reset progress server-side.
   */
  const handleUnlock = async (request: EnrichedRequest) => {
    if (!user) return;
    setIsProcessing(request.id);

    try {
      // 1. Reset enrollment to allow retry
      if (request.courseId) {
        await resetEnrollment(
          request.userId,
          request.courseId,
          user.uid,
          user.displayName || 'Supervisor'
        );
      }

      // 2. Update remediation request to approved (triggers Cloud Function 4)
      const reqRef = doc(db, 'remediation_requests', request.id);
      await updateDoc(reqRef, {
        status: 'approved',
        resolvedBy: user.uid,
        resolvedAt: serverTimestamp(),
      });

      // 3. Audit log
      await auditService.logToFirestore(
        user.uid,
        user.displayName || 'Supervisor',
        'ENROLLMENT_UPDATE',
        request.id,
        `Remediation approved for user ${request.userName} on module ${request.moduleTitle}. ` +
        `Enrollment reset, learner may retry. (${request.attemptCount} previous attempts)`
      );

      await fetchRequests();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to unlock';
      console.error('Unlock error:', err);
      alert(`Error: ${msg}`);
    } finally {
      setIsProcessing(null);
    }
  };

  /**
   * Deny remediation with a reason.
   */
  const handleDeny = async (request: EnrichedRequest) => {
    if (!user || !denyReason.trim()) return;
    setIsProcessing(request.id);

    try {
      const reqRef = doc(db, 'remediation_requests', request.id);
      await updateDoc(reqRef, {
        status: 'denied',
        resolvedBy: user.uid,
        resolvedAt: serverTimestamp(),
        denialReason: denyReason.trim(),
      });

      await auditService.logToFirestore(
        user.uid,
        user.displayName || 'Supervisor',
        'ENROLLMENT_UPDATE',
        request.id,
        `Remediation denied for user ${request.userName} on module ${request.moduleTitle}. ` +
        `Reason: ${denyReason.trim()}`
      );

      setDenyingRequestId(null);
      setDenyReason('');
      await fetchRequests();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to deny request';
      console.error('Deny error:', err);
      alert(`Error: ${msg}`);
    } finally {
      setIsProcessing(null);
    }
  };

  // ============================================
  // HELPERS
  // ============================================

  const getStatusBadge = (status: RemediationRequest['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-700 border border-green-200">
            <CheckCircle className="h-3 w-3" />
            Approved
          </span>
        );
      case 'denied':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
            <XCircle className="h-3 w-3" />
            Denied
          </span>
        );
    }
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
            Remediation management is restricted to administrators and instructors.
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // STATS
  // ============================================

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Remediation Queue
          </h1>
          <p className="text-gray-500 mt-1">
            Review and manage learner retry requests after repeated assessment failures.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRequests}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>

          <div className="flex bg-white border border-gray-200 rounded-lg p-1">
            {([
              { key: 'pending' as const, label: 'Pending' },
              { key: 'approved' as const, label: 'Approved' },
              { key: 'denied' as const, label: 'Denied' },
              { key: 'all' as const, label: 'All' },
            ]).map(tab => (
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
      </div>

      {/* Pending Count Banner */}
      {pendingCount > 0 && filter !== 'pending' && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-sm font-medium text-amber-800">
            {pendingCount} request{pendingCount !== 1 ? 's' : ''} pending review.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-amber-700"
            onClick={() => setFilter('pending')}
          >
            View Pending
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-gray-700">Staff Member</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Module</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Reason</th>
              <th className="px-6 py-4 font-semibold text-gray-700 text-center">Attempts</th>
              <th className="px-6 py-4 font-semibold text-gray-700 text-center">Status</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Requested</th>
              <th className="px-6 py-4 font-semibold text-gray-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                  Loading remediation requests...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <div className="text-gray-400">
                    <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No remediation requests</p>
                    <p className="text-xs mt-1">
                      {filter === 'pending'
                        ? 'All caught up! No learners currently need remediation.'
                        : `No requests matching "${filter}" filter.`}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              requests.map(req => (
                <React.Fragment key={req.id}>
                  <tr className="hover:bg-gray-50/50">
                    {/* Staff Member */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <User className="h-4 w-4 text-gray-400" />
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{req.userName}</div>
                          <div className="text-xs text-gray-400">{req.userEmail || req.userId}</div>
                        </div>
                      </div>
                    </td>

                    {/* Module */}
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-700">{req.moduleTitle}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {req.courseTitle}
                      </div>
                    </td>

                    {/* Reason */}
                    <td className="px-6 py-4 text-gray-600 text-xs max-w-[200px]">
                      {req.reason}
                      {req.denialReason && (
                        <p className="text-red-500 mt-1 font-medium">
                          Denied: {req.denialReason}
                        </p>
                      )}
                    </td>

                    {/* Attempts */}
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        'inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold',
                        req.attemptCount >= 5
                          ? 'bg-red-100 text-red-700'
                          : req.attemptCount >= 3
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                      )}>
                        {req.attemptCount}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(req.status)}
                    </td>

                    {/* Requested */}
                    <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                      {req.requestedAt ? formatDate(req.requestedAt) : '--'}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      {req.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => handleUnlock(req)}
                            disabled={isProcessing === req.id}
                          >
                            {isProcessing === req.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Unlock className="h-3.5 w-3.5" />
                            )}
                            Unlock
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                            onClick={() => {
                              setDenyingRequestId(req.id);
                              setDenyReason('');
                            }}
                            disabled={isProcessing === req.id}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Deny
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {req.resolvedAt ? formatDate(req.resolvedAt) : ''}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Deny reason form (inline) */}
                  {denyingRequestId === req.id && (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 bg-red-50 border-t border-red-100">
                        <div className="flex items-end gap-3 max-w-2xl">
                          <div className="flex-1">
                            <label className="text-[10px] font-bold text-red-600 uppercase tracking-wider block mb-1">
                              Denial Reason (required — logged in audit trail)
                            </label>
                            <textarea
                              className="w-full p-2.5 border border-red-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-300 bg-white text-gray-700"
                              rows={2}
                              placeholder="Explain why remediation is being denied..."
                              value={denyReason}
                              onChange={(e) => setDenyReason(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2 pb-0.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setDenyingRequestId(null);
                                setDenyReason('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                              onClick={() => handleDeny(req)}
                              disabled={!denyReason.trim() || isProcessing === req.id}
                            >
                              {isProcessing === req.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                              Confirm Denial
                            </Button>
                          </div>
                        </div>
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
