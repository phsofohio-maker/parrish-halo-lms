# HHCALMS Guide 14: Nurse Onboarding Hardening

**Execution Brief for Claude Code**
**April 30, 2026 · Parrish Health Systems**

| 2 Tracks | 7 Files | 1 New Cloud Function | Estimated 2–3 Days |
|:---:|:---:|:---:|:---:|

---

## Diagnostic Overview

Two gaps block reliable nurse onboarding:

**Gap 1 — Email deliverability uncertainty.** The invitation pipeline writes to the Firestore `mail` collection, which the Firebase Trigger Email extension picks up and sends via Google Workspace SMTP (`notifications@harmonyhca.org`). Delivery to personal Gmail addresses is unverified. If SPF/DKIM/DMARC records are misconfigured on `harmonyhca.org`, emails may silently land in spam or be dropped.

**Gap 2 — No fallback onboarding path.** The only way to create a fully functional account (Firebase Auth + JWT custom claims + Firestore profile) is through the invitation pipeline. If the email doesn't land, the nurse is stuck.

> **ARCHITECTURAL PRINCIPLE:** This guide adds a second onboarding path without modifying the existing invitation pipeline. The invitation flow remains the preferred path. Direct creation is the reliable fallback. Both paths produce identical account structures.

---

## Dependency Chain

Track A (email diagnostic) and Track B (direct creation) are independent and can execute in parallel.

| # | Fix | What It Does | Severity | Estimate | Depends On |
|---|-----|-------------|----------|----------|------------|
| A1 | Mail audit | Inspect mail collection docs for `delivery.state` failures | HIGH | 15 min | None |
| A2 | DNS check | Verify SPF, DKIM, DMARC on harmonyhca.org | HIGH | 15 min | A1 |
| A3 | Live send test | Send test invitation to personal Gmail, verify inbox delivery | HIGH | 15 min | A2 |
| A4 | Remediation | Fix DNS records or document known-failure domains | MEDIUM | 30 min | A3 |
| **B4** | **Types + audit** | **New AuditActionType, User.requiresPasswordChange field** | **FOUNDATION** | **30 min** | **None** |
| **B1** | **Cloud Function** | **createDirectAccount callable — Auth + claims + profile + audit** | **CRITICAL** | **2–3 hrs** | **B4** |
| **B2** | **UI modal** | **CreateAccountModal in UserManagement.tsx** | **CRITICAL** | **2–3 hrs** | **B1** |
| **B3** | **Password gate** | **First-login password change interstitial + AuthContext check** | **HIGH** | **2–3 hrs** | **B2** |
| V1 | E2E verify | Both onboarding paths tested end-to-end | CRITICAL | 1 hr | A4 + B3 |

**Execution order for Track B:** B4 → B1 → B2 → B3

---

## Track A — Email Deliverability Diagnostic

This track does not produce code changes. It produces a diagnostic finding.

### Step A1: Mail Collection Audit

Open the Firestore console and inspect documents in the `mail` collection. Check:

- `delivery.state` — should be `"SUCCESS"`. If `"ERROR"`, check `delivery.error`.
- `delivery.attempts` — multiple attempts suggest transient SMTP failures.
- `delivery.endTime` — confirms the extension processed the document.
- `delivery.info.accepted` vs `delivery.info.rejected` — SMTP-level accept/reject arrays.

> **KEY DISTINCTION:** `delivery.state: "SUCCESS"` means the extension handed the email to SMTP. It does NOT mean the email reached the inbox. Gmail spam filtering happens after SMTP acceptance.

### Step A2: DNS Verification

```bash
dig TXT harmonyhca.org | grep "v=spf1"
dig TXT google._domainkey.harmonyhca.org
dig TXT _dmarc.harmonyhca.org
```

- **SPF:** Must include `include:_spf.google.com`
- **DKIM:** Must have a public key record
- **DMARC:** Must start with `v=DMARC1`. If missing, create: `v=DMARC1; p=none; rua=mailto:dmarc-reports@harmonyhca.org`

### Step A3: Live Send Test

From the deployed app (not localhost), dispatch a test invitation to a personal Gmail. Verify:
1. Email arrives in inbox (not spam)
2. Gmail "Show original" shows SPF=PASS, DKIM=PASS, DMARC=PASS
3. Accept invitation link works

