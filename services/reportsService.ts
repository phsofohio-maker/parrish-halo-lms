/**
 * Reports Service
 *
 * Builds CMS-grade audit reports by joining users, courses, enrollments,
 * grades, course_grades, and certificates client-side. Three report types:
 *   1. Staff Training Completion
 *   2. Certification Registry
 *   3. Grade & Assessment History
 *
 * @module services/reportsService
 */

import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import {
  User,
  Course,
  Module,
  Enrollment,
  Certificate,
  CourseGradeDoc,
  PolicyDocument,
  PolicySignature,
} from '../functions/src/types';
import { getAllPolicies, getAllSignatures } from './policyService';

export type ReportType = 'staff_completion' | 'certification' | 'grade_history' | 'policy_signature';

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  department?: string;
  /** When set, only courses in this list are included (instructor scope). */
  courseIds?: string[];
}

export interface ReportSummaryItem {
  label: string;
  value: string;
}

export interface BuiltReport {
  type: ReportType;
  title: string;
  subtitle?: string;
  dateRange: string;
  headers: string[];
  rows: (string | number)[][];
  summary: ReportSummaryItem[];
  /** ISO of generation. */
  generatedAt: string;
}

interface RawData {
  users: User[];
  courses: Course[];
  enrollments: Enrollment[];
  grades: GradeRow[];
  courseGrades: CourseGradeDoc[];
  certificates: Certificate[];
  modulesByCourse: Map<string, Module[]>;
}

interface GradeRow {
  id: string;
  userId: string;
  moduleId: string;
  courseId: string;
  score: number;
  passed: boolean;
  gradedBy: string;
  gradedByName: string;
  gradedAt: string;
  notes?: string;
  attemptNumber?: number;
}

const inDateRange = (iso: string | undefined, start?: string, end?: string): boolean => {
  if (!start && !end) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (start && t < new Date(start).getTime()) return false;
  if (end && t > new Date(end).getTime() + 24 * 60 * 60 * 1000) return false;
  return true;
};

const fmtDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const fmtRange = (filters: ReportFilters): string => {
  if (filters.startDate && filters.endDate) {
    return `${fmtDate(filters.startDate)} – ${fmtDate(filters.endDate)}`;
  }
  if (filters.startDate) return `From ${fmtDate(filters.startDate)}`;
  if (filters.endDate) return `Through ${fmtDate(filters.endDate)}`;
  return 'All time';
};

const fetchRawData = async (filters: ReportFilters): Promise<RawData> => {
  const [usersSnap, coursesSnap, enrollmentsSnap, gradesSnap, courseGradesSnap, certsSnap] = await Promise.all([
    getDocs(query(collection(db, 'users'), orderBy('displayName'))),
    getDocs(collection(db, 'courses')),
    getDocs(collection(db, 'enrollments')),
    getDocs(collection(db, 'grades')),
    getDocs(collection(db, 'course_grades')),
    getDocs(collection(db, 'certificates')),
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

  const grades: GradeRow[] = gradesSnap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId,
      moduleId: data.moduleId,
      courseId: data.courseId,
      score: data.score ?? 0,
      passed: !!data.passed,
      gradedBy: data.gradedBy || '',
      gradedByName: data.gradedByName || '',
      gradedAt: data.gradedAt?.toDate?.()?.toISOString() || '',
      notes: data.notes,
      attemptNumber: data.attemptNumber,
    };
  });

  const courseGrades: CourseGradeDoc[] = courseGradesSnap.docs.map(d => d.data() as CourseGradeDoc);
  const certificates: Certificate[] = certsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Certificate));

  // Apply course filter (instructor scope) up-front.
  let scopedCourseIds: Set<string> | null = null;
  if (filters.courseIds && filters.courseIds.length > 0) {
    scopedCourseIds = new Set(filters.courseIds);
  }

  const filteredCourses = scopedCourseIds
    ? courses.filter(c => scopedCourseIds!.has(c.id))
    : courses;

  // Build module lookup for grade history report. Modules are nested under
  // courses in the modules subcollection; we fetch them lazily per course.
  const modulesByCourse = new Map<string, Module[]>();
  await Promise.all(
    filteredCourses.map(async (course) => {
      try {
        const modSnap = await getDocs(collection(db, 'courses', course.id, 'modules'));
        modulesByCourse.set(
          course.id,
          modSnap.docs.map(d => ({ id: d.id, ...d.data() } as Module))
        );
      } catch {
        modulesByCourse.set(course.id, []);
      }
    })
  );

  return {
    users,
    courses: filteredCourses,
    enrollments: scopedCourseIds
      ? enrollments.filter(e => scopedCourseIds!.has(e.courseId))
      : enrollments,
    grades: scopedCourseIds
      ? grades.filter(g => scopedCourseIds!.has(g.courseId))
      : grades,
    courseGrades: scopedCourseIds
      ? courseGrades.filter(g => scopedCourseIds!.has(g.courseId))
      : courseGrades,
    certificates: scopedCourseIds
      ? certificates.filter(c => scopedCourseIds!.has(c.courseId))
      : certificates,
    modulesByCourse,
  };
};

