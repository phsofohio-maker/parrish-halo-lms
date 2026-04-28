/**
 * Skill-Gap Service
 *
 * Aggregates compliance data across users, enrollments, course grades,
 * and certificates to power the admin Skill-Gap Dashboard. All queries
 * are client-side and unfiltered — Firestore rules gate access to admins.
 *
 * @module services/skillGapService
 */

import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import {
  User,
  Course,
  Enrollment,
  CourseGradeDoc,
  Certificate,
} from '../functions/src/types';
import { getAllPolicies, getAllSignatures } from './policyService';

export interface SkillGapFilters {
  department?: string;
  /** ISO date — only enrollments with lastAccessedAt/enrolledAt on or after this. */
  startDate?: string;
  /** ISO date — only enrollments with lastAccessedAt/enrolledAt on or before this. */
  endDate?: string;
  status?: 'all' | 'compliant' | 'at_risk' | 'non_compliant';
}

export type ComplianceStatus = 'compliant' | 'at_risk' | 'non_compliant';

export interface StaffComplianceRow {
  userId: string;
  displayName: string;
  email: string;
  department?: string;
  jobTitle?: string;
  totalEnrollments: number;
  completedEnrollments: number;
  completionRate: number;
  overdueCount: number;
  licenseExpiry?: string;
  daysUntilLicenseExpiry?: number;
  averageScore?: number;
  lastActivity?: string;
  status: ComplianceStatus;
  perCourse: PerCourseRow[];
}

export interface PerCourseRow {
  courseId: string;
  courseTitle: string;
  status: Enrollment['status'];
  progress: number;
  finalGrade?: number;
  passed?: boolean;
  enrolledAt?: string;
  completedAt?: string;
  isOverdue: boolean;
}

export interface CoursePerformanceRow {
  courseId: string;
  title: string;
  enrollmentCount: number;
  completionCount: number;
  completionRate: number;
  averageScore: number | null;
  passCount: number;
  failCount: number;
  passRate: number | null;
  /** True if pass rate < 70% — may indicate content issues. */
  flagged: boolean;
}

export interface ExpiringEntry {
  /** Source: user license or certificate. */
  source: 'license' | 'certificate';
  userId: string;
  staffName: string;
  /** For certificates only. */
  certId?: string;
  /** For certificates only. */
  courseId?: string;
  /** For certificates only. */
  courseName?: string;
  expiryDate: string;
  daysUntilExpiry: number;
}

export interface PolicyComplianceRow {
  policyId: string;
  title: string;
  version: string;
  required: number;
  signed: number;
  outdated: number;
  unsigned: number;
  unsignedStaffNames: string[];
}

export interface SkillGapData {
  totalStaff: number;
  staffWithCompletions: number;
  overallCompletionRate: number;
  totalOverdue: number;
  expiringWithin30: number;
  expiringWithin60: number;
  expiringWithin90: number;
  averagePassRate: number;
  staffCompliance: StaffComplianceRow[];
  coursePerformance: CoursePerformanceRow[];
  expiringCerts: ExpiringEntry[];
  departments: string[];
  /** Policy compliance summary. */
  policyCompliance: PolicyComplianceRow[];
  policyRequiredTotal: number;
  policySignedTotal: number;
  policyComplianceRate: number;
  /** ISO timestamp of when the snapshot was computed. */
  computedAt: string;
}

const PASS_RATE_FLOOR = 70;
const CERT_VALIDITY_DAYS = 365;
const EXPIRING_WINDOW_DAYS = 90;

const dayDiff = (iso: string): number => {
  const date = new Date(iso).getTime();
  if (Number.isNaN(date)) return Infinity;
  return Math.floor((date - Date.now()) / (1000 * 60 * 60 * 24));
};

const inDateRange = (iso: string | undefined, start?: string, end?: string): boolean => {
  if (!start && !end) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (start && t < new Date(start).getTime()) return false;
  if (end && t > new Date(end).getTime() + 24 * 60 * 60 * 1000) return false;
  return true;
};

