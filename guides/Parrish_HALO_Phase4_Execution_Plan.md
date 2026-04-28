# Parrish HALO Phase 4 Execution Plan

**Reporting, Analytics & Field Readiness**
Parrish HALO · Parrish Health Systems
April 28, 2026

---

## How to Use This Document

This is a sequenced execution plan designed for use with Claude Code against the Parrish HALO Firebase codebase. Same format that drove Phase 2 (Steps 1–7), Phase 3 (Steps 1–11), and Ops Hardening to verified completion.

Each step is independently verifiable. Complete the step, run the verification, confirm passing, then proceed.

**Estimated total: ~3–4 weeks**

---

## Scoping Decisions (Locked April 28, 2026)

These decisions were made before this plan was written. They are not open for re-evaluation during execution.

| Decision | Resolution |
|---|---|
| Skill-gap dashboard metrics | Full picture: completion rates by staff, expiring certs & overdue training, pass/fail rates by course/module |
| Audit report format | Both — PDF for CMS surveyors, CSV for internal analysis |
| E-signatures | Build custom (no vendor dependency — no DocuSign/HelloSign) |
| Mobile (Capacitor) | Deferred — not in Phase 4 scope |
| Field stress testing | Formal step with a testing protocol |

---

## Current Baseline

- **Phase 1: 100%** · **Phase 2: 100%** · **Phase 3: 100%** · Phase 4: 0%
- Deployed to Firebase Hosting as Parrish HALO
- ADR-001 locked (single-org, orgId field, `PHS-{YYYYMMDD}-{4hex}` cert IDs)
- CE Credit Vault shipped with `generateCertificate` Cloud Function
- 7 Cloud Functions live
- Toast system, error boundary, and analytics infrastructure in place (from Ops Hardening)
- CI/CD pipeline deploying on push to main
- Firestore backups running daily with 7-year retention
- Sentry error monitoring active
- Firebase Analytics tracking key user journeys

---

## Step 1: Certificate Email Notifications

**Why this is first:** It's the smallest item in Phase 4, it completes a deferred Phase 3 feature, and it exercises the Firebase Trigger Email extension pattern that the audit report export (Step 4) will also use for scheduled report delivery.

**Estimated Time:** 2–4 hours

### 1A: Install Firebase Trigger Email Extension

**What to do:**