/**
 * Returns the set of course IDs an instructor has graded at least one
 * submission in. Used to scope reports to "courses they teach".
 */
export const getInstructorCourseIds = async (instructorUid: string): Promise<string[]> => {
  const gradesSnap = await getDocs(collection(db, 'grades'));
  const courseIds = new Set<string>();
  gradesSnap.docs.forEach(d => {
    const g = d.data();
    if (g.gradedBy === instructorUid && g.courseId) courseIds.add(g.courseId);
  });
  return Array.from(courseIds);
};

// ============================================
// Report 1: Staff Training Completion
// ============================================

const buildStaffCompletionReport = (raw: RawData, filters: ReportFilters): BuiltReport => {
  const { users, courses, enrollments, courseGrades, certificates } = raw;
  const userById = new Map(users.map(u => [u.uid, u]));
  const courseById = new Map(courses.map(c => [c.id, c]));
  const gradeByUserCourse = new Map(courseGrades.map(g => [`${g.userId}_${g.courseId}`, g]));
  const certByUserCourse = new Map(certificates.map(c => [`${c.userId}_${c.courseId}`, c]));

  const filteredEnrollments = enrollments
    .filter(e => inDateRange(e.enrolledAt, filters.startDate, filters.endDate))
    .filter(e => {
      if (!filters.department) return true;
      return userById.get(e.userId)?.department === filters.department;
    })
    .sort((a, b) => {
      const an = userById.get(a.userId)?.displayName || '';
      const bn = userById.get(b.userId)?.displayName || '';
      if (an !== bn) return an.localeCompare(bn);
      const at = courseById.get(a.courseId)?.title || '';
      const bt = courseById.get(b.courseId)?.title || '';
      return at.localeCompare(bt);
    });

  const headers = [
    'Staff Name', 'Department', 'Course Title', 'Enrollment Date',
    'Completion Date', 'Status', 'Final Grade', 'Certificate ID',
  ];

  const rows = filteredEnrollments.map(e => {
    const user = userById.get(e.userId);
    const course = courseById.get(e.courseId);
    const grade = gradeByUserCourse.get(`${e.userId}_${e.courseId}`);
    const cert = certByUserCourse.get(`${e.userId}_${e.courseId}`);
    return [
      user?.displayName || 'Unknown',
      user?.department || '',
      course?.title || 'Unknown',
      fmtDate(e.enrolledAt),
      fmtDate(e.completedAt),
      e.status.replace('_', ' '),
      grade ? `${grade.overallScore}%` : (e.score !== undefined ? `${e.score}%` : ''),
      cert?.certId || '',
    ];
  });

  const totalStaff = new Set(filteredEnrollments.map(e => e.userId)).size;
  const completions = filteredEnrollments.filter(e => e.status === 'completed').length;
  const completionRate = filteredEnrollments.length
    ? Math.round((completions / filteredEnrollments.length) * 100)
    : 0;

  return {
    type: 'staff_completion',
    title: 'Staff Training Completion',
    subtitle: 'CMS audit-ready training completion record',
    dateRange: fmtRange(filters),
    headers,
    rows,
    summary: [
      { label: 'Staff', value: String(totalStaff) },
      { label: 'Enrollments', value: String(filteredEnrollments.length) },
      { label: 'Completions', value: String(completions) },
      { label: 'Completion Rate', value: `${completionRate}%` },
    ],
    generatedAt: new Date().toISOString(),
  };
};

