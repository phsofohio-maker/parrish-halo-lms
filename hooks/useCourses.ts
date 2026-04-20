/**
 * useCourses Hook
 *
 * Provides course listing with loading and error states.
 * Builds role-aware queries to satisfy Firestore security rules.
 *
 * KEY INSIGHT (Firestore "rules are not filters"):
 * Security rules reject entire queries if ANY document in the result
 * set would be unauthorized. Non-admin/instructor users can only read
 * published courses, so we MUST add a where() clause — not rely on
 * rules to filter.
 *
 * @module hooks/useCourses
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, orderBy, getDocs, getCountFromServer } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Course } from '../functions/src/types';
import { createCourse } from '../services/courseService';
import { useAuth } from '../contexts/AuthContext';

interface UseCoursesReturn {
  courses: Course[];
  moduleCounts: Record<string, number>;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addCourse: (course: Omit<Course, 'id' | 'modules'>) => Promise<string | null>;
}

/** Roles that can view draft courses per firestore.rules canAuthorContent() */
const AUTHOR_ROLES = ['admin', 'instructor'];

export const useCourses = (): UseCoursesReturn => {
  const { user, role } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prevent double-fetch in React strict mode
  const fetchInFlight = useRef(false);

  /**
   * Builds a role-aware Firestore query.
   * - Admin/Instructor: all courses (no status filter)
   * - Everyone else: published only (satisfies security rules)
   */
  const fetchCourses = useCallback(async () => {
    if (!user || !role) return; // Wait for auth to resolve
    if (fetchInFlight.current) return;

    fetchInFlight.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const coursesRef = collection(db, 'courses');

      const canViewDrafts = AUTHOR_ROLES.includes(role);

      const q = canViewDrafts
        ? query(coursesRef, orderBy('title'))
        : query(coursesRef, where('status', '==', 'published'), orderBy('title'));

      const snapshot = await getDocs(q);

      const data: Course[] = snapshot.docs.map(doc => ({
        id: doc.id,
        title: doc.data().title || '',
        description: doc.data().description || '',
        category: doc.data().category || 'compliance',
        ceCredits: doc.data().ceCredits || 0,
        thumbnailUrl: doc.data().thumbnailUrl || '',
        status: doc.data().status || 'draft',
        modules: [],
        estimatedHours: doc.data().estimatedHours || 0,
        availability: doc.data().availability || undefined,
      }));

      // Fetch module counts for each course in parallel
      const counts = await Promise.all(
        data.map(async (course) => {
          const modulesRef = collection(db, 'courses', course.id, 'modules');
          const countSnap = await getCountFromServer(modulesRef);
          return [course.id, countSnap.data().count] as [string, number];
        })
      );
      setModuleCounts(Object.fromEntries(counts));

      setCourses(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load courses';
      setError(message);
      console.error('useCourses fetch error:', err);
    } finally {
      setIsLoading(false);
      fetchInFlight.current = false;
    }
  }, [user, role]);

  // Fetch when user/role stabilizes — single execution
  useEffect(() => {
    if (user && role) {
      fetchCourses();
    }
  }, [fetchCourses]);

  const addCourse = useCallback(async (
    course: Omit<Course, 'id' | 'modules'>
  ): Promise<string | null> => {
    if (!user) {
      setError('Must be logged in to create courses');
      return null;
    }

    try {
      const id = await createCourse(course, user.uid, user.displayName);
      await fetchCourses();
      return id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create course';
      setError(message);
      return null;
    }
  }, [user, fetchCourses]);

  return {
    courses,
    moduleCounts,
    isLoading,
    error,
    refetch: fetchCourses,
    addCourse,
  };
};