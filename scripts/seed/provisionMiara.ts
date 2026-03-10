/**
 * Provision User — Miara Carpenter
 *
 * Sets JWT custom claims and creates/updates Firestore user profile
 * for an existing Firebase Auth account. Idempotent: safe to re-run.
 *
 * Prerequisites:
 *   - Miara's account already exists in Firebase Auth (miarac@parrishhealthsystems.org)
 *   - service-account.json in project root (or GOOGLE_APPLICATION_CREDENTIALS set)
 *
 * Usage:
 *   npx tsx scripts/seed/provisionMiara.ts
 */

import admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ── ESM-compatible __dirname ──────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Firebase Admin Init (mirrors initAdmin from seedAll.ts) ──
function initAdmin(): void {
  if (admin.apps.length > 0) return;

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const localPath = path.resolve(__dirname, '../../service-account.json');

  if (envPath && fs.existsSync(envPath)) {
    admin.initializeApp({ credential: admin.credential.cert(envPath) });
    console.log(`Firebase Admin initialized (credentials: ${envPath})`);
  } else if (fs.existsSync(localPath)) {
    admin.initializeApp({ credential: admin.credential.cert(localPath) });
    console.log('Firebase Admin initialized (credentials: service-account.json)');
  } else {
    admin.initializeApp();
    console.log('Firebase Admin initialized (application default credentials)');
  }
}

// ── User to provision ─────────────────────────────
const USER = {
  email: 'miarac@parrishhealthsystems.org',
  displayName: 'Miara Carpenter',
  role: 'instructor' as const,
  department: 'Centennial Office',
  jobTitle: 'Clinical Office Assistant',
};

async function provision() {
  initAdmin();

  const authClient = admin.auth();
  const db = admin.firestore();

  // 1. Look up existing Auth account by email
  console.log(`\nLooking up ${USER.email}...`);
  let uid: string;

  try {
    const userRecord = await authClient.getUserByEmail(USER.email);
    uid = userRecord.uid;
    console.log(`  Found: ${uid}`);
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') {
      console.error(`\n  ERROR: No Firebase Auth account found for ${USER.email}`);
      console.error('  Create the account in Firebase Console first, then re-run this script.');
      process.exit(1);
    }
    throw err;
  }

  // 2. Set JWT custom claims (source of truth for security rules)
  console.log(`  Setting JWT claims: role="${USER.role}"`);
  await authClient.setCustomUserClaims(uid, { role: USER.role });

  // 3. Create/update Firestore user profile
  console.log('  Writing Firestore profile...');
  await db.collection('users').doc(uid).set(
    {
      uid,
      displayName: USER.displayName,
      email: USER.email,
      role: USER.role,
      department: USER.department,
      jobTitle: USER.jobTitle,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true } // Won't overwrite createdAt on re-run thanks to merge
  );

  // 4. Write audit log entry
  console.log('  Writing audit log...');
  await db.collection('audit_logs').add({
    action: 'USER_PROVISIONED',
    performedBy: 'system-script',
    performedByName: 'Provision Script',
    targetId: uid,
    details: `Provisioned ${USER.displayName} (${USER.email}) as ${USER.role}`,
    metadata: { role: USER.role, email: USER.email },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('\n✅ Done! Miara Carpenter is ready to log in.');
  console.log(`   Email: ${USER.email}`);
  console.log(`   Role:  ${USER.role}`);
  console.log(`   UID:   ${uid}`);
  console.log('\n   She may need to sign out and back in if already logged in');
  console.log('   (JWT claims refresh on next token refresh or re-auth).\n');
}

provision()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nProvisioning failed:', err);
    process.exit(1);
  });