### Step A4: Remediation

Fix any missing/incorrect DNS records. Allow 24–48 hours for propagation, then re-test.

---

## Track B — In-App Direct Account Creation

### Fix B4: Types and Audit Action (Foundation)

**File:** `functions/src/types.ts`

Add to `AuditActionType` union:
```typescript
| "ACCOUNT_DIRECT_CREATE"
| "PASSWORD_CHANGE_FORCED"
```

Add to `User` interface:
```typescript
requiresPasswordChange?: boolean;
```

This field defaults to `undefined` (falsy) for all existing users.

---

### Fix B1: createDirectAccount Cloud Function

**File:** `functions/src/index.ts`

**Contract:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | Email address for the new account |
| displayName | string | Yes | Full name. Minimum 2 characters |
| role | UserRoleType | Yes | One of: admin, instructor, staff, content_author |
| department | string | No | Department assignment |
| temporaryPassword | string | Yes | Admin-generated password. Minimum 8 characters |

**Security gate:**
```typescript
if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
if (request.auth.token.role !== "admin") throw new HttpsError("permission-denied", "Only admins can create accounts.");
```

**Operations (in sequence):**
1. Validate all inputs (email format, name length, password length, valid role)
2. Create Firebase Auth account: `admin.auth().createUser({ email, password: temporaryPassword, displayName })`
3. Set JWT custom claims: `admin.auth().setCustomUserClaims(uid, { role })`
4. Create Firestore user profile:
```typescript
await db.collection("users").doc(userRecord.uid).set(stripUndefined({
  uid: userRecord.uid,
  displayName: displayName.trim(),
  email,
  role,
  department: department || null,
  requiresPasswordChange: true,
  createdAt: admin.firestore.Timestamp.now(),
  createdVia: "admin_direct",
  createdBy: request.auth.uid,
}));
```
5. Create audit log entry: `actionType: "ACCOUNT_DIRECT_CREATE"`
6. Return `{ success: true, uid, email, role }`

**Error handling:** Same pattern as `createInvitedUser`. Catch `auth/email-already-exists` → descriptive HttpsError.

> **CRITICAL:** Call `stripUndefined` on all Firestore payloads before writing.

---

### Fix B2: CreateAccountModal in UserManagement

**File:** `src/pages/UserManagement.tsx`

**Modification:** Add a "Create Account" button next to the existing "Add Staff Member" button. Existing button navigates to Invitations (email path). New button opens a modal (direct path).

**Modal form fields:**
- Email — text input, required
- Full Name — text input, required, min 2 chars
- Role — select dropdown: Staff (default), Instructor, Admin, Content Author
- Department — text input, optional
- Temporary Password — auto-generated, read-only with Copy and Regenerate buttons

**Password generation:**
```typescript
const generateTempPassword = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  return Array.from(array, b => chars[b % chars.length]).join("");
};
```

Ambiguous characters (0/O, 1/l/I) excluded to reduce transcription errors.

**On submit:**
1. Call `createDirectAccount` via `httpsCallable`
2. Success → show credentials in modal (email + password, prominent display, "Copy Credentials" button)
3. Fire toast: `"[Name] account created as [role]"`
4. Refresh user list via `fetchData()`
5. Error → display error inline in modal (do not close)

---

### Fix B3: First-Login Password Change Gate

**Part 1: AuthContext.tsx modification**

In `onAuthStateChanged`, after profile fetch, check `profile.requiresPasswordChange`. Add to AuthState:
```typescript
requiresPasswordChange: boolean; // defaults to false
```

Set it:
```typescript
const needsChange = profile.requiresPasswordChange === true;
setState({
  ...existingState,
  requiresPasswordChange: needsChange,
});
```

**Part 2: ForcePasswordChange.tsx (new page)**

**File:** `src/pages/ForcePasswordChange.tsx`

- Harmony Health branding (logo, emerald accent)
- Message: "Welcome to Harmony Health LMS. Please set a permanent password to continue."
- Fields: New Password, Confirm Password (min 8 chars, must match)
- On submit:
  1. Call Firebase Auth `updatePassword(user, newPassword)`
  2. Update Firestore profile: `requiresPasswordChange: false`
  3. Create audit log: `actionType: "PASSWORD_CHANGE_FORCED"`
  4. Update AuthContext state, redirect to Dashboard