const computeStatus = (
  completionRate: number,
  overdueCount: number,
  daysUntilLicenseExpiry?: number
): ComplianceStatus => {
  const licenseExpired = daysUntilLicenseExpiry !== undefined && daysUntilLicenseExpiry < 0;
  if (licenseExpired || overdueCount >= 2 || completionRate < 50) return 'non_compliant';
  if (overdueCount >= 1 || completionRate < 80 || (daysUntilLicenseExpiry !== undefined && daysUntilLicenseExpiry < 30)) {
    return 'at_risk';
  }
  return 'compliant';
};

/**
 * Fetches and aggregates skill-gap dashboard data.
 * Reads all users, enrollments, courses, course_grades, and certificates,
 * then computes per-staff and per-course summaries client-side.
 */
export const getSkillGapData = async (filters: SkillGapFilters = {}): Promise<SkillGapData> => {
  const [usersSnap, enrollmentsSnap, coursesSnap, gradesSnap, certsSnap, policies, signatures] = await Promise.all([
    getDocs(query(collection(db, 'users'), orderBy('displayName'))),
    getDocs(collection(db, 'enrollments')),
    getDocs(collection(db, 'courses')),
    getDocs(collection(db, 'course_grades')),
    getDocs(collection(db, 'certificates')),
    getAllPolicies(),
    getAllSignatures(),
  ]);

  const users: User[] = usersSnap.docs.map(d => {
    const data = d.data();
    return {
      uid: data.uid || d.id,
      displayName: data.displayName || 'Unknown',
      email: data.email || '',
      role: data.role || 'staff',
      department: data.department,
      jobTitle: data.jobTitle,
      licenseNumber: data.licenseNumber,
      licenseExpiry: data.licenseExpiry,
    };
  });

  const enrollments: Enrollment[] = enrollmentsSnap.docs.map(d => ({
    id: d.id,
    userId: d.data().userId,
    courseId: d.data().courseId,
    progress: d.data().progress ?? 0,
    status: d.data().status ?? 'not_started',
    enrolledAt: d.data().enrolledAt?.toDate?.()?.toISOString() || '',
    completedAt: d.data().completedAt?.toDate?.()?.toISOString(),
    lastAccessedAt: d.data().updatedAt?.toDate?.()?.toISOString() || '',
    score: d.data().score,
  }));

  const courses: Course[] = coursesSnap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      title: data.title || 'Untitled',
      description: data.description || '',
      category: data.category,
      ceCredits: data.ceCredits || 0,
      thumbnailUrl: data.thumbnailUrl || '',
      status: data.status,
      modules: [],
      estimatedHours: data.estimatedHours || 0,
      availability: data.availability,
      certificateTemplateDocId: data.certificateTemplateDocId,
    };
  });

  const grades: CourseGradeDoc[] = gradesSnap.docs.map(d => d.data() as CourseGradeDoc);
  const certificates: Certificate[] = certsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Certificate));

  const courseById = new Map(courses.map(c => [c.id, c]));
  const enrollmentsByUser = new Map<string, Enrollment[]>();
  enrollments.forEach(e => {
    if (!enrollmentsByUser.has(e.userId)) enrollmentsByUser.set(e.userId, []);
    enrollmentsByUser.get(e.userId)!.push(e);
  });
  const gradesByUserCourse = new Map<string, CourseGradeDoc>();
  grades.forEach(g => gradesByUserCourse.set(`${g.userId}_${g.courseId}`, g));

  // Staff filter: only role === 'staff' or 'instructor' (admins not training-tracked).
  const staffUsers = users.filter(u => u.role === 'staff' || u.role === 'instructor');
  const filteredStaff = filters.department
    ? staffUsers.filter(u => u.department === filters.department)
    : staffUsers;

  const staffCompliance: StaffComplianceRow[] = filteredStaff.map(user => {
    const userEnrollments = (enrollmentsByUser.get(user.uid) || []).filter(e =>
      inDateRange(e.enrolledAt || e.lastAccessedAt, filters.startDate, filters.endDate)
    );

    const completed = userEnrollments.filter(e => e.status === 'completed');
    const overdue = userEnrollments.filter(e => {
      if (e.status === 'completed') return false;
      const closesAt = courseById.get(e.courseId)?.availability?.closesAt;
      return closesAt && new Date(closesAt).getTime() < Date.now();
    });

    const perCourse: PerCourseRow[] = userEnrollments.map(e => {
      const course = courseById.get(e.courseId);
      const grade = gradesByUserCourse.get(`${e.userId}_${e.courseId}`);
      const closesAt = course?.availability?.closesAt;
      return {
        courseId: e.courseId,
        courseTitle: course?.title || 'Unknown course',
        status: e.status,
        progress: e.progress,
        finalGrade: grade?.overallScore,
        passed: grade?.overallPassed,
        enrolledAt: e.enrolledAt,
        completedAt: e.completedAt,
        isOverdue: !!closesAt && new Date(closesAt).getTime() < Date.now() && e.status !== 'completed',
      };
    });

    const userGrades = perCourse
      .map(p => p.finalGrade)
      .filter((g): g is number => typeof g === 'number');
    const averageScore = userGrades.length
      ? userGrades.reduce((a, b) => a + b, 0) / userGrades.length
      : undefined;

    const lastActivity = userEnrollments
      .map(e => e.lastAccessedAt)
      .filter(Boolean)
      .sort()
      .slice(-1)[0];

    const completionRate = userEnrollments.length
      ? (completed.length / userEnrollments.length) * 100
      : 100;

    const daysUntilLicenseExpiry = user.licenseExpiry ? dayDiff(user.licenseExpiry) : undefined;

    return {
      userId: user.uid,
      displayName: user.displayName,
      email: user.email,
      department: user.department,
      jobTitle: user.jobTitle,
      totalEnrollments: userEnrollments.length,
      completedEnrollments: completed.length,
      completionRate: Math.round(completionRate * 10) / 10,
      overdueCount: overdue.length,
      licenseExpiry: user.licenseExpiry,
      daysUntilLicenseExpiry,
      averageScore: averageScore !== undefined ? Math.round(averageScore * 10) / 10 : undefined,
      lastActivity,
      status: computeStatus(completionRate, overdue.length, daysUntilLicenseExpiry),
      perCourse,
    };
  });

  const filteredByStatus = filters.status && filters.status !== 'all'
    ? staffCompliance.filter(s => s.status === filters.status)
    : staffCompliance;

  // Course performance — count enrollments and grades within date filter.
  const coursePerformance: CoursePerformanceRow[] = courses.map(course => {
    const courseEnrollments = enrollments.filter(e =>
      e.courseId === course.id &&
      inDateRange(e.enrolledAt || e.lastAccessedAt, filters.startDate, filters.endDate)
    );
    const courseGrades = grades.filter(g => g.courseId === course.id);
    const completionCount = courseEnrollments.filter(e => e.status === 'completed').length;
    const passCount = courseGrades.filter(g => g.overallPassed).length;
    const failCount = courseGrades.length - passCount;
    const avg = courseGrades.length
      ? courseGrades.reduce((a, g) => a + g.overallScore, 0) / courseGrades.length
      : null;
    const passRate = courseGrades.length ? (passCount / courseGrades.length) * 100 : null;
    return {
      courseId: course.id,
      title: course.title,
      enrollmentCount: courseEnrollments.length,
      completionCount,
      completionRate: courseEnrollments.length
        ? Math.round((completionCount / courseEnrollments.length) * 1000) / 10
        : 0,
      averageScore: avg !== null ? Math.round(avg * 10) / 10 : null,
      passCount,
      failCount,
      passRate: passRate !== null ? Math.round(passRate * 10) / 10 : null,
      flagged: passRate !== null && passRate < PASS_RATE_FLOOR,
    };
  }).filter(c => c.enrollmentCount > 0);

  // Expiring entries: combine user license expiries + certificate expiries (1y from issue).
  const expiringFromLicense: ExpiringEntry[] = filteredStaff
    .filter(u => u.licenseExpiry)
    .map(u => ({
      source: 'license' as const,
      userId: u.uid,
      staffName: u.displayName,
      expiryDate: u.licenseExpiry!,
      daysUntilExpiry: dayDiff(u.licenseExpiry!),
    }))
    .filter(e => e.daysUntilExpiry <= EXPIRING_WINDOW_DAYS && e.daysUntilExpiry >= 0);

  const expiringFromCert: ExpiringEntry[] = certificates
    .map((cert): ExpiringEntry | null => {
      const issued = new Date(cert.issuedAt).getTime();
      if (Number.isNaN(issued)) return null;
      const expiresAt = new Date(issued + CERT_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const days = dayDiff(expiresAt);
      if (days < 0 || days > EXPIRING_WINDOW_DAYS) return null;
      const user = users.find(u => u.uid === cert.userId);
      if (filters.department && user?.department !== filters.department) return null;
      return {
        source: 'certificate',
        userId: cert.userId,
        staffName: cert.studentName || user?.displayName || 'Unknown',
        certId: cert.certId,
        courseId: cert.courseId,
        courseName: cert.courseName,
        expiryDate: expiresAt,
        daysUntilExpiry: days,
      };
    })
    .filter((e): e is ExpiringEntry => e !== null);

  const expiringCerts = [...expiringFromLicense, ...expiringFromCert].sort(
    (a, b) => a.daysUntilExpiry - b.daysUntilExpiry
  );

  const totalEnrollments = staffCompliance.reduce((a, s) => a + s.totalEnrollments, 0);
  const totalCompletions = staffCompliance.reduce((a, s) => a + s.completedEnrollments, 0);
  const overallCompletionRate = totalEnrollments
    ? Math.round((totalCompletions / totalEnrollments) * 1000) / 10
    : 0;

  const passRates = coursePerformance
    .map(c => c.passRate)
    .filter((p): p is number => p !== null);
  const averagePassRate = passRates.length
    ? Math.round((passRates.reduce((a, b) => a + b, 0) / passRates.length) * 10) / 10
    : 0;

  const departments = Array.from(
    new Set(staffUsers.map(u => u.department).filter((d): d is string => !!d))
  ).sort();

  // Policy compliance — per-active-policy roll-up.
  const sigByPolicyUser = new Map<string, typeof signatures[number]>();
  signatures.forEach(s => sigByPolicyUser.set(`${s.policyId}_${s.userId}`, s));

  const policyCompliance: PolicyComplianceRow[] = policies
    .filter(p => !p.archived)
    .map(p => {
      const requiredUsers = staffUsers.filter(u =>
        p.assignedRoles.includes(u.role) &&
        (!filters.department || u.department === filters.department)
      );
      let signed = 0;
      let outdated = 0;
      const unsignedNames: string[] = [];
      requiredUsers.forEach(u => {
        const sig = sigByPolicyUser.get(`${p.id}_${u.uid}`);
        if (!sig) {
          unsignedNames.push(u.displayName);
        } else if (sig.policyVersion !== p.version) {
          outdated++;
          unsignedNames.push(u.displayName);
        } else {
          signed++;
        }
      });
      return {
        policyId: p.id,
        title: p.title,
        version: p.version,
        required: requiredUsers.length,
        signed,
        outdated,
        unsigned: requiredUsers.length - signed,
        unsignedStaffNames: unsignedNames,
      };
    });

  const policyRequiredTotal = policyCompliance.reduce((a, p) => a + p.required, 0);
  const policySignedTotal = policyCompliance.reduce((a, p) => a + p.signed, 0);
  const policyComplianceRate = policyRequiredTotal
    ? Math.round((policySignedTotal / policyRequiredTotal) * 1000) / 10
    : 100;

  return {
    totalStaff: filteredByStatus.length,
    staffWithCompletions: filteredByStatus.filter(s => s.completedEnrollments > 0).length,
    overallCompletionRate,
    totalOverdue: filteredByStatus.reduce((a, s) => a + s.overdueCount, 0),
    expiringWithin30: expiringCerts.filter(e => e.daysUntilExpiry <= 30).length,
    expiringWithin60: expiringCerts.filter(e => e.daysUntilExpiry <= 60).length,
    expiringWithin90: expiringCerts.filter(e => e.daysUntilExpiry <= 90).length,
    averagePassRate,
    staffCompliance: filteredByStatus,
    coursePerformance,
    expiringCerts,
    departments,
    policyCompliance,
    policyRequiredTotal,
    policySignedTotal,
    policyComplianceRate,
    computedAt: new Date().toISOString(),
  };
};
