# Parrish HALO Operational Hardening Execution Plan

**CI/CD · Monitoring · Backups · Testing**
Parrish HALO (formerly HHCALMS) · Parrish Health Systems
April 27, 2026

---

## How to Use This Document

This is a sequenced execution plan designed for use with Claude Code against the Parrish HALO Firebase codebase. Same format that drove Phase 2 (Steps 1–7) and Phase 3 (Steps 1–11) to verified completion.

Each step is independently verifiable. Complete the step, run the verification, confirm passing, then proceed.

Unlike Phase 2 and Phase 3, these steps have **minimal interdependencies** — most can run in parallel or in any order. The sequencing below is optimized for risk reduction: the items that protect you from data loss and silent failures come first.

**Estimated total: ~1–2 weeks**

---

## Current Baseline

- **Phase 1: 100%** · **Phase 2: 100%** · **Phase 3: 100%** · Phase 4: 0%
- Deployed to Firebase Hosting, rebranded to Parrish HALO
- ADR-001 locked (single-org, orgId field model)
- CE Credit Vault shipped with `generateCertificate` Cloud Function
- 7 Cloud Functions live (original 6 + generateCertificate)
- 31/31 Firestore security rule tests passing
- 0 TypeScript errors, clean Vite build
- **No CI/CD pipeline** — all deploys are manual
- **No error monitoring** — issues surface via user complaints
- **No Firestore backup policy** — compliance records are unprotected
- **No integration/component tests** — only Firestore rule tests exist

---

## Step 1: Firestore Scheduled Backups

**Why this is first:** You have real nurse training records, grades, certificates, and audit logs in production Firestore. If data is lost or corrupted, there is no recovery path. This is a compliance liability. Fix it before anything else.

**Estimated Time:** 2–4 hours

### 1A: Create a GCS Backup Bucket

**What to do:**

1. Create a Cloud Storage bucket for backups:
   ```bash
   gsutil mb -l us-east1 gs://parrish-halo-firestore-backups
   ```
   - Region must match Firestore: `us-east1`
   - Use Standard storage class (backups are accessed infrequently but must be available)

2. Set a lifecycle policy to manage retention:
   ```bash
   cat > /tmp/lifecycle.json << 'EOF'
   {
     "rule": [
       {
         "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
         "condition": {"age": 30}
       },
       {
         "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
         "condition": {"age": 90}
       },
       {
         "action": {"type": "Delete"},
         "condition": {"age": 365}
       }
     ]
   }
   EOF
   gsutil lifecycle set /tmp/lifecycle.json gs://parrish-halo-firestore-backups
   ```
   - 0–30 days: Standard (immediate access)
   - 30–90 days: Nearline (lower cost, slight retrieval delay)
   - 90–365 days: Coldline (archival)
   - After 365 days: deleted (adjust if compliance requires longer retention)

### 1B: Run a Manual Backup to Verify

**What to do:**

```bash
gcloud firestore export gs://parrish-halo-firestore-backups/manual-$(date +%Y%m%d-%H%M%S) \
  --project=parrish-harmonyhca
```

Wait for completion (usually 1–5 minutes depending on data volume), then verify:

```bash
gsutil ls gs://parrish-halo-firestore-backups/
```

Confirm the export directory exists with metadata files inside it.

### 1C: Schedule Automated Daily Backups

**What to do:**

Create a Cloud Scheduler job that triggers a Firestore export daily at 2:00 AM EST:

```bash
gcloud scheduler jobs create http firestore-daily-backup \
  --schedule="0 2 * * *" \
  --time-zone="America/New_York" \
  --uri="https://firestore.googleapis.com/v1/projects/parrish-harmonyhca/databases/(default)/exportDocuments" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{"outputUriPrefix":"gs://parrish-halo-firestore-backups/daily"}' \
  --oauth-service-account-email="parrish-harmonyhca@appspot.gserviceaccount.com" \
  --project=parrish-harmonyhca \
  --location=us-east1
```

**Important:** The service account needs the `roles/datastore.importExportAdmin` and `roles/storage.admin` roles:

```bash
gcloud projects add-iam-policy-binding parrish-harmonyhca \
  --member="serviceAccount:parrish-harmonyhca@appspot.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"

gcloud projects add-iam-policy-binding parrish-harmonyhca \
  --member="serviceAccount:parrish-harmonyhca@appspot.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### 1D: Document the Restore Procedure

Create `docs/BACKUP_AND_RESTORE.md` in the project with:

1. How to list available backups:
   ```bash
   gsutil ls gs://parrish-halo-firestore-backups/daily/
   ```

2. How to restore from a backup:
   ```bash
   gcloud firestore import gs://parrish-halo-firestore-backups/daily/{backup-folder} \
     --project=parrish-harmonyhca
   ```
   **Warning:** Import overwrites existing data for matching documents. It does NOT delete documents that don't exist in the backup.

3. Retention policy summary (30d Standard → 90d Nearline → 365d Coldline → delete)

**Verification:**
- [ ] Backup bucket exists: `gsutil ls gs://parrish-halo-firestore-backups/`
- [ ] Manual backup completed successfully with data inside
- [ ] Lifecycle policy set: `gsutil lifecycle get gs://parrish-halo-firestore-backups/`
- [ ] Cloud Scheduler job visible in GCP Console → Cloud Scheduler
- [ ] `docs/BACKUP_AND_RESTORE.md` committed to repo
- [ ] Service account has correct IAM roles for export

---

## Step 2: CI/CD Pipeline via GitHub Actions

**Why this is second:** Every deploy is manual, which means no audit trail of what was deployed when, and human error risk on every release. This also weakens the CMS audit narrative — automated, traceable deployments are part of the compliance story.

**Estimated Time:** 4–6 hours

### 2A: Generate Firebase CI Token

**What to do:**

```bash
firebase login:ci
```

This opens a browser for authentication and outputs a token. Copy it — you'll add it as a GitHub secret.

### 2B: Add GitHub Secrets

In GitHub → repo → Settings → Secrets and Variables → Actions, add:

| Secret Name | Value |
|---|---|
| `FIREBASE_TOKEN` | The token from Step 2A |
| `FIREBASE_PROJECT_ID` | `parrish-harmonyhca` |

### 2C: Create the Workflow File

**Create `.github/workflows/deploy.yml`:**

```yaml
name: Build & Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Lint
        run: npm run lint
        continue-on-error: false

      - name: Run tests
        run: npm test -- --passWithNoTests
        continue-on-error: false

      - name: Build
        run: npm run build

      - name: Deploy to Firebase Hosting
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_TOKEN }}
          projectId: ${{ secrets.FIREBASE_PROJECT_ID }}
          channelId: live
```

**Note:** If the repo doesn't have a lint script yet, add one to `package.json`:
```json
{
  "scripts": {
    "lint": "eslint src/ --ext .ts,.tsx --max-warnings 0"
  }
}
```

If ESLint is not configured, use a minimal config or skip the lint step initially by setting `continue-on-error: true` and adding ESLint setup as a follow-up task.

### 2D: Create a Preview Workflow for PRs (Optional but Recommended)

**Create `.github/workflows/preview.yml`:**

```yaml
name: Preview Deploy

on:
  pull_request:
    branches: [main]

jobs:
  preview:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Build
        run: npm run build

      - name: Deploy Preview
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_TOKEN }}
          projectId: ${{ secrets.FIREBASE_PROJECT_ID }}
```

This deploys to a preview URL on every PR — lets you verify changes before merging to main.

### 2E: Test the Pipeline

**What to do:**

1. Commit the workflow files and push to `main`
2. Open GitHub → repo → Actions tab
3. Watch the workflow execute
4. Confirm each step passes: checkout → install → type check → lint → test → build → deploy
5. Verify the production URL loads the latest version after deploy completes

**If the deploy step fails:**
- Check that `FIREBASE_TOKEN` secret is set correctly
- Check that the Firebase project ID matches
- Check that `firebase.json` has `"hosting": { "public": "dist" }`
- The `FirebaseExtended/action-hosting-deploy` action may need a service account JSON instead of a CI token — check the action's README for current auth requirements

**Verification:**
- [ ] `.github/workflows/deploy.yml` committed to repo
- [ ] Push to `main` triggers the workflow in GitHub Actions
- [ ] Type check step passes (0 TypeScript errors)
- [ ] Build step passes (Vite outputs to dist/)
- [ ] Deploy step succeeds (Firebase Hosting updated)
- [ ] Production URL shows the newly deployed version
- [ ] GitHub Actions tab shows green check on the workflow run

---

## Step 3: Error Monitoring

