# Harmony Health LMS (HHCALMS)

> **Clinical-grade Learning Management System for Parrish Health Systems**  
> *"Nurse Owned & Operated — Clinical Education Mastery"*

---

## Summary

Harmony Health LMS is a purpose-built compliance training platform designed to replace paper-based staff education at Parrish Health Systems. It is not a general-purpose LMS — it is a **legal defensibility engine** built to satisfy CMS audit requirements.

Every design decision is anchored to three non-negotiable properties: **immutable audit trails**, **role-enforced access**, and **weighted, clinically-meaningful grading**. Staff can complete courses and quizzes on any device. Instructors author content with a block-based builder. Admins manage users, review grades, and maintain the compliance record — all without touching a spreadsheet or a filing cabinet.

The system is content-agnostic and can ingest any healthcare curriculum (Hospice Documentation, Wound Care, Ethics, OSHA compliance, etc.) with configurable grading weights per module.

---

## Features

### Authentication & Access Control
- **Three-tier RBAC** — Admin, Instructor, and Staff roles enforced via Firebase Auth JWT custom claims (not Firestore profile data)
- **Fail-closed security** — Firestore rules deny by default; every permission is explicitly granted
- **Role-based routing** — Users land on role-appropriate dashboards at login; unauthorized routes return Access Denied, not a broken page
- **Staff invitation pipeline** — Admins send tokenized email invitations; new accounts are created with pre-assigned roles

### Assessment Engine
- **Five quiz question types** — Multiple choice, true/false, fill-in-the-blank (case-insensitive), matching (pair-by-pair validation), and short-answer (flagged for manual review with provisional credit)
- **Weighted grading engine** — Course grades calculated from per-module weights via Cloud Function; critical module failure can override the overall course grade regardless of other scores
- **Remediation workflow** — After three quiz failures, the learner is locked out automatically; a supervisor can unlock with a documented decision, creating a full audit record

### Content Authoring
- **Block-based Course Builder** — Instructors compose modules from 7 block types: text, image, video, quiz, flashcard, drag-and-drop, and embedded media
- **Draft / Published workflow** — Courses remain invisible to staff until explicitly published; every status change is audit-logged
- **Module ordering and weighting** — Instructors set per-module grade weights and mark modules as critical directly in the builder UI

### Learner Experience
- **Course Player** — Renders content block-by-block, tracks per-block completion, and records quiz attempts with timestamps
- **Progress persistence** — Progress survives page refreshes and session gaps; enrollment status cascades automatically to "completed" at 100% progress
- **My Grades** — Staff view their own grade breakdowns, quiz scores by question type, and course completion status

### Compliance Infrastructure
- **Immutable audit trail** — Every significant action (enrollment, quiz submission, grade entry, grade correction, role change, remediation decision) writes a tamper-proof log entry with actor ID, timestamp, and contextual data. Logs cannot be updated or deleted — enforced at the Firestore rules layer
- **Audit Logs viewer** — Admins review the full system audit trail with search and filter; exportable for CMS inspectors
- **Grade review queue** — Short-answer questions are held in a pending review queue; instructors approve or reject with per-question commentary
- **License gating (Clinical)** — Staff with expired nursing licenses are blocked from accessing licensed clinical content
- **Correction Log (Clinical)** — Documentation corrections are appended, never overwritten — mirroring clinical documentation standards

### Administration
- **User Management** — Admins create, invite, and role-assign staff accounts; account status and role changes are audit-logged
- **Course Roster** — Instructors view enrollment and completion status per course
- **Grade Management** — Instructors review short-answer submissions, approve or reject with feedback, and view weighted grade breakdowns per learner

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS |
| Backend | Firebase / Firestore (us-east1) |
| Auth | Firebase Authentication with JWT custom claims |
| Server Logic | Firebase Cloud Functions v2 (Node 24) |
| File Storage | Firebase Storage |
| Secret Management | GCP Secret Manager |
| Email | Firebase Trigger Email Extension → Google Workspace SMTP |
| Document Generation | Google Docs API + Drive API (mail-merge PDF certificates) |
| CI/CD | GitHub Actions → Firebase Hosting |
| GCP Project | `parrish-harmonyhca` / Firebase Project: `harmony-lms` |

---

## Architecture Principles

This codebase follows the **Resilient Engineering Manifesto**:

- **Audit-First** — Every write operation produces an immutable log entry, enforced at both the service layer and Cloud Function triggers
- **Fail-Closed** — Security rules deny all access by default; unknown or unauthenticated requests are rejected before they reach data
- **Single Source of Truth** — All TypeScript interfaces live in `functions/src/types.ts`; services are the only Firestore access layer; JWT claims are the authoritative role source
- **Evidence-Based Iteration** — No feature is marked complete without a passing verification test or confirmed Firestore persistence

