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
  requiresPasswordChange?: boolean;
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
/**
 * Type depends on question type:
 * - multiple-choice / true-false: number (index of correct option)
 * - fill-blank: string (correct text)
 * - matching: string[] (via matchingPairs)
 * - short-answer: string (rubric, not auto-graded)
 * - multiple-answer: number[] (indices of ALL correct options)
 */
correctAnswer: number | string | number[] | string[];
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

export interface AvailabilityWindow {
  opensAt?: string; // ISO 8601 datetime
  closesAt?: string; // ISO 8601 datetime
}

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
  availability?: AvailabilityWindow;
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
  availability?: AvailabilityWindow;
  certificateTemplateDocId?: string;
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
  | "LICENSE_GATE_BLOCKED"
  | "CERTIFICATE_ISSUED"
  | "CERTIFICATE_FAILED"
  | "CERTIFICATE_EMAIL_SENT"
  | "POLICY_CREATE"
  | "POLICY_UPDATE"
  | "POLICY_VERSION_BUMP"
  | "POLICY_SIGNED"
  | "POLICY_REMINDER_SENT"
  | "ACCOUNT_DIRECT_CREATE"
  | "PASSWORD_CHANGE_FORCED";

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
| "short-answer"
| "multiple-answer";

export interface MatchingPair {
left: string;
right: string;
}

export interface Invitation {
id: string;
email: string;
role: UserRoleType;
department?: string;
token: string;
sentAt: string;
expiresAt: string;
status: "pending" | "expired" | "accepted" | "cancelled";
invitedBy: string;
invitedByName: string;
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

// ============================================
// CERTIFICATES
// ============================================

export type CertificateStatus = "pending" | "generated" | "failed";

export interface Certificate {
  id: string;
  certId: string;
  userId: string;
  courseId: string;
  orgId: string;
  issuedAt: string;
  grade: number;
  ceCredits: number;
  courseName: string;
  studentName: string;
  issuerName: string;
  pdfStoragePath: string;
  templateDocId?: string;
  generatedDocId?: string;
  status: CertificateStatus;
}

// ============================================
// POLICIES & E-SIGNATURES
// ============================================

export interface PolicyDocument {
  id: string;
  title: string;
  /** Rich-text HTML body of the policy. */
  content: string;
  /** Semantic version, e.g., "2.1". A new version requires re-signing. */
  version: string;
  /** ISO 8601 effective date. */
  effectiveDate: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  /** Roles that must sign this policy. */
  assignedRoles: UserRoleType[];
  /** True once at least one signature has been recorded — locks edits. */
  hasSignatures?: boolean;
  /** Soft-archive flag — prior versions stay queryable. */
  archived?: boolean;
}

export type SignatureMethod = "drawn" | "typed";

export interface PolicySignature {
  id: string;
  policyId: string;
  /** Version of the policy at the moment of signing. */
  policyVersion: string;
  userId: string;
  userName: string;
  signedAt: string;
  /** Base64 PNG (drawn) or styled text payload (typed). */
  signatureData: string;
  signatureMethod: SignatureMethod;
  /** Captured for legal validity. May be empty if blocked client-side. */
  ipAddress?: string;
  userAgent: string;
  /** SHA-256 hex of the policy content at time of signing. */
  documentHash: string;
}

// ============================================
// ORGANIZATION CONFIG
// ============================================

export interface Organization {
  id: string;
  name: string;
  issuerName: string;
  certPrefix: string;
  logoUrl?: string;
  createdAt: string;
}

// ============================================
// COURSE IMPORT PIPELINE (Guide 13 — Feature A)
// ============================================

export type CourseImportStatus =
  // File being written to Storage
  | "uploading"
  // Cloud Function extracting content
  | "processing"
  // Extraction complete, awaiting instructor approval
  | "pending_review"
  // Instructor approved, promotion in progress
  | "approved"
  // Course + modules + blocks written to Firestore
  | "promoted"
  // Instructor rejected the import
  | "rejected"
  // Extraction or promotion failed
  | "failed";

export interface ExtractedBlock {
  // Only these two types are extracted — no quiz generation
  type: "heading" | "text";
  // HTML string (heading text or rich-text body)
  content: string;
  order: number;
}

export interface ExtractedModule {
  title: string;
  description: string;
  estimatedMinutes: number;
  isCritical: boolean;
  weight: number;
  passingScore: number;
  contentBlocks: ExtractedBlock[];
}

export interface ExtractedCourse {
  title: string;
  description: string;
  category: CourseCategory;
  ceCredits: number;
  modules: ExtractedModule[];
}

export interface CourseImport {
  id: string;
  status: CourseImportStatus;

  // Upload metadata
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  fileName: string;
  fileType: "pdf" | "docx";
  storagePath: string;

  // Extraction result (null until processing complete)
  extractedCourse: ExtractedCourse | null;
  extractionError: string | null;

  // Review metadata
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;

  // Promotion result (null until promoted)
  promotedCourseId: string | null;
}