**Why this is third:** With backups protecting your data and CI/CD automating deploys, the next gap is visibility. Right now, if a Cloud Function throws an error or the React app crashes for a nurse, you find out when someone complains. Monitoring closes that loop.

**Estimated Time:** 4–6 hours

### Decision: Sentry vs. Firebase Crashlytics

**Recommendation: Sentry (free tier)**

Rationale:
- Parrish HALO is a web app first — Crashlytics is mobile-focused and has limited web support
- Sentry's free tier covers 5,000 errors/month (more than sufficient for this user base)
- Sentry has better source map support for Vite builds
- If you add Capacitor mobile later, Sentry supports that too

### 3A: Set Up Sentry Project

**What to do:**

1. Create a Sentry account at `sentry.io` (free tier)
2. Create a new project: Platform → React, name → `parrish-halo`
3. Copy the DSN (Data Source Name) — you'll need it for the SDK

### 3B: Install and Configure Sentry SDK

**Install:**
```bash
npm install @sentry/react
```

**Create `src/lib/sentry.ts`:**
```typescript
import * as Sentry from '@sentry/react';

export function initSentry() {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
      ],
      tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
      replaysOnErrorSampleRate: 0.5, // 50% of errors get session replay
    });
  }
}
```

**Add to `.env`:**
```
VITE_SENTRY_DSN=https://your-dsn@sentry.io/your-project-id
```

**Initialize in `src/main.tsx`:**
```typescript
import { initSentry } from './lib/sentry';

initSentry();

// ... existing React render
```

### 3C: Add React Error Boundary

**Create `src/components/ErrorBoundary.tsx`:**
```typescript
import * as Sentry from '@sentry/react';

const SentryErrorBoundary = Sentry.withErrorBoundary;

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="flex flex-col items-center justify-center min-h-screen p-8">
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-4">
            This error has been automatically reported. Please try refreshing the page.
          </p>
          <button
            onClick={resetError}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Try Again
          </button>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
```

**Wrap the app in `src/App.tsx`:**
```typescript
import { AppErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <AppErrorBoundary>
      <ToastProvider>
        {/* ... existing app content */}
      </ToastProvider>
    </AppErrorBoundary>
  );
}
```

### 3D: Add Source Maps to Build

Update `vite.config.ts` to upload source maps to Sentry in production builds:

```bash
npm install @sentry/vite-plugin
```

Add to `vite.config.ts`:
```typescript
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  build: {
    sourcemap: true, // Required for Sentry
  },
  plugins: [
    // ... existing plugins
    sentryVitePlugin({
      org: 'your-sentry-org',
      project: 'parrish-halo',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
```

**Add to GitHub Secrets:**
| Secret Name | Value |
|---|---|
| `SENTRY_AUTH_TOKEN` | Generate at sentry.io → Settings → Auth Tokens |

**Add to the CI/CD workflow (Step 2C) build step:**
```yaml
      - name: Build
        run: npm run build
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
```

### 3E: Cloud Function Error Alerting

Cloud Functions already log errors to Cloud Logging. Set up an alert:

1. Go to GCP Console → Monitoring → Alerting
2. Create a new alert policy:
   - Condition: Log-based metric → `resource.type="cloud_function"` AND `severity>=ERROR`
   - Threshold: any occurrence (count > 0) in a 5-minute window
   - Notification channel: your email
3. Name the policy: "HALO Cloud Function Errors"

This catches `generateCertificate` failures, grade calculation errors, and audit trail issues without adding any code.

**Verification:**
- [ ] Sentry project created and DSN configured in `.env`
- [ ] `@sentry/react` installed and initialized (only in production mode)
- [ ] Error boundary renders fallback UI on React crash
- [ ] Trigger a test error → appears in Sentry dashboard within 30 seconds
- [ ] Source maps uploaded → Sentry shows readable stack traces (not minified)
- [ ] GCP alert policy created for Cloud Function errors
- [ ] Build still passes clean with sourcemap generation enabled

---

## Step 4: Usage Telemetry & Performance Baselines

**Why this is fourth:** With monitoring catching errors, the next gap is understanding normal behavior. Without baselines, you can't distinguish "the app is slow today" from "the app has always been this slow." Telemetry also feeds the Phase 4 skill-gap dashboard.

**Estimated Time:** 1–2 days