**Part 3: App.tsx routing**

In the main render logic, after `isAuthenticated` check, before sidebar layout:
```typescript
if (auth.requiresPasswordChange) {
  return <ForcePasswordChange />;
}
```

This intercepts ALL navigation until password is changed.

> **SECURITY:** `updatePassword()` requires recent authentication. Since this page only appears after first login, the session is fresh. If Firebase throws `auth/requires-recent-login`, display a sign-out/sign-in message.

---

## Files In Scope

| Action | File | Changes |
|--------|------|---------|
| MODIFY | `functions/src/index.ts` | + `createDirectAccount` callable function |
| MODIFY | `functions/src/types.ts` | + `ACCOUNT_DIRECT_CREATE`, `PASSWORD_CHANGE_FORCED` audit types; + `requiresPasswordChange` on User |
| MODIFY | `src/pages/UserManagement.tsx` | + Create Account button + CreateAccountModal component |
| MODIFY | `src/contexts/AuthContext.tsx` | + `requiresPasswordChange` state field + profile check |
| CREATE | `src/pages/ForcePasswordChange.tsx` | New interstitial page for forced password change |
| MODIFY | `src/App.tsx` | + ForcePasswordChange route guard before sidebar layout |
| VERIFY | `firestore.rules` | Confirm `users` collection allows admin create |

## Out of Scope (Do Not Touch)

- Existing Cloud Functions: `onGradeCreate`, `onGradeUpdate`, `onEnrollmentUpdate`, `onProgressUpdate`, `onRemediationUpdate`, `calculateCourseGrade`, `createInvitedUser`, `validateInvitationToken`, `setUserRole`
- Invitation pipeline: `invitationService.ts`, `Invitations.tsx`, `AcceptInvite.tsx`
- Course Builder, Module Builder, Course Player, Grade Management
- `auditService.ts` (client-side — the server-side `createAuditLog` helper is reused, not modified)
- Guide 11 auto-save work
- Firestore security rules (verify only)

---

## Ripple Effect Analysis

| Change | Affected Area | Risk |
|--------|--------------|------|
| New Cloud Function | functions deploy — all functions redeploy | LOW — additive |
| `User.requiresPasswordChange` | Every component reading user profile | NONE — optional field, undefined = false |
| AuthContext state change | All components consuming `useAuth()` | LOW — new field defaults false |
| App.tsx route guard | All authenticated page rendering | LOW — only triggers when true |
| UserManagement button | Page header layout | NONE — additive |

---

## Verification Checklist

### Track A
- [ ] Mail collection documents show `delivery.state` for each sent invitation
- [ ] `dig` commands return SPF, DKIM, DMARC records for harmonyhca.org
- [ ] Test invitation arrives in personal Gmail inbox (not spam); "Show Original" shows all PASS

### Track B
- [ ] Admin clicks "Create Account" → modal opens with auto-generated password
- [ ] Fill in email/name/role, click Create → success state shows credentials
- [ ] New user appears in UserManagement list with correct role badge
- [ ] New user logs in with temp password → ForcePasswordChange page (not Dashboard)
- [ ] User sets new password → redirected to Dashboard. Subsequent logins go directly to Dashboard
- [ ] Firestore profile shows `createdVia: "admin_direct"` and `requiresPasswordChange: false` after change
- [ ] Audit log contains `ACCOUNT_DIRECT_CREATE` and `PASSWORD_CHANGE_FORCED` entries
- [ ] Non-admin calling `createDirectAccount` → `permission-denied` error
- [ ] Existing email → descriptive error in modal (not crash)

### E2E (Both Paths)
- [ ] Path 1 (Invitation): invite → email → nurse clicks → creates account → Dashboard with correct role
- [ ] Path 2 (Direct): admin creates → hands credentials → nurse logs in → changes password → Dashboard with correct role
- [ ] Both paths produce identical Firestore profiles (only `createdVia` differs)

---

*Harmony Health LMS — Parrish Health Systems*
*Guide 14 Approved April 30, 2026*
