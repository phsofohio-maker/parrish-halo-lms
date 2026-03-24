

![][image1]

**HARMONY HEALTH LMS**

Auth, Onboarding & Security Diagnostic

Execution Brief for Claude Code

March 24, 2026

Prepared for Kobe | Parrish Health Systems

| 4 Issues Diagnosed  |  3 Severity Tiers  |  Estimated 1–2 Days Onboarding Pipeline  •  Password Reset  •  Audit Trail Access  •  setUserRole Security |
| :---: |

# **Diagnostic Overview**

This brief addresses four issues surfaced during post-email-verification testing. The invite email sends correctly, but the end-to-end onboarding pipeline has gaps that prevent a new user from completing account setup. Additionally, Reneesha's admin account cannot access the audit trail, and password reset functionality does not exist.

| Component | Status | Root Cause |
| :---- | ----- | :---- |
| **Invite Link Landing** | **BROKEN** | SPA route exists but link likely targets wrong origin or hosting not deployed |
| **Password Reset** | **MISSING** | No sendPasswordResetEmail wired; no UI on Login page |
| **Audit Trail (Reneesha)** | **AT RISK** | JWT custom claims likely missing or stale from seed method |
| **setUserRole Security** | **VULNERABILITY** | Admin-only guard is commented out; any authed user can escalate |

# **Issue 1: Invite Link Does Not Reach Accept Page**

## **What Exists (Already Built)**

The onboarding code infrastructure is substantially complete. All five deliverables from the Internal Deployment Sprint Phase 2 have been implemented:

* AcceptInvite.tsx page with token validation, form, and account creation flow

* createInvitedUser Cloud Function (server-side account creation with JWT claims)

* validateInvitationToken Cloud Function (public, no auth required)

* App.tsx routing: checks window.location.pathname \=== '/accept-invite' before auth gate

* invitationService.ts writes to Firestore /mail collection for email dispatch

## **Root Cause Analysis**

The invite email generates the accept URL as:

| const acceptUrl \= \`${window.location.origin}/accept-invite?token=${token}\`; |
| :---- |

This means the link's domain depends on where the admin was when they dispatched the invitation. There are three failure scenarios, and we need to determine which applies:

**Scenario A: App Running on localhost (Most Likely)**

If the admin dispatched the invitation while running the app via 'npm run dev' (localhost:5173), the email link points to http://localhost:5173/accept-invite?token=xxx. The recipient clicking this link from their email client will get a connection refused error because they are not running the dev server.

**Scenario B: Firebase Hosting Not Deployed or Stale**

If Firebase Hosting is deployed but the build is stale or pointing at the old placeholder, the SPA rewrite serves index.html but the JavaScript bundle may not include the AcceptInvite route yet.

**Scenario C: Hosting Deployed But Route Not Matching**

The App.tsx route check uses window.location.pathname which should work with the SPA rewrite rule in firebase.json. This is the least likely failure mode since the rewrite config exists and is correct.

| CRITICAL The link generation strategy of using window.location.origin is inherently fragile. It couples the invite URL to whatever environment the admin happened to be using. This must be replaced with a fixed production URL. |
| :---- |

## **Resolution Plan**

**Fix 1: Hardcode the Production Accept URL**

Replace the dynamic origin with the canonical production URL in invitationService.ts:

| // invitationService.ts — createInvitation() and resendInvitation()   // BEFORE (fragile — depends on admin's current browser): const acceptUrl \= \`${window.location.origin}/accept-invite?token=${token}\`;   // AFTER (stable — always points to production): const PRODUCTION\_URL \= import.meta.env.VITE\_APP\_URL || 'https://harmony-lms.web.app'; const acceptUrl \= \`${PRODUCTION\_URL}/accept-invite?token=${token}\`; |
| :---- |

Add VITE\_APP\_URL to the .env file so it can be overridden per environment without code changes.

**Fix 2: Ensure Firebase Hosting Is Current**

1. Run npm run build to produce the dist/ output with the latest AcceptInvite route.

2. Run firebase deploy \--only hosting to push the current build.

3. Visit https://harmony-lms.web.app/accept-invite?token=test to confirm the page loads (it should show 'Invalid Invitation' for a fake token, proving the route works).

**Fix 3: Verify the Full Onboarding Chain**

After fixes 1 and 2, walk through the complete flow:

1. Admin dispatches invitation from the Invitations page.

2. Check Firestore /invitations collection for the new document with token and pending status.

3. Check Firestore /mail collection for the email document.

4. Recipient opens email, clicks the link. AcceptInvite page loads with email pre-filled.

5. Recipient fills in name and password, submits. createInvitedUser Cloud Function fires.

6. Recipient clicks 'Continue to Login', logs in with their new credentials.

7. Confirm JWT custom claims match the assigned role (check browser console for role in token).

| NOTE The Trigger Email from Firestore extension must be installed and targeting us-east1 for emails to actually send. If the extension is not installed, the /mail documents exist in Firestore but no email is dispatched. Kobe confirmed email is now working, so this gate is cleared. |
| :---- |

## **Ripple Effect**

* invitationService.ts: Two locations to update (createInvitation and resendInvitation accept URLs)

* .env file: Add VITE\_APP\_URL variable

* No backend changes required — Cloud Functions, security rules, and AcceptInvite page are already correct

## **Files to Touch**

* src/services/invitationService.ts — Replace window.location.origin with env variable (2 locations)

* .env — Add VITE\_APP\_URL=https://harmony-lms.web.app

# **Issue 2: Password Reset Does Not Exist**

## **Root Cause**

There is no password reset functionality anywhere in the system. The Login page has no 'Forgot Password' link. The authService.ts file does not import or use Firebase's sendPasswordResetEmail API. No Cloud Function handles password reset. This is a complete gap, not a broken implementation.

| CRITICAL For a clinical training platform, password reset is not optional. Staff who forget their password currently have zero self-service recovery options. An admin would have to delete and recreate their account, losing all enrollment and grade history. |
| :---- |

## **Resolution Plan**

**Step 1: Add resetPassword to authService.ts**

| // authService.ts import { sendPasswordResetEmail } from 'firebase/auth';   export const resetPassword \= async (email: string): Promise\<void\> \=\> {   try {     await sendPasswordResetEmail(auth, email);   } catch (error) {     const authError \= error as AuthError;     throw mapAuthError(authError);   } }; |
| :---- |

**Step 2: Expose via AuthContext**

Add resetPassword to the AuthContextValue interface and the provider's value object. No state change needed since Firebase handles the email flow entirely.

**Step 3: Add 'Forgot Password?' UI to Login Page**

Add a link below the password field that toggles a 'Reset Password' form inline (email input \+ submit button). On submit, call resetPassword(email). Show a success message: 'If an account exists with this email, a password reset link has been sent.' This phrasing is intentional and avoids leaking whether an email is registered.

**Step 4: Configure Firebase Auth Email Templates**

Firebase Auth sends password reset emails from noreply@harmony-lms.firebaseapp.com by default. For brand consistency, configure the email template in the Firebase Console under Authentication \> Templates to use the Harmony Health branding and the notifications@harmonyhca.org sender address (requires verifying the domain in Firebase Auth settings).

## **Ripple Effect**

* authService.ts: Add one new exported function

* AuthContext.tsx: Add resetPassword to interface and provider value

* Login.tsx: Add forgot password toggle, form, and success/error states

* Firebase Console: Email template configuration (optional but recommended)

* No Firestore rules changes, no Cloud Functions changes

## **Files to Touch**

* src/services/authService.ts — Add resetPassword function

* src/contexts/AuthContext.tsx — Expose resetPassword in context

* src/pages/Login.tsx — Add forgot password UI flow

# **Issue 3: Reneesha Cannot View Audit Trail**

## **Root Cause Analysis**

The audit trail access requires passing two gates: a Firestore security rule and a client-side role check. Here is the exact logic for each:

**Gate 1: Firestore Security Rule**

| // firestore.rules match /audit\_logs/{logId} {   allow read: if isAdmin() || isInstructor(); }   // where isAdmin() checks: request.auth.token.role \== 'admin' |
| :---- |

**Gate 2: Client-Side Page Guard**

| // AuditLogs.tsx if (\!hasRole(\['admin'\])) {   return \<AccessDenied /\>; }   // hasRole uses state.role from AuthContext, // which derives from JWT custom claims first, // falling back to Firestore profile.role |
| :---- |

Reneesha's account was created via a seed script in a Claude Code session. The diagnosis depends on exactly how the seeding was performed:

**Most Likely Cause: JWT Custom Claims Not Set or Stale**

If Reneesha was added to Firebase Auth via the Console (or via createUserWithEmailAndPassword on the client), her Auth record exists but has no custom claims. Without claims, request.auth.token.role is undefined, which means:

* Firestore rule isAdmin() returns false → query is rejected with 'Missing or insufficient permissions'

* AuthContext falls back to Firestore profile role, so the UI may show admin pages in the sidebar

* But every Firestore read from those pages fails because security rules check the token, not the profile

This is the exact same pattern that occurred with Miara's initial setup on March 10: Firebase Auth account existed, but JWT custom claims were never set.

| WARNING JWT custom claims are the single source of truth for authorization. The Firestore user profile role is for display only. If the two are out of sync, the UI will show pages the user cannot actually access. This creates a confusing experience where the app appears to work but every data query fails silently. |
| :---- |

## **Resolution Plan**

**Step 1: Verify Reneesha's Current State**

Run a diagnostic script to check both her Auth claims and Firestore profile:

| // Run via: npx tsx scripts/diagnose-user.ts reneesha@parrishhealthsystems.org   import admin from 'firebase-admin';   const email \= process.argv\[2\]; const user \= await admin.auth().getUserByEmail(email);   console.log('UID:', user.uid); console.log('Custom Claims:', user.customClaims); // Expected: { role: 'admin' } // If missing/wrong, that's the root cause.   const profile \= await admin.firestore().collection('users').doc(user.uid).get(); console.log('Firestore Profile:', profile.data()); |
| :---- |

**Step 2: Set/Fix JWT Custom Claims**

If claims are missing or incorrect, set them via the Admin SDK:

| await admin.auth().setCustomUserClaims(user.uid, { role: 'admin' }); |
| :---- |

**Step 3: Ensure Firestore Profile Matches**

If the Firestore profile is missing or has a wrong role, update it:

| await admin.firestore().collection('users').doc(user.uid).set(   { role: 'admin', updatedAt: admin.firestore.FieldValue.serverTimestamp() },   { merge: true } ); |
| :---- |

**Step 4: Reneesha Must Sign Out and Back In**

JWT custom claims are baked into the auth token at sign-in time. After updating claims, the old token is stale. Reneesha must sign out completely and sign back in so the AuthContext fetches a fresh token with the correct role claim. The AuthContext does call getIdTokenResult(true) which forces a refresh, but a full sign-out/sign-in is the most reliable path.

## **Secondary Finding: AuditLogs.tsx Restricts to Admin Only**

The Firestore rule allows both admin AND instructor to read audit logs, but the AuditLogs.tsx page guard only checks for admin:

| // Current (admin only): if (\!hasRole(\['admin'\])) { return \<AccessDenied /\>; }   // Should match Firestore rule (admin \+ instructor): if (\!hasRole(\['admin', 'instructor'\])) { return \<AccessDenied /\>; } |
| :---- |

This mismatch means instructors can technically read audit logs via direct Firestore queries but not through the UI. This should be a conscious design decision. If instructors should see the audit trail, update the page guard. If they should not, tighten the Firestore rule to isAdmin() only.

## **Files to Touch**

* scripts/diagnose-user.ts — New diagnostic script (reusable for future user issues)

* Firebase Admin SDK command to set custom claims (one-time fix)

* src/pages/AuditLogs.tsx — Optionally align page guard with Firestore rule

# **Issue 4: setUserRole Admin Guard Disabled**

## **Root Cause**

The setUserRole Cloud Function in functions/src/index.ts has its admin-only check commented out for bootstrap mode:

| // BOOTSTRAP MODE: For the very first admin setup, comment out // the admin check below. After your first admin is set, uncomment it. // // if (request.auth.token.role \!== 'admin') { //   throw new HttpsError('permission-denied', 'Only admins can set roles.'); // } |
| :---- |

| CRITICAL Any authenticated user can currently call setUserRole and escalate themselves to admin. This is a privilege escalation vulnerability. Since Miara and other admin accounts now exist, the bootstrap phase is over and this guard must be re-enabled immediately. |
| :---- |

## **Resolution Plan**

Uncomment the admin check. This is a one-line change:

| // functions/src/index.ts — setUserRole   // Remove the comment markers: if (request.auth.token.role \!== 'admin') {   throw new HttpsError('permission-denied', 'Only admins can set roles.'); } |
| :---- |

After uncommenting, redeploy Cloud Functions:

| firebase deploy \--only functions |
| :---- |

## **Ripple Effect**

* After this change, only users with admin JWT claims can call setUserRole

* The seed script (seedUsers.ts) uses the Admin SDK directly, not this Cloud Function, so seeding is unaffected

* Ensure at least one admin account's JWT claims are confirmed working before deploying this change

## **Files to Touch**

* functions/src/index.ts — Uncomment the admin guard in setUserRole (1 line change)

# **Execution Sequence**

Issues are ordered by severity and dependency. Each fix is independently verifiable before proceeding to the next.

| \# | Fix | What It Does | Estimate | Verify By |
| :---- | :---- | :---- | :---- | :---- |
| **1** | Reneesha's JWT Claims | Sets admin claims, unblocks audit trail | 15 min | Reneesha signs out/in, opens Audit Logs |
| **2** | setUserRole Guard | Closes privilege escalation vulnerability | 10 min | Non-admin calls setUserRole, gets 'permission-denied' |
| **3** | Hardcode Accept URL | Invite links work from any environment | 20 min | Dispatch invite, click link from email |
| **4** | Deploy Hosting | Ensures AcceptInvite route is live | 15 min | Visit /accept-invite?token=test on prod URL |
| **5** | Password Reset | Adds forgot password flow to Login | 1–2 hrs | Click 'Forgot Password', receive email, reset works |
| **6** | E2E Onboarding Test | Proves the full pipeline | 30 min | New user: invite → email → setup → login → correct role |

# **Out of Scope (Do Not Touch)**

The following files and systems are stable and must not be modified during this sprint:

* Cloud Functions: onGradeCreate, onGradeUpdate, onEnrollmentUpdate, onProgressUpdate, onRemediationUpdate, calculateCourseGrade

* Firestore security rules (except the optional AuditLogs guard alignment)

* Course Builder, Module Builder, Course Player, Grade Management

* Enrollment, progress, and grade services

* React component library (Button, etc.)

* Firebase Storage rules

# **Direct Answers to Your Questions**

## **1\. How does a person pick their username and password after getting the invite link?**

The infrastructure is fully built. When a user clicks the invite link, the AcceptInvite page validates their token via the validateInvitationToken Cloud Function, pre-fills their email (read-only), and presents a form for their full name and password. On submit, the createInvitedUser Cloud Function creates their Firebase Auth account, sets JWT custom claims with their assigned role, creates their Firestore user profile, marks the invitation as accepted, and writes an audit log entry. The user then clicks 'Continue to Login' and signs in with the credentials they just set.

The username is their email (assigned by the admin during invitation). They cannot change it. They choose only their display name and password. The only thing broken is the link URL pointing to the wrong origin — the page itself and all backend logic works.

## **2\. Does password reset work?**

**No.** Password reset is completely absent from the system. There is no 'Forgot Password' link on the Login page, no sendPasswordResetEmail call in authService.ts, and no UI flow for it. This must be built. Firebase Auth provides the sendPasswordResetEmail API which handles the entire flow (sends email with reset link, validates token, lets user set new password). Implementation is straightforward and estimated at 1–2 hours.

## **3\. Are the authentication/security features working as intended?**

Mostly yes, with two notable exceptions:

**Working correctly:** Firebase Auth login/logout, JWT custom claims as the authorization source of truth, Firestore security rules enforcing role-based access, fail-closed default deny, immutable audit logs (no updates or deletes), grade score bounds validation (0–100), enrollment ownership enforcement, createInvitedUser setting claims server-side, the AuthContext refreshing tokens on login.

**Not working:** The setUserRole Cloud Function's admin guard is commented out, meaning any authenticated user can escalate their role to admin. This is a privilege escalation vulnerability that must be closed immediately (Issue 4). Additionally, accounts created outside the seed script or invitation pipeline (like Reneesha's, created via Firebase Console) may not have JWT custom claims, creating a mismatch where the UI shows admin pages but Firestore rejects every query.

**Design concern:** The AuditLogs.tsx page guard restricts access to admin-only, but the Firestore rule allows both admin and instructor reads. This inconsistency should be resolved deliberately — either tighten the Firestore rule or relax the page guard.

[image1]: <data:image/png;base64,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>