### Decision: Firebase Analytics vs. Custom Events

**Recommendation: Firebase Analytics (free, already in the SDK)**

Rationale:
- Firebase Analytics is included in the Firebase JS SDK you're already using
- Zero additional cost
- Auto-tracks page views, sessions, user engagement
- Custom events for HALO-specific metrics layer on top
- Data flows to BigQuery if you ever need advanced reporting

### 4A: Enable Firebase Analytics

**Install (if not already present):**
```bash
npm install firebase/analytics
```

**Add to your Firebase initialization file (likely `src/lib/firebase.ts`):**
```typescript
import { getAnalytics, logEvent } from 'firebase/analytics';

const analytics = getAnalytics(app);
export { analytics, logEvent };
```

### 4B: Define HALO-Specific Events

**Create `src/lib/analytics.ts`:**
```typescript
import { analytics, logEvent } from './firebase';

export const trackEvent = {
  // Learning events
  courseEnrolled: (courseId: string, courseTitle: string) =>
    logEvent(analytics, 'course_enrolled', { course_id: courseId, course_title: courseTitle }),

  moduleStarted: (moduleId: string, courseId: string) =>
    logEvent(analytics, 'module_started', { module_id: moduleId, course_id: courseId }),

  moduleCompleted: (moduleId: string, courseId: string, timeSpentSeconds: number) =>
    logEvent(analytics, 'module_completed', {
      module_id: moduleId,
      course_id: courseId,
      time_spent_seconds: timeSpentSeconds,
    }),

  quizSubmitted: (moduleId: string, score: number, needsReview: boolean) =>
    logEvent(analytics, 'quiz_submitted', {
      module_id: moduleId,
      score,
      needs_review: needsReview,
    }),

  courseCompleted: (courseId: string, finalGrade: number) =>
    logEvent(analytics, 'course_completed', { course_id: courseId, final_grade: finalGrade }),

  // Certification events
  certificateIssued: (courseId: string, certId: string) =>
    logEvent(analytics, 'certificate_issued', { course_id: courseId, cert_id: certId }),

  certificateDownloaded: (certId: string) =>
    logEvent(analytics, 'certificate_downloaded', { cert_id: certId }),

  // Instructor events
  gradeApproved: (courseId: string) =>
    logEvent(analytics, 'grade_approved', { course_id: courseId }),

  gradeRejected: (courseId: string) =>
    logEvent(analytics, 'grade_rejected', { course_id: courseId }),

  // Performance markers
  pageLoad: (pageName: string, loadTimeMs: number) =>
    logEvent(analytics, 'page_load', { page_name: pageName, load_time_ms: loadTimeMs }),
};
```

### 4C: Instrument Key User Journeys

Add `trackEvent` calls at the critical points in the user journey. These are lightweight — a single function call at each location.

**Files to add tracking calls:**

| File | Event | Where |
|---|---|---|
| `CourseCatalog.tsx` | `courseEnrolled` | After successful enrollment |
| `CoursePlayer.tsx` | `moduleStarted` | On module load |
| `CoursePlayer.tsx` | `moduleCompleted` | After module completion |
| `CoursePlayer.tsx` | `quizSubmitted` | After quiz submission |
| `Dashboard.tsx` | `courseCompleted` | When course grade is finalized |
| `MyGrades.tsx` | `certificateDownloaded` | On cert download click |
| `GradeManagement.tsx` | `gradeApproved` / `gradeRejected` | After approve/reject action |

**Important:** Analytics calls should never block the user flow. Wrap in try-catch and fail silently:
```typescript
try { trackEvent.quizSubmitted(moduleId, score, needsReview); } catch {}
```

### 4D: Add Page Load Performance Tracking

**Create `src/hooks/usePageLoadTracking.ts`:**
```typescript
import { useEffect } from 'react';
import { trackEvent } from '../lib/analytics';

export function usePageLoadTracking(pageName: string) {
  useEffect(() => {
    const startTime = performance.now();
    
    // Track after the component is fully rendered
    requestAnimationFrame(() => {
      const loadTime = Math.round(performance.now() - startTime);
      try { trackEvent.pageLoad(pageName, loadTime); } catch {}
    });
  }, [pageName]);
}
```

Add to each major page component:
```typescript
function Dashboard() {
  usePageLoadTracking('dashboard');
  // ... existing code
}
```