---

## Cloud Functions

Six Cloud Functions handle all server-side business logic:

| Function | Trigger | Purpose |
|---|---|---|
| `onGradeCreate` | Firestore write | Validates new grade entries; enforces score bounds (0–100) |
| `onGradeUpdate` | Firestore write | Audit-logs every grade change with before/after values |
| `onEnrollmentUpdate` | Firestore write | Cascades enrollment status; auto-completes at 100% progress |
| `onProgressUpdate` | Firestore write | Validates block-level progress tracking |
| `onRemediationUpdate` | Firestore write | Calculates competency status after remediation decisions |
| `calculateCourseGrade` | Callable | Computes weighted course grade from module grades |
| `createInvitedUser` | Callable | Creates Firebase Auth account from invitation token |
| `validateInvitationToken` | Callable | Validates token before account creation |
| `setUserRole` | Callable | Admin-only; assigns JWT custom claim role |

---

## Project Status

| Phase | Focus | Status |
|---|---|---|
| Phase 1 — Infrastructure & Audit | Security, Data, Logging | ✅ 100% — 31/31 tests passing |
| Phase 2 — Gradebook Engine | Assessment & Enrollment | 🟡 ~80% — Grade UI and remediation UI in progress |
| Phase 3 — Clinical Compliance | Healthcare-specific features | 🟡 ~30% — LicenseGate, CorrectionLog, ObjSubjPlayer shipped |
| Phase 4 — Reporting & Field Readiness | Analytics, CE vault, CI/CD | 🔴 Not started |

**Estimated time to initial internal deployment:** 2–3 focused days from current state  
**Estimated time to full production rollout:** Additional 4–6 weeks

---

## Deployment

### Prerequisites
- Node 24+
- Firebase CLI authenticated to `harmony-lms` project
- GCP Secret Manager secrets configured (`GOOGLE_SERVICE_ACCOUNT_KEY`)

### Local Development
```bash
npm install
npm run dev
```

### Cloud Functions (local)
```bash
cd functions
npm install
npm run build
firebase emulators:start
```

### Production Deploy
```bash
# Frontend
npm run build
firebase deploy --only hosting

# Cloud Functions
firebase deploy --only functions

# Security Rules
firebase deploy --only firestore:rules,storage
```

CI/CD via GitHub Actions deploys automatically on merge to `main`. See `.github/workflows/ci.yml`.

---

## Repository Structure

```
/
├── src/
│   ├── pages/          # Route-level React components
│   ├── services/       # Firestore access layer (only layer that touches the DB)
│   ├── hooks/          # React state management (consume services)
│   ├── components/     # Shared UI components
│   └── utils/          # Pure utility functions (grading, availability, etc.)
├── functions/
│   ├── src/
│   │   ├── index.ts    # All Cloud Function definitions
│   │   └── types.ts    # Canonical TypeScript interfaces (source of truth)
│   └── lib/            # Compiled Cloud Functions output
├── firestore.rules     # Firestore RBAC security rules
├── storage.rules       # Firebase Storage rules
├── firestore.indexes.json
└── firebase.json
```

---

## Key Design Decisions

**Why JWT claims over Firestore profile for roles?**  
Firestore rules execute before a document is read. The rules layer can only inspect `request.auth.token` — not a Firestore profile document — without an extra read. JWT claims are cryptographically signed by Firebase, making them tamper-proof and available at rule evaluation time with zero latency.

**Why are audit logs append-only at the rules layer?**  
`allow update, delete: if false` is unconditional in `firestore.rules`. No role — including admin — can modify or delete an audit entry. This satisfies CMS requirements for tamper-evident records without relying on application-level access control alone.

**Why Cloud Functions for grade calculation instead of client-side logic?**  
Weighted grade calculation is a legal record. Performing it server-side via Cloud Functions ensures the calculation cannot be manipulated by a client and that every result is independently verifiable and audit-logged.

---

## Development Team

| Person | Role |
|---|---|
| Kobe | Developer & Project Owner |
| Darrius | Developer Collaborator |
| Miara Carpenter | Clinical Office Assistant — Lead Test User (Centennial Office) |

**Client:** Parrish Health Systems  
**Compliance target:** CMS audit standards for clinical staff training records

---

*Built under the Resilient Engineering Manifesto — technical debt is a toxin, code is a narrative of intent.*