1. In Firebase Console → Extensions → Browse, find "Trigger Email from Firestore"
2. Install it with these settings:
   - **Firestore collection:** `mail`
   - **SMTP connection URI:** Use the existing Google Workspace SMTP config (`notifications@harmonyhca.org` with App Password in Secret Manager)
   - **Default FROM address:** `notifications@harmonyhca.org`
   - **Cloud Function location:** `us-east1` (CRITICAL — must match Firestore region or triggers won't fire)

**If the extension is already installed** from earlier development, verify the region is `us-east1` and the SMTP credentials are valid.

### 1B: Write to Mail Collection on Certificate Issuance

**What to do:**

In the `generateCertificate` Cloud Function (or in the client-side code that triggers after certificate creation), add a Firestore write to the `mail` collection:

```typescript
await db.collection('mail').add({
  to: studentEmail,
  message: {
    subject: `Your Certificate for ${courseTitle} is Ready`,
    html: `
      <p>Congratulations ${studentName},</p>
      <p>You have successfully completed <strong>${courseTitle}</strong> 
         with a grade of <strong>${grade}%</strong>.</p>
      <p>Your certificate (ID: ${certId}) is ready for download.</p>
      <p><a href="${downloadUrl}">Download Your Certificate</a></p>
      <p>— Parrish Health Systems Training</p>
    `,
  },
});
```

**Important decisions for the email:**
- The `downloadUrl` should be a signed Firebase Storage URL with a long expiry (7 days minimum)
- Include the cert ID in the email for the student's records
- Do NOT include the PDF as an attachment — link to the download instead (avoids email size issues)

### 1C: Create an Audit Log Entry for Email Send

After writing to the `mail` collection:
```typescript
await createAuditLog({
  action: 'certificate_email_sent',
  userId: studentId,
  details: {
    certId,
    courseId,
    recipientEmail: studentEmail,
  },
});
```

This ensures the audit trail captures that the notification was sent — CMS surveyors can verify not just that a cert was issued but that the student was notified.

### 1D: Handle Email Failures Gracefully

The Trigger Email extension processes the `mail` document and updates it with delivery status. Add a field check:

- `delivery.state === 'SUCCESS'` — email sent
- `delivery.state === 'ERROR'` — email failed, `delivery.error` contains the reason

**Do NOT block certificate issuance on email delivery.** The cert should be created and stored regardless of whether the email sends. Email is a notification, not a gate.

**Verification:**
- [ ] Firebase Trigger Email extension installed in `us-east1`
- [ ] Certificate issuance creates a document in the `mail` collection
- [ ] Email arrives at the student's email address with correct name, course, grade, and cert ID
- [ ] Download link in the email works (signed URL resolves to the PDF)
- [ ] Audit log entry created for the email send
- [ ] Certificate still creates successfully if email fails (email doesn't gate cert)
- [ ] No TypeScript errors, build passes clean

---

## Step 2: Skill-Gap Dashboard

**Why this is second:** It's the highest-value admin feature in Phase 4 — the view that answers "where are my team's competency gaps?" This is what a nursing director opens on Monday morning to see who's behind on training.

**Estimated Time:** 4–5 days

### 2A: Define the Dashboard Data Model

The dashboard aggregates from existing collections — no new Firestore collections needed.

**Data sources:**
- `enrollments` — completion status per user per course
- `course_grades` — final grades per user per course
- `certificates` — cert issuance records with expiry tracking
- `users` — staff profiles (name, role, department, license expiry)
- `courses` — course metadata (title, CE credits, required vs. optional)

**Computed metrics (calculated client-side from Firestore queries):**

| Metric | Source | Calculation |
|---|---|---|
| Completion rate by staff | `enrollments` where `status === 'completed'` / total enrollments per user | Percentage |
| Overdue training | `enrollments` where `status !== 'completed'` AND course has `availableUntil` in the past | Count per user |
| Expiring certifications | `certificates` where expiry date is within 30/60/90 days | Count + list |
| Pass/fail rate by course | `course_grades` grouped by courseId | Pass count / total count per course |
| Pass/fail rate by module | `enrollments` + grade data grouped by moduleId | Per-module breakdown |
| Average score by course | `course_grades` grouped by courseId | Mean of `finalGrade` |
| Staff with no activity | `users` LEFT JOIN `enrollments` — users with zero enrollments | Count + list |

### 2B: Create the Dashboard Page

**Create `src/pages/SkillGapDashboard.tsx`:**

Layout (top to bottom):

1. **Summary cards row (4 cards):**
   - Total staff count with completion percentage
   - Overdue training count (red if > 0)
   - Expiring certs in next 30 days (amber if > 0)
   - Average pass rate across all courses

2. **Staff compliance table:**
   - One row per staff member
   - Columns: Name, Department, Courses Completed (X/Y), Overdue Count, Cert Status, Last Activity
   - Sortable by any column
   - Color-code rows: green (fully compliant), amber (some overdue), red (critical gaps)
   - Click a row → expand to show per-course detail for that staff member

3. **Course performance section:**
   - One card per course
   - Shows: enrollment count, completion rate, average score, pass/fail ratio
   - Highlight courses with pass rate below 70% (may indicate content issues, not staff issues)

4. **Expiring certifications timeline:**
   - List of certs expiring in the next 90 days
   - Grouped by 30-day windows: expiring this month, next month, 60–90 days
   - Each entry: staff name, course, cert ID, expiry date
   - Click → navigate to the staff member's profile or cert detail

### 2C: Add Filtering and Date Range

**Filters at the top of the dashboard:**
- Department dropdown (populated from `users` collection)
- Date range picker (defaults to "last 90 days")
- Status filter: All / Compliant / At Risk / Non-Compliant

**Filter logic:**
- Filters apply to all sections simultaneously
- URL query params store filter state (shareable links)
- Default view on page load: all departments, last 90 days, all statuses

### 2D: Add Route and Sidebar Link

- Add `/skill-gap` route in `App.tsx` (admin only)
- Add sidebar link: "Skill Gap" under the admin section, with a Lucide icon (e.g., `BarChart3` or `Activity`)
- Gate with role check: only visible to admin users

### 2E: Performance Considerations

The dashboard queries multiple collections and aggregates client-side. For Parrish's current scale (~12–50 users), this is fine. If scale increases significantly:
- Consider pre-computing aggregates in a Cloud Function triggered on grade/enrollment changes
- Store computed metrics in a `dashboard_metrics` collection
- For now, client-side aggregation is the simpler approach and keeps the complexity budget low

**Do NOT pre-optimize.** Build the client-side version first. Add server-side aggregation only if load times exceed 3 seconds with real data.

**Verification:**
- [ ] `/skill-gap` route exists, accessible to admins only
- [ ] Summary cards show correct counts (verify against Firebase Console data)
- [ ] Staff compliance table lists all staff with correct completion counts
- [ ] Rows color-coded by compliance status
- [ ] Click a staff row → expands to show per-course detail
- [ ] Course performance cards show correct pass/fail ratios
- [ ] Expiring certifications section lists certs within 90-day window
- [ ] Department filter narrows all sections correctly
- [ ] Date range filter adjusts data correctly
- [ ] Page load time under 3 seconds with current data volume
- [ ] Page load tracking fires (`usePageLoadTracking('skill_gap_dashboard')`)
- [ ] Non-admin users cannot access the page

---

## Step 3: CMS Audit Report Export

**Why this is third:** The skill-gap dashboard shows data on screen. This step makes it exportable — the physical document a CMS surveyor takes away from an audit. Both formats (PDF and CSV) are in scope per the scoping decision.

**Estimated Time:** 4–5 days

### 3A: Define Report Types

Three report types, each available in both PDF and CSV:

**Report 1: Staff Training Completion**
- One row per staff member per course
- Columns: Staff Name, Department, Course Title, Enrollment Date, Completion Date, Status, Final Grade, Certificate ID
- Sorted by: Staff Name → Course Title
- Includes a summary header: total staff, total completions, overall completion rate

**Report 2: Certification Registry**
- One row per issued certificate
- Columns: Cert ID, Staff Name, Course Title, Issue Date, Expiry Date, Grade, CE Credits, PDF Download Link
- Sorted by: Issue Date (newest first)
- Includes summary: total certs issued, total CE credits awarded

**Report 3: Grade & Assessment History**
- One row per graded assessment
- Columns: Staff Name, Course Title, Module Title, Quiz Score, Pass/Fail, Graded By (auto or instructor name), Grade Date, Attempts
- Sorted by: Grade Date (newest first)
- For instructor-graded items, includes the instructor who approved/rejected

### 3B: Build the CSV Export Utility

**Create `src/utils/exportCsv.ts`:**

```typescript
export function exportToCsv(filename: string, headers: string[], rows: string[][]): void {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
```

**Important:** All cell values must be quoted and escaped (double-quote any internal quotes). Staff names and course titles may contain commas.

### 3C: Build the PDF Report Generator

**Install:**
```bash
npm install jspdf jspdf-autotable
```

**Create `src/utils/exportPdf.ts`:**

Build a branded PDF report with:
- Parrish HALO logo in the header
- Report title, date generated, date range covered
- Summary statistics section
- Data table (using jspdf-autotable for formatted tables)
- Footer with page numbers and "Generated by Parrish HALO" watermark

**Brand compliance:**
- Use the Parrish HALO palette from the rebrand
- Font: match the app font as closely as jsPDF supports (default to Helvetica if Inter is not available)
- Logo: load from the brand assets already in the project

### 3D: Create the Reports Page

**Create `src/pages/Reports.tsx`:**

Layout:

1. **Report selector:** Three cards, one per report type, with description and icon
2. **Configuration panel** (appears after selecting a report type):
   - Date range picker (default: last 12 months)
   - Department filter (optional)
   - Format toggle: PDF / CSV / Both
3. **Preview section:** Show first 10 rows of the report data before export
4. **Export button:** "Download PDF" / "Download CSV" / "Download Both"
5. **Toast on export:** `toast.success('Report downloaded')`

### 3E: Add Route and Sidebar Link

- Add `/reports` route in `App.tsx` (admin and instructor roles)
- Add sidebar link: "Reports" with Lucide `FileText` icon
- Instructors see only courses they teach; admins see everything

### 3F: Scheduled Report Delivery (Optional Enhancement)

If desired, add an option to schedule weekly/monthly report emails:
- Admin configures: report type, frequency (weekly/monthly), recipient emails
- Cloud Function runs on schedule, generates the report, writes to `mail` collection
- Uses the same Trigger Email extension from Step 1

**This is optional.** The core deliverable is the manual download from the Reports page. Scheduled delivery can be added later without changing the report generation logic.

**Verification:**
- [ ] `/reports` route exists, accessible to admins and instructors
- [ ] Staff Training Completion report generates correctly in both PDF and CSV
- [ ] Certification Registry report generates correctly in both PDF and CSV
- [ ] Grade & Assessment History report generates correctly in both PDF and CSV
- [ ] PDF includes Parrish HALO branding (logo, colors, footer)
- [ ] CSV opens correctly in Excel with no column misalignment
- [ ] Date range filter narrows report data correctly
- [ ] Department filter narrows report data correctly
- [ ] Instructors see only their courses in reports
- [ ] Preview shows first 10 rows before downloading
- [ ] Toast confirms download
- [ ] Report data matches what Firebase Console shows (spot-check 3–5 records)

---

## Step 4: E-Signature System

**Why this is fourth:** E-signatures add a new capability layer — legally binding policy acknowledgments. It depends on the audit trail infrastructure (already solid), the user management system (already solid), and the reporting system (Step 3) for signature audit exports.

**Estimated Time:** 1–2 weeks

### 4A: Define the E-Signature Data Model

**Create types in the types file:**

```typescript
interface PolicyDocument {
  id: string;
  title: string;
  content: string;           // Rich text (HTML) of the policy
  version: string;           // e.g., "2.1" — new version requires re-signing
  effectiveDate: Timestamp;
  createdBy: string;
  createdAt: Timestamp;
  requiresSignature: boolean;
  assignedRoles: string[];   // which roles must sign: ['staff', 'instructor']
}

interface PolicySignature {
  id: string;
  policyId: string;
  policyVersion: string;     // version at time of signing
  userId: string;
  signedAt: Timestamp;
  signatureData: string;     // base64 canvas data or typed name
  signatureMethod: 'drawn' | 'typed';
  ipAddress: string;         // captured for legal validity
  userAgent: string;         // captured for legal validity
  documentHash: string;      // SHA-256 of the policy content at time of signing
}
```

**Why `documentHash`:** If the policy content changes after signing, the hash proves what version the person actually signed. This is the legally defensible element — a signature without proof of what was signed is worthless.

**Why `policyVersion`:** When a policy is updated, all existing signatures remain valid for the old version. Staff are required to re-sign only the new version. The system tracks which version each person signed.

### 4B: Create the Signature Capture Component

**Create `src/components/SignatureCapture.tsx`:**

Two signature methods:

1. **Drawn signature (canvas-based):**
   - HTML Canvas element for freehand drawing
   - Touch support for tablet/phone use
   - Clear button to reset
   - Exports as base64 PNG data
   - Minimum stroke requirement (prevent accidental taps from counting as signatures)

2. **Typed signature:**
   - Text input with a signature-style cursive font (use a Google Font like `Dancing Script` or `Great Vibes`)
   - Preview renders the typed name in the signature font
   - Exports the styled text as the signature

**Both methods require:**
- A checkbox: "I have read and understand this policy in its entirety"
- The checkbox must be checked before the "Sign" button is enabled
- Timestamp captured at moment of signing (not form submission time)

### 4C: Policy Management Page (Admin)

**Create `src/pages/PolicyManagement.tsx`:**

**Admin capabilities:**
1. **Create policy:** Title, rich text content (use TipTap — already in the project), version number, effective date, assigned roles
2. **Edit policy:** Creates a new version (old version is immutable once any signatures exist)
3. **View signature status:** For each policy, show which staff have signed and which haven't
4. **Send reminders:** Trigger a reminder email to unsigned staff (writes to `mail` collection)

**Policy list view:**
- Table: Title, Version, Effective Date, Signed (X/Y staff), Status
- Click → view policy detail with signature status breakdown

### 4D: Policy Signing Flow (Staff/Instructor)

**Create `src/pages/PolicyCenter.tsx`:**

**Staff view:**
1. List of policies assigned to their role
2. Status per policy: Signed (with date) / Unsigned / New Version Available
3. Click an unsigned policy → full policy text renders with scroll tracking
4. After scrolling to bottom (or after a minimum read time of 30 seconds), the signature area activates
5. Staff draws or types signature → checkbox → "Sign Policy" button
6. On submission:
   - Compute SHA-256 hash of the policy content
   - Capture IP address (from a lightweight API or pass from server)
   - Capture user agent string
   - Create `PolicySignature` document in Firestore
   - Create audit log entry
   - Show toast: `toast.success('Policy signed and recorded')`

**Minimum read time rationale:** CMS auditors may question whether staff actually read the policy. A 30-second minimum (or scroll-to-bottom requirement) provides evidence of engagement, not just a rubber stamp.

### 4E: Signature Verification

**Add to the Reports page (Step 3):**

**Report 4: Policy Signature Audit**
- One row per required signature (staff × policy)
- Columns: Staff Name, Policy Title, Version, Required Date, Signed Date, Signature Method, Status
- Status: Signed / Unsigned / Expired Version (signed old version, new version available)
- Available in both PDF and CSV
- PDF version includes a summary: total required signatures, completion rate, non-compliant staff list

### 4F: Dashboard Integration

**Add to the Skill-Gap Dashboard (Step 2):**
- New summary card: "Policy Compliance" — X/Y required signatures completed
- Add a "Policy Compliance" section below the existing sections
- List staff with unsigned policies, grouped by policy

### 4G: Firestore Security Rules

**Add rules for the new collections:**

```
match /policies/{policyId} {
  allow read: if request.auth != null;
  allow write: if request.auth.token.role == 'admin';
}

match /policy_signatures/{signatureId} {
  allow read: if request.auth != null && (
    request.auth.token.role in ['admin', 'instructor'] ||
    resource.data.userId == request.auth.uid
  );
  allow create: if request.auth != null && 
    request.data.userId == request.auth.uid;
  // Signatures are immutable — no update or delete
  allow update, delete: if false;
}
```

**Key rules:**
- Only admins can create/edit policies
- Anyone authenticated can read policies (they need to see what they're signing)
- Users can only create signatures for themselves (`request.data.userId == request.auth.uid`)
- Signatures cannot be updated or deleted (immutable — this is the legal defensibility layer)
- Admins and instructors can read all signatures (for reporting)

### 4H: Routes and Navigation

- Add `/policies` route (admin — policy management)
- Add `/policy-center` route (all roles — signing interface)
- Add sidebar links: "Policies" (admin section), "Policy Center" (all roles section)

**Verification:**
- [ ] Admin can create a policy with rich text content and assign to roles
- [ ] Staff see unsigned policies in Policy Center
- [ ] Scroll-to-bottom (or 30s timer) gates the signature area
- [ ] Drawn signature captures freehand input on canvas (test on desktop + tablet if available)
- [ ] Typed signature renders in cursive font
- [ ] Checkbox required before signing is enabled
- [ ] Signature document created in Firestore with: hash, IP, user agent, timestamp
- [ ] Audit log entry created for the signature
- [ ] Signature documents are immutable (cannot be updated or deleted — test in Firebase Console)
- [ ] Admin view shows signed/unsigned breakdown per policy
- [ ] Updating a policy creates a new version; old signatures remain valid for old version
- [ ] Staff with old-version signatures see "New Version Available" status
- [ ] Policy Signature Audit report generates in PDF and CSV
- [ ] Skill-Gap Dashboard shows policy compliance summary card
- [ ] Firestore security rules pass: staff can't sign for others, signatures can't be deleted
- [ ] Toast confirms signature: "Policy signed and recorded"

---

## Step 5: Field Stress Testing Protocol

**Why this is last:** Test the complete system (all Phase 1–4 features) under realistic clinical conditions. This is a testing step, not a feature — it may surface performance fixes that need to be applied.

**Estimated Time:** 2–3 days

### 5A: Define Test Environments

**Network conditions to simulate:**

| Profile | Down (Mbps) | Up (Mbps) | Latency (ms) | Represents |
|---|---|---|---|---|
| Clinical WiFi | 5 | 2 | 80 | Typical facility shared WiFi |
| Poor WiFi | 1.5 | 0.5 | 200 | Congested facility network |
| Mobile LTE | 10 | 5 | 50 | Nurse on phone between floors |
| Offline → Online | 0 → 5 | 0 → 2 | — | WiFi dropout and reconnect |

**How to simulate:** Chrome DevTools → Network tab → Throttling dropdown → "Add custom profile" with the values above. For offline testing, toggle the "Offline" checkbox.

**Device viewports to test:**

| Device | Width | Height | Test Method |
|---|---|---|---|
| iPad (landscape) | 1024px | 768px | Chrome DevTools responsive mode |
| iPad (portrait) | 768px | 1024px | Chrome DevTools responsive mode |
| iPhone 14 | 390px | 844px | Chrome DevTools responsive mode |
| Desktop (small) | 1280px | 720px | Browser window resize |
| Desktop (large) | 1920px | 1080px | Full screen |

### 5B: Define Test Scenarios

Run each scenario under each network profile. Record pass/fail and load times.

**Scenario 1: Student training flow**
1. Login
2. Browse course catalog
3. Enroll in a course
4. Open CoursePlayer, navigate through 3 modules
5. Complete a quiz (multiple choice + short answer)
6. View grade on Dashboard
7. Download certificate from MyGrades

**Pass criteria:** All steps complete without errors. No step takes longer than 10 seconds on Clinical WiFi or 20 seconds on Poor WiFi. No data loss (answers persist via auto-save).

**Scenario 2: Instructor grading flow**
1. Login as instructor
2. Open Grade Management
3. Review a submission (open modal, read answers)
4. Approve with score override
5. Open a second submission, reject with reason
6. View CourseRoster to confirm grade updates

**Pass criteria:** All steps complete. Review modal loads within 5 seconds. Toast feedback appears on every action.

**Scenario 3: Admin reporting flow**
1. Login as admin
2. Open Skill-Gap Dashboard — all sections load
3. Filter by department
4. Navigate to Reports
5. Generate Staff Training Completion report (PDF + CSV)
6. Navigate to Policy Management
7. View signature status for a policy

**Pass criteria:** Dashboard loads within 5 seconds on Clinical WiFi. Report generation completes within 10 seconds. PDF renders correctly.

**Scenario 4: Offline resilience**
1. Start a quiz in CoursePlayer
2. Answer 3 questions
3. Toggle network to Offline
4. Answer 2 more questions
5. Observe: auto-save should fail gracefully (no crash, no error modal)
6. Toggle network back to Online
7. Observe: auto-save should resume and persist draft answers
8. Submit quiz

**Pass criteria:** No data loss. No unhandled errors. Auto-save resumes on reconnect. Quiz submission succeeds after reconnect.

### 5C: Create the Test Report Template

**Create `docs/FIELD_TEST_REPORT.md`:**

```markdown
# Parrish HALO Field Stress Test Report
Date: [date]
Tester: [name]
Browser: [browser + version]

## Results Matrix

| Scenario | Clinical WiFi | Poor WiFi | Mobile LTE | Offline→Online |
|---|---|---|---|---|
| Student flow | PASS/FAIL (Xs) | ... | ... | ... |
| Instructor flow | PASS/FAIL (Xs) | ... | ... | ... |
| Admin flow | PASS/FAIL (Xs) | ... | ... | ... |
| Offline resilience | N/A | N/A | N/A | PASS/FAIL |

## Viewport Results

| Scenario | iPad landscape | iPad portrait | iPhone 14 | Desktop |
|---|---|---|---|---|
| Student flow | PASS/FAIL | ... | ... | ... |
| Instructor flow | PASS/FAIL | ... | ... | ... |
| Admin flow | PASS/FAIL | ... | ... | ... |

## Issues Found
1. [Description] — Severity: [HIGH/MEDIUM/LOW] — Page: [page name]
2. ...

## Performance Notes
- Slowest page load: [page] at [X]ms on [profile]
- Largest payload: [page] at [X]KB
- ...
```

### 5D: Execute Tests and Document Results

Run all 4 scenarios across all network profiles and viewport sizes. Fill in the test report. For any failures:

1. Document the exact failure (screenshot if possible)
2. Classify severity: HIGH (blocks usage), MEDIUM (degraded but usable), LOW (cosmetic)
3. Identify root cause if obvious
4. Create a follow-up fix task

### 5E: Apply Critical Fixes

For any HIGH-severity issues found during testing:
- Fix immediately before closing Phase 4
- Re-run the specific failing scenario to confirm the fix

For MEDIUM and LOW issues:
- Document in the test report
- Create follow-up tasks (these can be addressed post-Phase 4)

**Common fixes you may encounter:**
- **Slow page loads:** Add loading skeletons, lazy-load heavy components, reduce Firestore query scope
- **Viewport issues:** Fix overflow on mobile, ensure tables are horizontally scrollable, check modal sizing on small screens
- **Offline failures:** Add error boundary around Firestore writes, show "You're offline" banner, queue failed writes for retry

**Verification:**
- [ ] Test report template committed to `docs/FIELD_TEST_REPORT.md`
- [ ] All 4 scenarios tested on all 4 network profiles
- [ ] All 4 scenarios tested on all 5 viewport sizes
- [ ] Results matrix filled in with pass/fail and load times
- [ ] All HIGH-severity issues fixed and re-tested
- [ ] MEDIUM/LOW issues documented with follow-up tasks
- [ ] No scenario crashes or loses data on any profile
- [ ] Auto-save resilience confirmed on offline → online transition

---

## File Scope Summary

### Files Created (New)
- `src/pages/SkillGapDashboard.tsx`
- `src/pages/Reports.tsx`
- `src/pages/PolicyManagement.tsx`
- `src/pages/PolicyCenter.tsx`
- `src/components/SignatureCapture.tsx`
- `src/utils/exportCsv.ts`
- `src/utils/exportPdf.ts`
- `docs/FIELD_TEST_REPORT.md`

### Files Modified
- `src/App.tsx` — new routes (/skill-gap, /reports, /policies, /policy-center) + sidebar links
- `firestore.rules` — policy and policy_signature collection rules
- `functions/src/index.ts` — cert email notification (if added to the Cloud Function rather than client-side)
- `functions/src/types.ts` — PolicyDocument, PolicySignature types
- `src/pages/GradeManagement.tsx` — cert email trigger point (if client-side)
- `package.json` — jspdf, jspdf-autotable dependencies

### Files That Must NOT Be Touched
- `src/hooks/useModuleProgress.ts` — Guide 11 auto-save, stable
- `src/contexts/ToastContext.tsx` — Phase 3 toast system, stable
- `src/components/ErrorBoundary.tsx` — Ops hardening, stable
- `src/lib/sentry.ts` — Ops hardening, stable
- `src/lib/analytics.ts` — Ops hardening, stable (add new events here, don't restructure)
- Existing Cloud Functions (except for cert email addition)
- Audit trail logging logic

---

## Quick Reference: Dependency Chain

```
Step 1 (Cert email notifications)
  └→ Step 2 (Skill-gap dashboard)
       └→ Step 3 (CMS audit report export)
            └→ Step 4 (E-signature system)
                 ├→ Adds Report 4 to Step 3
                 └→ Adds policy card to Step 2
                      └→ Step 5 (Field stress testing — tests everything)
                           └→ PHASE 4 COMPLETE
```

**Step 1 is independent** and can start immediately.
**Steps 2 and 3 are lightly coupled** — the dashboard shows data, the reports export it. Build the dashboard first so the report data queries can reuse the same aggregation logic.
**Step 4 integrates back into Steps 2 and 3** — the policy compliance card in the dashboard and the signature audit report. This is why it comes after them.
**Step 5 tests the complete system** — it must be last.

---

## Post-Phase 4 Posture

When all 5 steps are verified, Parrish HALO has:

- **Full reporting suite:** Skill-gap dashboard + 4 exportable report types (PDF + CSV)
- **Policy compliance:** Custom e-signature system with legal defensibility (hashed content, immutable signatures)
- **Automated notifications:** Certificate emails on issuance
- **Field-validated:** Tested under realistic clinical network and device conditions
- **CMS audit-ready:** Every compliance data point is queryable, exportable, and backed by an immutable audit trail

The system is complete for internal Parrish deployment. Future considerations (not in scope):
- Mobile app (Capacitor) — deferred by scoping decision
- Multi-tenant external org onboarding — gated by ADR-001, not yet planned
- Advanced analytics (trend lines, predictive gaps) — Phase 5 candidate

---

*Parrish HALO · Parrish Health Systems · Resilient Engineering Manifesto*
*Plan generated April 28, 2026*
