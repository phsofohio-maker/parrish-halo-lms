/**
 * Analytics Service
 *
 * Wraps Firebase Analytics with HALO-specific event helpers. Every public
 * helper is non-throwing — analytics must never block a user flow. Callers
 * may invoke directly without try/catch.
 *
 * Events fire only in production (or when VITE_ANALYTICS_DEBUG=true) so dev
 * hot-reloads do not pollute the analytics dashboard.
 *
 * @module services/analytics
 */

import { Analytics, getAnalytics, logEvent, isSupported } from 'firebase/analytics';
import { app } from './firebase';

let analytics: Analytics | null = null;
let initPromise: Promise<void> | null = null;

const analyticsEnabled = (): boolean =>
  import.meta.env.PROD || import.meta.env.VITE_ANALYTICS_DEBUG === 'true';

const ensureAnalytics = async (): Promise<Analytics | null> => {
  if (!analyticsEnabled()) return null;
  if (analytics) return analytics;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        if (await isSupported()) {
          analytics = getAnalytics(app);
        }
      } catch {
        // Analytics not supported (e.g. SSR, certain browsers) — silent no-op.
      }
    })();
  }
  await initPromise;
  return analytics;
};

const fire = (name: string, params?: Record<string, unknown>): void => {
  // Fire-and-forget. Never await, never throw.
  void ensureAnalytics()
    .then((a) => {
      if (a) logEvent(a, name as string, params as Record<string, unknown>);
    })
    .catch(() => {});
};

export const trackEvent = {
  // ---- Learning lifecycle ----
  courseEnrolled: (courseId: string, courseTitle: string) =>
    fire('course_enrolled', { course_id: courseId, course_title: courseTitle }),

  moduleStarted: (moduleId: string, courseId: string) =>
    fire('module_started', { module_id: moduleId, course_id: courseId }),

  moduleCompleted: (moduleId: string, courseId: string, timeSpentSeconds: number) =>
    fire('module_completed', {
      module_id: moduleId,
      course_id: courseId,
      time_spent_seconds: timeSpentSeconds,
    }),

  quizSubmitted: (moduleId: string, score: number, needsReview: boolean) =>
    fire('quiz_submitted', {
      module_id: moduleId,
      score,
      needs_review: needsReview,
    }),

  courseCompleted: (courseId: string, finalGrade: number) =>
    fire('course_completed', { course_id: courseId, final_grade: finalGrade }),

  // ---- Certification ----
  certificateIssued: (courseId: string, certId: string) =>
    fire('certificate_issued', { course_id: courseId, cert_id: certId }),

  certificateDownloaded: (certId: string) =>
    fire('certificate_downloaded', { cert_id: certId }),

  // ---- Instructor actions ----
  gradeApproved: (courseId: string) =>
    fire('grade_approved', { course_id: courseId }),

  gradeRejected: (courseId: string) =>
    fire('grade_rejected', { course_id: courseId }),

  // ---- Performance ----
  pageLoad: (pageName: string, loadTimeMs: number) =>
    fire('page_load', { page_name: pageName, load_time_ms: loadTimeMs }),
};

export type AnalyticsEventName = keyof typeof trackEvent;
