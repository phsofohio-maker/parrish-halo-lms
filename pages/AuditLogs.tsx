/**
 * Audit Logs Page
 * 
 * Displays immutable audit trail from Firestore.
 * Admin-only access for compliance verification.
 * 
 * @module pages/AuditLogs
 */

import React, { useState, useEffect, useCallback } from 'react';
import { auditService } from '../services/auditService';
import { AuditLog } from '../functions/src/types';
import { formatDate } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import {
  Shield,
  Search,
  RefreshCw,
  AlertCircle,
  User,
  Clock,
  FileText,
  Loader2,
  Filter,
} from 'lucide-react';
import { cn } from '../utils';

// Action type colors
const getActionColor = (actionType: string): string => {
  if (actionType.includes('DELETE')) return 'bg-red-100 text-red-700 border-red-200';
  if (actionType.includes('CREATE')) return 'bg-green-100 text-green-700 border-green-200';
  if (actionType.includes('UPDATE')) return 'bg-blue-100 text-blue-700 border-blue-200';
  if (actionType.includes('LOGIN') || actionType.includes('LOGOUT'))
    return 'bg-purple-100 text-purple-700 border-purple-200';
  if (actionType.includes('GRADE')) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

export const AuditLogs: React.FC = () => {
  const { hasRole } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState<string>('');

  // Fetch logs from Firestore
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const firestoreLogs = await auditService.getLogsFromFirestore({ limit: 100 });
      
      // If no Firestore logs, fall back to memory
      if (firestoreLogs.length === 0) {
        const memoryLogs = auditService.getLogs();
        setLogs(memoryLogs);
      } else {
        setLogs(firestoreLogs);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load audit logs';
      setError(message);
      // Fall back to memory logs
      setLogs(auditService.getLogs());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Check admin access
  if (!hasRole(['admin'])) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="bg-white rounded-lg border border-red-200 p-8 max-w-md text-center">
          <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">
            You do not have permission to view audit logs. This page is restricted to administrators.
          </p>
        </div>
      </div>
    );
  }

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !searchTerm ||
      log.actorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.targetId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = !filterAction || log.actionType === filterAction;

    return matchesSearch && matchesAction;
  });

  // Get unique action types for filter
  const actionTypes = [...new Set(logs.map((l) => l.actionType))].sort();

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary-600" />
            System Audit Trail
          </h1>
          <p className="text-gray-500 mt-2 max-w-2xl">
            Immutable record of all critical actions within the Harmony LMS platform. Used for
            compliance verification and legal defensibility.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={isLoading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user, details, or target..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm bg-white text-gray-900"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white text-gray-900"
          >
            <option value="">All Actions</option>
            {actionTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Unable to load from Firestore</p>
            <p className="text-sm text-amber-700">Showing cached logs. {error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-500">Loading audit logs...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No audit logs found</p>
          <p className="text-sm text-gray-400 mt-1">
            {searchTerm || filterAction
              ? 'Try adjusting your filters'
              : 'Logs will appear here as actions are performed'}
          </p>
        </div>
      ) : (
        /* Logs Table */
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actor
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      {formatDate(log.timestamp)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">{log.actorName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-semibold border',
                        getActionColor(log.actionType)
                      )}
                    >
                      {log.actionType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-600 max-w-md truncate" title={log.details}>
                      {log.details}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Count */}
      <div className="mt-4 text-sm text-gray-500 text-right">
        Showing {filteredLogs.length} of {logs.length} records
      </div>
    </div>
  );
};