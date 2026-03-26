/**
 * Progress Service
 * 
 * Tracks user progress through modules and blocks.
 * Stores completion status, quiz attempts, and scores.
 * All mutations trigger audit logs for legal defensibility.
 * 
 * @module services/progressService
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteField,
    query,
    where,
    orderBy,
    limit as firestoreLimit,
    serverTimestamp,
    Timestamp,
  } from 'firebase/firestore';
  import { db } from './firebase';
  import { auditService } from './auditService';
  
  const PROGRESS_COLLECTION = 'progress';
  
  // ============================================
  // TYPES
  // ============================================
  
  export interface BlockProgress {
    blockId: string;
    completed: boolean;
    completedAt?: string;
    // For quiz blocks
    score?: number;
    attempts?: number;
    lastAttemptAt?: string;
  }
  
  export interface ModuleProgressRecord {
    id: string;
    userId: string;
    courseId: string;
    moduleId: string;
    completedBlocks: Record<string, BlockProgress>;
    overallProgress: number; // 0-100
    isComplete: boolean;
    startedAt?: string;
    completedAt?: string;
    updatedAt?: string;
    // Quiz tracking
    totalAttempts: number;
    bestScore?: number;
    lastScore?: number;
    // Draft persistence
    draftAnswers?: string;
    draftSavedAt?: string;
  }
  
  interface ProgressDoc {
    userId: string;
    courseId: string;
    moduleId: string;
    completedBlocks: Record<string, BlockProgress>;
    overallProgress: number;
    isComplete: boolean;
    startedAt: Timestamp;
    completedAt?: Timestamp;
    totalAttempts: number;
    bestScore?: number;
    lastScore?: number;
    updatedAt: Timestamp;
  }
  
  // ============================================
  // HELPERS
  // ============================================
  
  /**
   * Generate deterministic progress ID
   */
  const getProgressId = (userId: string, moduleId: string): string => {
    return `${userId}_${moduleId}`;
  };
  
  const docToProgress = (doc: any): ModuleProgressRecord => ({
    id: doc.id,
    userId: doc.data().userId,
    courseId: doc.data().courseId,
    moduleId: doc.data().moduleId,
    completedBlocks: doc.data().completedBlocks || {},
    overallProgress: doc.data().overallProgress ?? 0,
    isComplete: doc.data().isComplete ?? false,
    startedAt: doc.data().startedAt?.toDate?.()?.toISOString(),
    completedAt: doc.data().completedAt?.toDate?.()?.toISOString(),
    updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString(),
    totalAttempts: doc.data().totalAttempts ?? 0,
    bestScore: doc.data().bestScore,
    lastScore: doc.data().lastScore,
    draftAnswers: doc.data().draftAnswers,
    draftSavedAt: doc.data().draftSavedAt?.toDate?.()?.toISOString(),
  });
  
  // ============================================
  // READ OPERATIONS
  // ============================================
  
  /**
   * Get progress for a specific module
   */
  export const getModuleProgress = async (
    userId: string,
    moduleId: string
  ): Promise<ModuleProgressRecord | null> => {
    const progressId = getProgressId(userId, moduleId);
    const docRef = doc(db, PROGRESS_COLLECTION, progressId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    return docToProgress(docSnap);
  };
  
  /**
   * Get all progress records for a user in a course
   */
  export const getCourseProgress = async (
    userId: string,
    courseId: string
  ): Promise<ModuleProgressRecord[]> => {
    const q = query(
      collection(db, PROGRESS_COLLECTION),
      where('userId', '==', userId),
      where('courseId', '==', courseId)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docToProgress);
  };
  
  /**
   * Get all progress records for a user (across all courses)
   */
  export const getUserProgress = async (
    userId: string
  ): Promise<ModuleProgressRecord[]> => {
    const q = query(
      collection(db, PROGRESS_COLLECTION),
      where('userId', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docToProgress);
  };
  
  /**
   * Calculate overall course progress from module progress records
   */
  export const calculateCourseCompletion = (
    moduleProgressRecords: ModuleProgressRecord[],
    totalModules: number
  ): number => {
    if (totalModules === 0) return 0;
    
    const totalProgress = moduleProgressRecords.reduce(
      (sum, mp) => sum + mp.overallProgress,
      0
    );
    
    return Math.round(totalProgress / totalModules);
  };
  
  // ============================================
  // WRITE OPERATIONS
  // ============================================
  
  /**
   * Initialize or get progress record for a module
   * Creates if doesn't exist, returns existing if it does
   */
  export const initializeModuleProgress = async (
    userId: string,
    courseId: string,
    moduleId: string
  ): Promise<ModuleProgressRecord> => {
    const progressId = getProgressId(userId, moduleId);
    const docRef = doc(db, PROGRESS_COLLECTION, progressId);
    const existing = await getDoc(docRef);
    
    if (existing.exists()) {
      return docToProgress(existing);
    }
    
    // Create new progress record
    const newProgress: Omit<ProgressDoc, 'completedAt'> = {
      userId,
      courseId,
      moduleId,
      completedBlocks: {},
      overallProgress: 0,
      isComplete: false,
      startedAt: serverTimestamp() as Timestamp,
      totalAttempts: 0,
      updatedAt: serverTimestamp() as Timestamp,
    };
    
    await setDoc(docRef, newProgress);
    
    // Return the created record
    const created = await getDoc(docRef);
    return docToProgress(created);
  };
  
  /**
   * Mark a block as completed
   */
  export const markBlockComplete = async (
    userId: string,
    courseId: string,
    moduleId: string,
    blockId: string,
    totalRequiredBlocks: number,
    actorId: string,
    actorName: string
  ): Promise<ModuleProgressRecord> => {
    const progressId = getProgressId(userId, moduleId);
    const docRef = doc(db, PROGRESS_COLLECTION, progressId);
    
    // Ensure progress record exists
    let progressDoc = await getDoc(docRef);
    if (!progressDoc.exists()) {
      await initializeModuleProgress(userId, courseId, moduleId);
      progressDoc = await getDoc(docRef);
    }
    
    const currentData = progressDoc.data() as ProgressDoc;
    const completedBlocks = { ...currentData.completedBlocks };
    
    // Mark block complete
    completedBlocks[blockId] = {
      blockId,
      completed: true,
      completedAt: new Date().toISOString(),
    };
    
    // Calculate new progress
    const completedCount = Object.values(completedBlocks).filter(b => b.completed).length;
    const overallProgress = totalRequiredBlocks > 0
      ? Math.round((completedCount / totalRequiredBlocks) * 100)
      : 0;
    const isComplete = overallProgress === 100;
    
    const updates: Record<string, any> = {
      completedBlocks,
      overallProgress,
      isComplete,
      updatedAt: serverTimestamp(),
    };
    
    if (isComplete && !currentData.completedAt) {
      updates.completedAt = serverTimestamp();
    }
    
    await updateDoc(docRef, updates);
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'BLOCK_UPDATE',
      blockId,
      `Completed block in module ${moduleId} (${overallProgress}% complete)`
    );
    
    const updated = await getDoc(docRef);
    return docToProgress(updated);
  };
  
  /**
   * Record a quiz attempt with score
   */
  export const recordQuizAttempt = async (
    userId: string,
    courseId: string,
    moduleId: string,
    blockId: string,
    score: number,
    passed: boolean,
    totalRequiredBlocks: number,
    actorId: string,
    actorName: string
  ): Promise<ModuleProgressRecord> => {
    const progressId = getProgressId(userId, moduleId);
    const docRef = doc(db, PROGRESS_COLLECTION, progressId);
    
    // Ensure progress record exists
    let progressDoc = await getDoc(docRef);
    if (!progressDoc.exists()) {
      await initializeModuleProgress(userId, courseId, moduleId);
      progressDoc = await getDoc(docRef);
    }
    
    const currentData = progressDoc.data() as ProgressDoc;
    const completedBlocks = { ...currentData.completedBlocks };
    const currentBlockProgress = completedBlocks[blockId] || { blockId, completed: false, attempts: 0 };
    
    // Update block progress
    completedBlocks[blockId] = {
      ...currentBlockProgress,
      blockId,
      completed: passed,
      completedAt: passed ? new Date().toISOString() : (currentBlockProgress.completedAt || null),
      score,
      attempts: (currentBlockProgress.attempts || 0) + 1,
      lastAttemptAt: new Date().toISOString(),
    };
    
    // Calculate overall progress
    const completedCount = Object.values(completedBlocks).filter(b => b.completed).length;
    const overallProgress = totalRequiredBlocks > 0
      ? Math.round((completedCount / totalRequiredBlocks) * 100)
      : 0;
    const isComplete = overallProgress === 100;
    
    // Track best/last scores
    const bestScore = Math.max(currentData.bestScore || 0, score);
    
    const updates: Record<string, any> = {
      completedBlocks,
      overallProgress,
      isComplete,
      totalAttempts: (currentData.totalAttempts || 0) + 1,
      bestScore,
      lastScore: score,
      updatedAt: serverTimestamp(),
    };
    
    if (isComplete && !currentData.completedAt) {
      updates.completedAt = serverTimestamp();
    }
    
    await updateDoc(docRef, updates);
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'ASSESSMENT_SUBMIT',
      blockId,
      `Quiz attempt: ${score}% (${passed ? 'PASSED' : 'FAILED'}) - Attempt #${updates.totalAttempts}`
    );
    
    const updated = await getDoc(docRef);
    return docToProgress(updated);
  };
  
  /**
   * Reset progress for a module (for remediation)
   */
  export const resetModuleProgress = async (
    userId: string,
    moduleId: string,
    actorId: string,
    actorName: string
  ): Promise<void> => {
    const progressId = getProgressId(userId, moduleId);
    const docRef = doc(db, PROGRESS_COLLECTION, progressId);
    
    const existing = await getDoc(docRef);
    if (!existing.exists()) return;
    
    await updateDoc(docRef, {
      completedBlocks: {},
      overallProgress: 0,
      isComplete: false,
      completedAt: null,
      // Keep attempt history for audit trail
      updatedAt: serverTimestamp(),
    });
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'MODULE_UPDATE',
      moduleId,
      `Reset module progress for user ${userId} (remediation)`
    );
  };

  // ============================================
  // DRAFT ANSWER PERSISTENCE (Fix 1.1)
  // ============================================

  /**
   * Save draft answers to the progress document (merge-write).
   * Does not touch completedBlocks, overallProgress, or graded data.
   */
  export const saveDraftAnswers = async (
    userId: string,
    moduleId: string,
    answers: Record<string, any[]>,
  ): Promise<void> => {
    const progressId = getProgressId(userId, moduleId);
    const docRef = doc(db, PROGRESS_COLLECTION, progressId);
    // Strip undefined values to prevent Firestore errors
    const cleaned = JSON.parse(JSON.stringify(answers));
    await setDoc(docRef, {
      draftAnswers: JSON.stringify(cleaned),
      draftSavedAt: serverTimestamp(),
    }, { merge: true });
  };

  /**
   * Load draft answers from the progress document.
   * Returns null if no draft exists.
   */
  export const loadDraftAnswers = async (
    userId: string,
    moduleId: string,
  ): Promise<{ answers: Record<string, any[]>; savedAt: string | null } | null> => {
    const progressId = getProgressId(userId, moduleId);
    const docRef = doc(db, PROGRESS_COLLECTION, progressId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    if (!data.draftAnswers) return null;

    try {
      const answers = JSON.parse(data.draftAnswers);
      const savedAt = data.draftSavedAt?.toDate?.()?.toISOString() || null;
      return { answers, savedAt };
    } catch {
      return null;
    }
  };

  /**
   * Clear draft answers after successful submission.
   */
  export const clearDraftAnswers = async (
    userId: string,
    moduleId: string,
  ): Promise<void> => {
    const progressId = getProgressId(userId, moduleId);
    const docRef = doc(db, PROGRESS_COLLECTION, progressId);

    const existing = await getDoc(docRef);
    if (!existing.exists()) return;

    await updateDoc(docRef, {
      draftAnswers: deleteField(),
      draftSavedAt: deleteField(),
    });
  };

  // ============================================
  // LAST ACTIVE MODULE QUERY (Fix 2.2)
  // ============================================

  /**
   * Get the most recently updated progress record for a user in a course.
   * Used by Dashboard to show "Last active: Module X" on enrollment cards.
   */
  export const getLastActiveModuleProgress = async (
    userId: string,
    courseId: string,
  ): Promise<ModuleProgressRecord | null> => {
    const q = query(
      collection(db, PROGRESS_COLLECTION),
      where('userId', '==', userId),
      where('courseId', '==', courseId),
      orderBy('updatedAt', 'desc'),
      firestoreLimit(1)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return docToProgress(snapshot.docs[0]);
  };