**Pages to instrument:** Dashboard, CourseCatalog, CoursePlayer, MyGrades, GradeManagement, CourseManager, UserManagement

### 4E: Verify Analytics Are Flowing

**What to do:**

1. Enable Analytics debug mode in the browser:
   - Add `?debug_mode=true` to the URL, or
   - Set `VITE_ANALYTICS_DEBUG=true` and check for it in analytics init

2. Open Firebase Console → Analytics → DebugView
3. Navigate through the app — events should appear in real-time in DebugView
4. After 24 hours, check Analytics → Events for aggregated data

**Verification:**
- [ ] Firebase Analytics initialized (only in production/debug mode)
- [ ] Custom events defined in `src/lib/analytics.ts`
- [ ] `courseEnrolled`, `quizSubmitted`, `courseCompleted` fire at correct moments
- [ ] `certificateDownloaded` fires on cert download
- [ ] `gradeApproved` / `gradeRejected` fire for instructor actions
- [ ] Page load times tracked for all 7 major pages
- [ ] Events visible in Firebase Console → Analytics → DebugView
- [ ] Analytics calls fail silently — never block user actions
- [ ] Build passes clean, no TypeScript errors

---

## Step 5: Integration & Component Test Suite

**Why this is last:** Tests are highest-value after the system is stable and the CI/CD pipeline can run them automatically. Writing tests before CI/CD means they only run when someone remembers to run them.

**Estimated Time:** 1–2 weeks (can be done incrementally)

### Decision: Scope

**Recommendation: Critical paths only (not comprehensive)**

Rationale:
- You're a solo developer — comprehensive test coverage has a maintenance cost that must be weighed against feature development time
- Focus tests on the paths where a silent regression causes the most damage: grading, enrollment status transitions, and certificate generation
- These are the paths a CMS auditor would care about

### 5A: Test Infrastructure Setup

**Verify Jest is configured correctly:**
- `jest.config.cjs` exists (ESM fix already applied)
- Add React Testing Library if not present:
  ```bash
  npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
  ```

**Create test utilities file `src/test/setup.ts`:**
```typescript
import '@testing-library/jest-dom';

// Mock Firebase
jest.mock('./lib/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  analytics: {},
}));

// Mock analytics (never track in tests)
jest.mock('./lib/analytics', () => ({
  trackEvent: new Proxy({}, { get: () => () => {} }),
}));
```

### 5B: Grading Logic Tests (Highest Priority)

**Create `src/utils/__tests__/grading.test.ts`:**

Test each of the 6 quiz question types:
- Multiple choice: correct answer → full points, incorrect → 0
- True/false: correct → full points, incorrect → 0
- Fill-in-blank: case-insensitive match → full points, no match → 0
- Matching: per-pair scoring, all correct → full points
- Short answer: always returns `needsReview: true`
- **Multiple answer: exact set match → full points, partial/incorrect → 0 (all-or-nothing)**

Test weighted grade calculation:
- Module weights sum correctly
- Final course grade calculation matches Cloud Function 6 logic
- Edge cases: 0% score, 100% score, single-module course

### 5C: Enrollment State Machine Tests

**Create `src/services/__tests__/enrollment.test.ts`:**

Test the enrollment status transitions:
- `enrolled` → `in_progress` (on first module start)
- `in_progress` → `needs_review` (on short-answer quiz submission)
- `in_progress` → `completed` (on auto-graded quiz completion when all modules done)
- `needs_review` → `completed` (on instructor approval)
- `needs_review` → `in_progress` (on instructor rejection)
- `completed` → should NOT transition back to any other state

### 5D: Certificate Generation Tests

**Create `src/services/__tests__/certificate.test.ts`:**

Test the cert metadata creation:
- Cert ID format matches `PHS-{YYYYMMDD}-{4hex}` pattern
- All required fields present: userId, courseId, certId, issuedAt, grade, ceCredits
- PDF storage path follows `certificates/{orgId}/{userId}/{courseId}/{certId}.pdf` pattern

### 5E: Component Smoke Tests (Lower Priority)

**Create tests for critical UI components:**
- `Dashboard.test.tsx` — renders enrollment cards, shows grade summary
- `CoursePlayer.test.tsx` — renders quiz questions, captures answers
- `GradeManagement.test.tsx` — renders review queue, approve/reject buttons

