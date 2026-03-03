/**
 * Enrollment Service
 * 
 * Handles all Firestore operations for course enrollments.
 * Enrollments track which users are assigned to which courses.
 * All mutations trigger audit logs for legal defensibility.
 * 
 * @module services/enrollmentService
 */

import {
    deleteField,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
  } from 'firebase/firestore';
  import { db, } from './firebase';
  import { Enrollment, EnrollmentStatus } from '../functions/src/types';
  import { auditService } from './auditService';
  
  const ENROLLMENTS_COLLECTION = 'enrollments';
  
  // ============================================
  // TYPE CONVERTERS
  // ============================================
  
  interface EnrollmentDoc {
    userId: string;
    courseId: string;
    progress: number;
    status: EnrollmentStatus;
    enrolledAt: Timestamp;
    completedAt?: Timestamp;
    updatedAt: Timestamp;
  }
  
  const docToEnrollment = (doc: any): Enrollment => ({
    id: doc.id,
    userId: doc.data().userId,
    courseId: doc.data().courseId,
    progress: doc.data().progress ?? 0,
    status: doc.data().status ?? 'not_started',
    enrolledAt: doc.data().enrolledAt?.toDate?.()?.toISOString(),
    completedAt: doc.data().completedAt?.toDate?.()?.toISOString(),
    lastAccessedAt: doc.data().updatedAt?.toDate?.()?.toISOString() ?? '',
    score: doc.data().score,
    quizAnswers: (() => {
      const raw = doc.data().quizAnswers;
      if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
      return raw;
    })(),
  });
  
  // ============================================
  // READ OPERATIONS
  // ============================================
  
  /**
   * Get all enrollments for a specific user
   */
  export const getUserEnrollments = async (userId: string): Promise<Enrollment[]> => {
    const q = query(
      collection(db, ENROLLMENTS_COLLECTION),
      where('userId', '==', userId),
      orderBy('enrolledAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docToEnrollment);
  };
  
  /**
   * Get all enrollments for a specific course (admin view)
   */
  export const getCourseEnrollments = async (courseId: string): Promise<Enrollment[]> => {
    const q = query(
      collection(db, ENROLLMENTS_COLLECTION),
      where('courseId', '==', courseId),
      orderBy('enrolledAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docToEnrollment);
  };
  
  /**
   * Get a specific enrollment by user and course
   */
  export const getEnrollment = async (
    userId: string,
    courseId: string
  ): Promise<Enrollment | null> => {
    const enrollmentId = `${userId}_${courseId}`;
    const docRef = doc(db, ENROLLMENTS_COLLECTION, enrollmentId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    return docToEnrollment(docSnap);
  };
  
  /**
   * Check if a user is enrolled in a course
   */
  export const isUserEnrolled = async (
    userId: string,
    courseId: string
  ): Promise<boolean> => {
    const enrollment = await getEnrollment(userId, courseId);
    return enrollment !== null;
  };
  
  // ============================================
  // WRITE OPERATIONS
  // ============================================
  
  /**
   * Enroll a user in a course
   * Uses deterministic ID: {userId}_{courseId} to prevent duplicates
   */
  export const createEnrollment = async (
    userId: string,
    courseId: string,
    actorId: string,
    actorName: string
  ): Promise<string> => {
    const enrollmentId = `${userId}_${courseId}`;
    const docRef = doc(db, ENROLLMENTS_COLLECTION, enrollmentId);
    
    // Check if already enrolled
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      throw new Error('User is already enrolled in this course');
    }
    
    const enrollmentData: Omit<EnrollmentDoc, 'completedAt'> = {
      userId,
      courseId,
      progress: 0,
      status: 'not_started',
      enrolledAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };
    
    await setDoc(docRef, enrollmentData);
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'ENROLLMENT_CREATE',
      enrollmentId,
      `Enrolled user ${userId} in course ${courseId}`
    );
    
    return enrollmentId;
  };
  
  /**
   * Update enrollment progress (0-100)
   */
  export const updateEnrollmentProgress = async (
    userId: string,
    courseId: string,
    progress: number,
    actorId: string,
    actorName: string
  ): Promise<void> => {
    const enrollmentId = `${userId}_${courseId}`;
    const docRef = doc(db, ENROLLMENTS_COLLECTION, enrollmentId);
    
    // Clamp progress to 0-100
    const clampedProgress = Math.max(0, Math.min(100, progress));
    
    // Determine status based on progress
    let status: EnrollmentStatus = 'in_progress';
    if (clampedProgress === 0) status = 'not_started';
    if (clampedProgress === 100) status = 'completed';
    
    const updates: Record<string, any> = {
      progress: clampedProgress,
      status,
      updatedAt: serverTimestamp(),
    };
    
    // Set completion timestamp if just completed
    if (clampedProgress === 100) {
      updates.completedAt = serverTimestamp();
    }
    
    await updateDoc(docRef, updates);
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'ENROLLMENT_UPDATE',
      enrollmentId,
      `Updated progress to ${clampedProgress}% (status: ${status})`
    );
  };
  
  /**
   * Mark enrollment as failed (after failing assessment)
   */
  export const markEnrollmentFailed = async (
    userId: string,
    courseId: string,
    actorId: string,
    actorName: string
  ): Promise<void> => {
    const enrollmentId = `${userId}_${courseId}`;
    const docRef = doc(db, ENROLLMENTS_COLLECTION, enrollmentId);
    
    await updateDoc(docRef, {
      status: 'failed',
      updatedAt: serverTimestamp(),
    });
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'ENROLLMENT_UPDATE',
      enrollmentId,
      `Marked enrollment as failed`
    );
  };
  
  /**
   * Reset enrollment (allow retry after remediation)
   */
  export const resetEnrollment = async (
    userId: string,
    courseId: string,
    actorId: string,
    actorName: string
  ): Promise<void> => {
    const enrollmentId = `${userId}_${courseId}`;
    const docRef = doc(db, ENROLLMENTS_COLLECTION, enrollmentId);
    
    await updateDoc(docRef, {
      progress: 0,
      status: 'not_started',
      completedAt: deleteField(),
      updatedAt: serverTimestamp(),
    });
    
    await auditService.logToFirestore(
      actorId,
      actorName,
      'ENROLLMENT_UPDATE',
      enrollmentId,
      `Reset enrollment for remediation retry`
    );
  };