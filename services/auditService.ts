/**
 * Audit Service
 * 
 * Provides immutable audit logging for legal defensibility.
 * All write operations in the system should create an audit entry.
 * 
 * Design Principles:
 * - Fail-safe: Audit failures never crash parent operations
 * - Immutable: Once written, logs cannot be modified or deleted
 * - Comprehensive: Captures actor, action, target, and timestamp
 * 
 * @module services/auditService
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { AuditLog } from '../functions/src/types';
import { generateId } from '../utils';

// Firestore collection
const AUDIT_COLLECTION = 'audit_logs';

// Extended action types for comprehensive logging
export type AuditActionType =
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'COURSE_CREATE'
  | 'COURSE_UPDATE'
  | 'COURSE_DELETE'
  | 'COURSE_PUBLISH'
  | 'MODULE_CREATE'
  | 'MODULE_UPDATE'
  | 'MODULE_DELETE'
  | 'BLOCK_CREATE'
  | 'BLOCK_UPDATE'
  | 'BLOCK_DELETE'
  | 'GRADE_ENTRY'
  | 'GRADE_CHANGE'
  | 'ENROLLMENT_CREATE'
  | 'ENROLLMENT_UPDATE'
  | 'ASSESSMENT_SUBMIT'
  | 'ASSESSMENT_GRADE'
  | 'COHORT_CREATE'
  | 'COHORT_UPDATE'
  | 'COHORT_DELETE'
  | 'BULK_ENROLLMENT'
  | 'CORRECTION_ENTRY'
  | 'LICENSE_GATE_BLOCKED'
  | 'GLOSSARY_TERM_CREATE'
  | 'GLOSSARY_TERM_UPDATE'
  | 'GLOSSARY_TERM_DELETE';

// Internal log structure for Firestore
interface FirestoreAuditLog {
  actorId: string;
  actorName: string;
  actionType: AuditActionType;
  targetId: string;
  details: string;
  timestamp: ReturnType<typeof serverTimestamp>;
  metadata?: Record<string, any>;
}

class AuditService {
  // In-memory cache for recent logs (dev convenience)
  private memoryLogs: AuditLog[] = [];
  private maxMemoryLogs = 100;

  /**
   * Logs an action to Firestore (primary) and memory (fallback/dev)
   * 
   * @param actorId - UID of the user performing the action
   * @param actorName - Display name for readability
   * @param actionType - Categorized action type
   * @param targetId - ID of the affected resource
   * @param details - Human-readable description
   * @param metadata - Optional additional data
   */
  async logToFirestore(
    actorId: string,
    actorName: string,
    actionType: AuditActionType,
    targetId: string,
    details: string,
    metadata?: Record<string, any>
  ): Promise<string | null> {
    const logId = generateId();
    
    // Always log to memory for dev visibility
    const memoryLog: AuditLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      actorId,
      actorName,
      actionType: actionType as AuditLog['actionType'],
      targetId,
      details,
    };
    
    this.addToMemory(memoryLog);
    this.logToConsole(actionType, actorName, details);
    
    // Attempt Firestore write (fail-safe)
    try {
      const logRef = doc(db, AUDIT_COLLECTION, logId);
      
      const sanitizeForFirestore = (obj: Record<string, any>): Record<string, any> => {
        return Object.fromEntries(
          Object.entries(obj).filter(([, v]) => v !== undefined)
        );
      };
      const firestoreLog: FirestoreAuditLog = {
        actorId,
        actorName,
        actionType,
        targetId,
        details,
        timestamp: serverTimestamp(),
        ...(metadata !== undefined && { metadata: sanitizeForFirestore(metadata) }),
      };
      
      await setDoc(logRef, firestoreLog);
      return logId;
    } catch (error) {
      // Log failure but don't throw - audit should never crash the app
      console.error(
        '%c⚠️ AUDIT LOG FAILED TO PERSIST',
        'color: #dc2626; font-weight: bold;',
        error
      );
      console.warn('Log retained in memory only:', memoryLog);
      return null;
    }
  }

  /**
   * Legacy method for backward compatibility
   * Routes to logToFirestore
   */
  logAction(
    actorId: string,
    actorName: string,
    actionType: AuditLog['actionType'],
    targetId: string,
    details: string
  ): void {
    // Fire and forget for legacy compatibility
    this.logToFirestore(actorId, actorName, actionType as AuditActionType, targetId, details);
  }

  /**
   * Retrieves audit logs from Firestore
   */
  async getLogsFromFirestore(options?: {
    limit?: number;
    actorId?: string;
    actionType?: AuditActionType;
    targetId?: string;
  }): Promise<AuditLog[]> {
    try {
      let q = query(
        collection(db, AUDIT_COLLECTION),
        orderBy('timestamp', 'desc'),
        limit(options?.limit || 50)
      );
      
      // Add filters if provided
      if (options?.actorId) {
        q = query(q, where('actorId', '==', options.actorId));
      }
      if (options?.actionType) {
        q = query(q, where('actionType', '==', options.actionType));
      }
      if (options?.targetId) {
        q = query(q, where('targetId', '==', options.targetId));
      }
      
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          timestamp: data.timestamp instanceof Timestamp 
            ? data.timestamp.toDate().toISOString()
            : new Date().toISOString(),
          actorId: data.actorId,
          actorName: data.actorName,
          actionType: data.actionType,
          targetId: data.targetId,
          details: data.details,
        } as AuditLog;
      });
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      // Fall back to memory logs
      return this.memoryLogs;
    }
  }

  /**
   * Returns in-memory logs (for dev/testing or Firestore fallback)
   */
  getLogs(): AuditLog[] {
    return [...this.memoryLogs];
  }

  /**
   * Adds log to memory buffer with size limit
   */
  private addToMemory(log: AuditLog): void {
    this.memoryLogs.unshift(log);
    
    // Trim if over limit
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs = this.memoryLogs.slice(0, this.maxMemoryLogs);
    }
  }

  /**
   * Console output for dev visibility
   */
  private logToConsole(actionType: string, actorName: string, details: string): void {
    const color = this.getActionColor(actionType);
    
    console.group(`%c🛡️ AUDIT: ${actionType}`, `color: ${color}; font-weight: bold;`);
    console.log('Actor:', actorName);
    console.log('Details:', details);
    console.log('Time:', new Date().toISOString());
    console.groupEnd();
  }

  /**
   * Color coding for console output
   */
  private getActionColor(actionType: string): string {
    if (actionType.includes('DELETE')) return '#dc2626'; // Red
    if (actionType.includes('CREATE')) return '#16a34a'; // Green
    if (actionType.includes('UPDATE')) return '#2563eb'; // Blue
    if (actionType.includes('LOGIN')) return '#7c3aed'; // Purple
    if (actionType.includes('GRADE')) return '#d97706'; // Amber
    return '#64748b'; // Slate
  }
}

// Export singleton instance
export const auditService = new AuditService();