// ============================================
// Report 2: Certification Registry
// ============================================

const buildCertificationReport = (raw: RawData, filters: ReportFilters): BuiltReport => {
  const { users, certificates, courses } = raw;
  const userById = new Map(users.map(u => [u.uid, u]));
  const courseById = new Map(courses.map(c => [c.id, c]));

  const filteredCerts = certificates
    .filter(c => inDateRange(c.issuedAt, filters.startDate, filters.endDate))
    .filter(c => {
      if (!filters.department) return true;
      return userById.get(c.userId)?.department === filters.department;
    })
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

  const headers = [
    'Cert ID', 'Staff Name', 'Department', 'Course Title',
    'Issue Date', 'Expiry Date', 'Grade', 'CE Credits', 'PDF Status',
  ];

  const CERT_VALIDITY_DAYS = 365;
  const rows = filteredCerts.map(c => {
    const user = userById.get(c.userId);
    const course = courseById.get(c.courseId);
    const issued = new Date(c.issuedAt);
    const expiry = new Date(issued.getTime() + CERT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    return [
      c.certId,
      c.studentName || user?.displayName || '',
      user?.department || '',
      c.courseName || course?.title || '',
      fmtDate(c.issuedAt),
      fmtDate(expiry.toISOString()),
      `${c.grade}%`,
      c.ceCredits.toString(),
      c.status,
    ];
  });

  const totalCredits = filteredCerts.reduce((acc, c) => acc + c.ceCredits, 0);

  return {
    type: 'certification',
    title: 'Certification Registry',
    subtitle: 'Issued CE credit certificates',
    dateRange: fmtRange(filters),
    headers,
    rows,
    summary: [
      { label: 'Certificates', value: String(filteredCerts.length) },
      { label: 'CE Credits Awarded', value: totalCredits.toFixed(1) },
      { label: 'Generated PDFs', value: String(filteredCerts.filter(c => c.status === 'generated').length) },
    ],
    generatedAt: new Date().toISOString(),
  };
};

// ============================================
// Report 3: Grade & Assessment History
// ============================================

const buildGradeHistoryReport = (raw: RawData, filters: ReportFilters): BuiltReport => {
  const { users, courses, grades, modulesByCourse } = raw;
  const userById = new Map(users.map(u => [u.uid, u]));
  const courseById = new Map(courses.map(c => [c.id, c]));

  const filteredGrades = grades
    .filter(g => inDateRange(g.gradedAt, filters.startDate, filters.endDate))
    .filter(g => {
      if (!filters.department) return true;
      return userById.get(g.userId)?.department === filters.department;
    })
    .sort((a, b) => new Date(b.gradedAt).getTime() - new Date(a.gradedAt).getTime());

  const moduleTitle = (courseId: string, moduleId: string): string => {
    const mods = modulesByCourse.get(courseId) || [];
    return mods.find(m => m.id === moduleId)?.title || moduleId;
  };

  const graderName = (g: GradeRow): string => {
    if (g.gradedByName) return g.gradedByName;
    if (!g.gradedBy || g.gradedBy === 'system' || g.gradedBy === 'auto') return 'Auto-graded';
    return userById.get(g.gradedBy)?.displayName || g.gradedBy;
  };

  const headers = [
    'Staff Name', 'Course Title', 'Module Title', 'Quiz Score',
    'Result', 'Graded By', 'Grade Date', 'Attempt',
  ];

  const rows = filteredGrades.map(g => [
    userById.get(g.userId)?.displayName || g.userId,
    courseById.get(g.courseId)?.title || g.courseId,
    moduleTitle(g.courseId, g.moduleId),
    `${g.score}%`,
    g.passed ? 'PASS' : 'FAIL',
    graderName(g),
    fmtDate(g.gradedAt),
    g.attemptNumber !== undefined ? String(g.attemptNumber) : '',
  ]);

  const passCount = filteredGrades.filter(g => g.passed).length;
  const passRate = filteredGrades.length
    ? Math.round((passCount / filteredGrades.length) * 100)
    : 0;
  const avgScore = filteredGrades.length
    ? (filteredGrades.reduce((a, g) => a + g.score, 0) / filteredGrades.length).toFixed(1)
    : '0.0';

  return {
    type: 'grade_history',
    title: 'Grade & Assessment History',
    subtitle: 'Module-level graded assessments',
    dateRange: fmtRange(filters),
    headers,
    rows,
    summary: [
      { label: 'Assessments', value: String(filteredGrades.length) },
      { label: 'Pass Rate', value: `${passRate}%` },
      { label: 'Average Score', value: `${avgScore}%` },
    ],
    generatedAt: new Date().toISOString(),
  };
};

// ============================================
// Report 4: Policy Signature Audit
// ============================================

const buildPolicySignatureReport = async (
  raw: RawData,
  filters: ReportFilters
): Promise<BuiltReport> => {
  const { users } = raw;
  const userById = new Map(users.map(u => [u.uid, u]));

  const [policies, signatures] = await Promise.all([
    getAllPolicies(),
    getAllSignatures(),
  ]);

  const sigByPolicyUser = new Map<string, PolicySignature>();
  signatures.forEach(s => sigByPolicyUser.set(`${s.policyId}_${s.userId}`, s));

  const headers = [
    'Staff Name', 'Department', 'Policy Title', 'Version',
    'Required Date', 'Signed Date', 'Method', 'Status',
  ];

  const rows: (string | number)[][] = [];
  let total = 0;
  let signedCurrent = 0;
  let signedOld = 0;
  let unsigned = 0;
  const nonCompliantUsers = new Set<string>();

  policies
    .filter(p => !p.archived)
    .forEach((policy: PolicyDocument) => {
      const required = users.filter(u =>
        policy.assignedRoles.includes(u.role) &&
        (!filters.department || u.department === filters.department)
      );

      required.forEach(user => {
        const sig = sigByPolicyUser.get(`${policy.id}_${user.uid}`);
        let status: string;
        if (!sig) {
          status = 'Unsigned';
          unsigned++;
          nonCompliantUsers.add(user.displayName);
        } else if (sig.policyVersion !== policy.version) {
          status = 'Expired Version';
          signedOld++;
          nonCompliantUsers.add(user.displayName);
        } else {
          status = 'Signed';
          signedCurrent++;
        }
        total++;
        rows.push([
          user.displayName,
          user.department || '',
          policy.title,
          policy.version,
          fmtDate(policy.effectiveDate),
          sig ? fmtDate(sig.signedAt) : '',
          sig ? sig.signatureMethod : '',
          status,
        ]);
      });
    });

  const completionRate = total ? Math.round((signedCurrent / total) * 100) : 100;

  return {
    type: 'policy_signature',
    title: 'Policy Signature Audit',
    subtitle: `Required signature compliance${
      nonCompliantUsers.size > 0
        ? ` · Non-compliant: ${Array.from(nonCompliantUsers).slice(0, 5).join(', ')}${
            nonCompliantUsers.size > 5 ? `, +${nonCompliantUsers.size - 5} more` : ''
          }`
        : ''
    }`,
    dateRange: fmtRange(filters),
    headers,
    rows,
    summary: [
      { label: 'Required signatures', value: String(total) },
      { label: 'Signed (current)', value: String(signedCurrent) },
      { label: 'Outdated version', value: String(signedOld) },
      { label: 'Unsigned', value: String(unsigned) },
      { label: 'Compliance rate', value: `${completionRate}%` },
    ],
    generatedAt: new Date().toISOString(),
  };
};

// ============================================
// Public Entry Point
// ============================================

export const buildReport = async (
  type: ReportType,
  filters: ReportFilters = {}
): Promise<BuiltReport> => {
  const raw = await fetchRawData(filters);
  switch (type) {
    case 'staff_completion':
      return buildStaffCompletionReport(raw, filters);
    case 'certification':
      return buildCertificationReport(raw, filters);
    case 'grade_history':
      return buildGradeHistoryReport(raw, filters);
    case 'policy_signature':
      return await buildPolicySignatureReport(raw, filters);
  }
};