These are smoke tests (renders without crashing + key elements present), not full interaction tests. Keep them lightweight.

### 5F: Wire Tests into CI/CD

Update the GitHub Actions workflow (Step 2C) test step:
```yaml
      - name: Run tests
        run: npm test -- --coverage --passWithNoTests
```

Add a coverage threshold to `jest.config.cjs` (optional):
```javascript
module.exports = {
  coverageThreshold: {
    'src/utils/grading*': {
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
```

This enforces coverage only on the grading utility — the most critical code path — without requiring coverage on the entire codebase.

**Verification:**
- [ ] Jest + React Testing Library configured and running
- [ ] All 6 quiz type grading tests pass
- [ ] Weighted grade calculation tests pass
- [ ] Enrollment state machine tests cover all valid transitions
- [ ] Certificate metadata tests verify ID format and required fields
- [ ] Component smoke tests render without crashing
- [ ] `npm test` passes in CI/CD pipeline (GitHub Actions)
- [ ] Test failures block deploy (the CI/CD step fails on test errors)

---

## File Scope Summary

### Files Created (New)
- `.github/workflows/deploy.yml`
- `.github/workflows/preview.yml` (optional)
- `docs/BACKUP_AND_RESTORE.md`
- `src/lib/sentry.ts`
- `src/lib/analytics.ts`
- `src/components/ErrorBoundary.tsx`
- `src/hooks/usePageLoadTracking.ts`
- `src/test/setup.ts`
- `src/utils/__tests__/grading.test.ts`
- `src/services/__tests__/enrollment.test.ts`
- `src/services/__tests__/certificate.test.ts`
- Component smoke test files

### Files Modified
- `src/main.tsx` — Sentry initialization
- `src/App.tsx` — ErrorBoundary wrapper
- `src/lib/firebase.ts` — Analytics initialization
- `vite.config.ts` — source maps + Sentry plugin
- `package.json` — lint script, test dependencies
- `.env` — Sentry DSN, Analytics debug flag
- `jest.config.cjs` — coverage thresholds
- `src/pages/CourseCatalog.tsx` — analytics event
- `src/pages/CoursePlayer.tsx` — analytics events
- `src/pages/Dashboard.tsx` — analytics event + page load tracking
- `src/pages/MyGrades.tsx` — analytics event + page load tracking
- `src/pages/GradeManagement.tsx` — analytics events + page load tracking
- `src/pages/CourseManager.tsx` — page load tracking
- `src/pages/UserManagement.tsx` — page load tracking

### Files That Must NOT Be Touched
- Cloud Functions (`functions/src/index.ts`) — stable, do not modify
- Firestore security rules — no changes needed
- `src/hooks/useModuleProgress.ts` — Guide 11 auto-save, don't risk regression
- `src/contexts/ToastContext.tsx` — Phase 3 toast system, stable
- Audit trail logging logic
- Certificate generation logic (already shipped and working)

---

## Quick Reference: Dependency Chain

```
Step 1 (Firestore backups)     ← No dependencies, protects data immediately
Step 2 (CI/CD pipeline)        ← No dependencies, but Step 5 tests run here
Step 3 (Error monitoring)      ← Build step needs CI/CD for source maps (Step 2)
Step 4 (Usage telemetry)       ← No dependencies
Step 5 (Test suite)            ← Needs CI/CD to run automatically (Step 2)
```

**Steps 1, 2, and 4 are fully independent** — they can run in any order or in parallel.
**Step 3** benefits from Step 2 being done first (source map upload in CI), but can be set up standalone.
**Step 5** should come after Step 2 so tests run in the pipeline automatically.

---

## Post-Completion Posture

When all 5 steps are verified, Parrish HALO has:

- **Data protection:** Daily automated Firestore backups with 365-day retention
- **Deployment automation:** Push to main → type check → lint → test → build → deploy
- **Error visibility:** Sentry catches React crashes + GCP alerts catch Cloud Function errors
- **Usage intelligence:** Firebase Analytics tracking all critical user journeys + page load performance
- **Regression safety:** Grading logic, enrollment state machine, and cert generation covered by tests that block bad deploys

This is the operational foundation that makes Phase 4 feature development safer — every new feature ships through the pipeline, is monitored for errors, and is backed up automatically.

---

*Parrish HALO · Parrish Health Systems · Resilient Engineering Manifesto*
*Plan generated April 27, 2026*
