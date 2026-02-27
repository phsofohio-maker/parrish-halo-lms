// ============================================
// USER & AUTHENTICATION
// ============================================

export type UserRoleType = "admin" | "instructor" | "staff" | "content_author";

export interface User {
  uid: string;
  displayName: string;
  email: string;
  role: UserRoleType;
  department?: string;
  jobTitle?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
}

// ============================================
// CONTENT BLOCKS
// ============================================

export type BlockType =
| "heading"
| "text"
| "image"
| "video"
| "quiz"
| "checklist"
| "drag_drop"
| "flashcard"
| "correction_log"
| "obj_subj_validator";

export interface TextBlockData {
content: string;
variant?: "paragraph"
| "callout-info"
| "callout-warning"
| "callout-critical";
}

export interface HeadingBlockData {
  content: string;
  level?: 1 | 2 | 3;
}

export interface ImageBlockData {
url: string;
caption?: string;
altText?: string;
}

export interface VideoBlockData {
url: string;
title: string;
duration: number; // seconds
transcript?: string;
}

export interface QuizQuestion {
id: string;
type: QuizQuestionType;
question: string;
options: string[];
correctAnswer: number | string | string[];
matchingPairs?: MatchingPair[];
points: number;
explanation?: string;
}

export interface QuizBlockData {
title: string;
questions: QuizQuestion[];
passingScore: number;
maxAttempts?: number;
}

export interface ChecklistBlockData {
title: string;
items: { id: string; label: string; required: boolean }[];
}

// ---- Correction Log (medical single-line-and-initial protocol) ----

export interface CorrectionLogEntry {
  id: string;
  text: string;
  author: string;
  authorId: string;
  timestamp: string;
  isOriginal: boolean;
  supersedes?: string; // ID of original entry this corrects
}

export interface CorrectionLogBlockData {
  title: string;
  entries: CorrectionLogEntry[];
}

// ---- Objective vs. Subjective Validator ----

export interface ObjSubjItem {
  id: string;
  text: string;
  category: "objective" | "subjective";
}

export interface ObjSubjValidatorBlockData {
  title: string;
  items: ObjSubjItem[];
  pointsPerItem: number;
}

// Union type for all block data
export type AnyBlockData =
| TextBlockData
| HeadingBlockData
| ImageBlockData
| VideoBlockData
| QuizBlockData
| ChecklistBlockData
| CorrectionLogBlockData
| ObjSubjValidatorBlockData
| Record<string, any>;

export interface ContentBlock {
id: string;
moduleId: string;
type: BlockType;
order: number;
required: boolean;
data: AnyBlockData;
}

// ============================================
// COURSE & MODULE HIERARCHY
// ============================================

export type CourseStatus = "draft" | "published" | "archived";
export type ModuleStatus = "draft" | "published" | "archived";
export type CourseCategory = "hospice"
| "compliance"
| "clinical_skills"
| "onboarding"
| "Testing";

export interface Module {
  id: string;
  courseId: string;
  title: string;
  description: string;
  status: ModuleStatus;
  passingScore: number;
  estimatedMinutes: number;
  order?: number;
  blocks: ContentBlock[];
  weight: number;
  isCritical: boolean;
}

export interface ModuleScore {
  moduleId: string;
  moduleTitle: string;
  score: number | null;
  weight: number;
  weightedScore: number | null;
  isCritical: boolean;
  passed: boolean | null; // null if not yet graded
  passingScore: number;
}

export interface CourseGradeCalculation {
  courseId: string;
  userId: string;

  // Overall metrics
  overallScore: number; // Weighted average (0-100)
  overallPassed: boolean; // true if meets all criteria

  // Critical module tracking
  totalCriticalModules: number;
  criticalModulesPassed: number;
  allCriticalModulesPassed: boolean;

  // Module-level detail
  moduleBreakdown: ModuleScore[];

  // Completion tracking
  totalModules: number;
  gradedModules: number; // How many have grades
  completionPercent: number; // (gradedModules / totalModules) * 100

