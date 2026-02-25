/**
 * useUserEnrollments Hook
 * 
 * Provides enrolled courses for a user with loading/error states.
 * Supports enrollment creation and progress updates.
 * 
 * @module hooks/useUserEnrollments
 */

import { useState, useEffect, useCallback } from 'react';
import { Enrollment } from '../functions/src/types';
import {
  getUserEnrollments,
  getEnrollment,
  createEnrollment,
  updateEnrollmentProgress,
  isUserEnrolled,
} from '../services/enrollmentService';
import { useAuth } from '../contexts/AuthContext';

interface UseUserEnrollmentsReturn {
  enrollments: Enrollment[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  enroll: (courseId: string) => Promise<boolean>;
  updateProgress: (courseId: string, progress: number) => Promise<boolean>;
  checkEnrollment: (courseId: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export const useUserEnrollments = (userId?: string): UseUserEnrollmentsReturn => {
  const { user } = useAuth();
  const targetUserId = userId || user?.uid;
  
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEnrollments = useCallback(async () => {
    if (!targetUserId) {
      setEnrollments([]);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getUserEnrollments(targetUserId);
      setEnrollments(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load enrollments';
      setError(message);
      console.error('useUserEnrollments fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  const enroll = useCallback(async (courseId: string): Promise<boolean> => {
    if (!targetUserId || !user) {
      setError('Must be logged in to enroll');
      return false;
    }
    
    try {
      await createEnrollment(
        targetUserId,
        courseId,
        user.uid,
        user.displayName || 'Unknown'
      );
      await fetchEnrollments();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enroll';
      setError(message);
      return false;
    }
  }, [targetUserId, user, fetchEnrollments]);

  const updateProgress = useCallback(async (
    courseId: string,
    progress: number
  ): Promise<boolean> => {
    if (!targetUserId || !user) {
      setError('Must be logged in to update progress');
      return false;
    }
    
    try {
      await updateEnrollmentProgress(
        targetUserId,
        courseId,
        progress,
        user.uid,
        user.displayName || 'Unknown'
      );
      
      // Update local state optimistically
      setEnrollments(prev => prev.map(e => 
        e.courseId === courseId 
          ? { ...e, progress, status: progress === 100 ? 'completed' : 'in_progress' }
          : e
      ));
      
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update progress';
      setError(message);
      return false;
    }
  }, [targetUserId, user]);

  const checkEnrollment = useCallback(async (courseId: string): Promise<boolean> => {
    if (!targetUserId) return false;
    
    try {
      return await isUserEnrolled(targetUserId, courseId);
    } catch (err) {
      console.error('Check enrollment error:', err);
      return false;
    }
  }, [targetUserId]);

  return {
    enrollments,
    isLoading,
    error,
    enroll,
    updateProgress,
    checkEnrollment,
    refetch: fetchEnrollments,
  };
};

/**
 * Hook for a single enrollment (specific course)
 */
interface UseSingleEnrollmentReturn {
  enrollment: Enrollment | null;
  isLoading: boolean;
  isEnrolled: boolean;
  error: string | null;
  enroll: () => Promise<boolean>;
  updateProgress: (progress: number) => Promise<boolean>;
}

export const useEnrollment = (courseId: string): UseSingleEnrollmentReturn => {
  const { user } = useAuth();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEnrollment = useCallback(async () => {
    if (!user?.uid || !courseId) {
      setEnrollment(null);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getEnrollment(user.uid, courseId);
      setEnrollment(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load enrollment';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, courseId]);

  useEffect(() => {
    fetchEnrollment();
  }, [fetchEnrollment]);

  const enroll = useCallback(async (): Promise<boolean> => {
    if (!user?.uid) {
      setError('Must be logged in to enroll');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      await createEnrollment(
        user.uid,
        courseId,
        user.uid,
        user.displayName || 'Unknown'
      );
      await fetchEnrollment();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enroll';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, courseId, fetchEnrollment]);

  const updateProgress = useCallback(async (progress: number): Promise<boolean> => {
    if (!user?.uid) {
      setError('Must be logged in to update progress');
      return false;
    }
    
    try {
      await updateEnrollmentProgress(
        user.uid,
        courseId,
        progress,
        user.uid,
        user.displayName || 'Unknown'
      );
      
      setEnrollment(prev => prev ? {
        ...prev,
        progress,
        status: progress === 100 ? 'completed' : 'in_progress',
      } : null);
      
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update progress';
      setError(message);
      return false;
    }
  }, [user, courseId]);

  return {
    enrollment,
    isLoading,
    isEnrolled: enrollment !== null,
    error,
    enroll,
    updateProgress,
  };
};