  // Metadata
  calculatedAt: string;
  isComplete: boolean; // true if all modules graded
}

export interface CourseGradeDoc {
  userId: string;
  courseId: string;
  overallScore: number;
  overallPassed: boolean;
  criticalModulesPassed: number;
  totalCriticalModules: number;
  allCriticalModulesPassed: boolean;
  moduleBreakdown: ModuleScore[];
  totalModules: number;
  gradedModules: number;
  completionPercent: number;
  isComplete: boolean;
  calculatedAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
}

export interface WeightedGradingConfig {
  courseId: string;

  // Validation rules
  requireAllCriticalPassed: boolean; // Default: true
  minimumOverallScore: number; // Default: 70

  // Attempt limits
  maxAttemptsPerModule: number; // Default: 3
  allowRemediationRetry: boolean; // Default: true

  createdBy: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  category: CourseCategory;
  ceCredits: number;
  thumbnailUrl: string;
  status?: CourseStatus;
  modules: Module[];
  estimatedHours: number;
}

// ============================================
// AUDIT & COMPLIANCE
// ============================================

export type AuditActionType =
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "COURSE_CREATE"
  | "COURSE_UPDATE"
  | "COURSE_DELETE"
  | "COURSE_PUBLISH"
  | "MODULE_CREATE"
  | "MODULE_UPDATE"
  | "MODULE_DELETE"
  | "BLOCK_CREATE"
  | "BLOCK_UPDATE"
  | "BLOCK_DELETE"
  | "GRADE_ENTRY"
  | "GRADE_CHANGE"
  | "ENROLLMENT_CREATE"
  | "ENROLLMENT_UPDATE"
  | "ASSESSMENT_SUBMIT"
  | "ASSESSMENT_GRADE"
  | "COHORT_CREATE"
  | "COHORT_UPDATE"
  | "COHORT_DELETE"
  | "BULK_ENROLLMENT"
  | "CORRECTION_ENTRY"
  | "LICENSE_GATE_BLOCKED";

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actionType: AuditActionType;
  targetId: string;
  details: string;
  metadata?: Record<string, any>;
}

// ============================================
// ENROLLMENT & PROGRESS
// ============================================

export type EnrollmentStatus = "not_started"
| "in_progress"
| "completed"
| "failed"
| "needs_review";
export type CompetencyLevel = "not_competent"
| "developing"
| "competent"
| "mastery";

export interface Enrollment {
id: string;
userId: string;
courseId: string;
progress: number;
status: EnrollmentStatus;
enrolledAt?: string;
completedAt?: string;
quizAnswers?: Record<string, any[]>;
lastAccessedAt: string;
score?: number;
}

export interface ModuleProgress {
moduleId: string;
completed: boolean;
score?: number;
attempts: number;
lastAttemptAt?: string;
}

export interface Grade {
id: string;
userId: string;
moduleId: string;
score: number;
passed: boolean;
gradedBy: string; // UID of grader (manual entry)
gradedAt: string;
notes?: string;
}

export type QuizQuestionType =
| "multiple-choice"
| "true-false"
| "matching"
| "fill-blank"
| "short-answer";

export interface MatchingPair {
left: string;
right: string;
}

export interface Invitation {
id: string;
email: string;
role: UserRoleType;
department?: string;
sentAt: string;
status: "pending" | "expired" | "accepted";
}

// ============================================
// COHORT MANAGEMENT
// ============================================

export interface CohortFilterCriteria {
  jobTitles?: string[];
  departments?: string[];
}

export interface Cohort {
  id: string;
  name: string;
  description: string;
  filterCriteria: CohortFilterCriteria;
  courseIds: string[];
  createdBy: string;
  createdAt: string;
}

// ============================================
// LICENSE & COMPLIANCE
// ============================================

export type LicenseStatus = "valid" | "expiring_soon" | "expired" | "not_set";

/** Course categories that require a valid license to access */
export const LICENSE_REQUIRED_CATEGORIES: CourseCategory[] = ["hospice", "clinical_skills"];
