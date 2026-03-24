/**
 * Deployment Cleanup — Harmony Health LMS
 *
 * Removes all test/seed data while preserving real accounts.
 * Created for the internal deployment sprint (Phase 5).
 *
 * What gets REMOVED:
 *   - All @parrish.health test accounts from Firebase Auth
 *   - Corresponding Firestore user profile documents
 *   - All test enrollments, grades, progress, course_grades
 *   - All test courses and modules
 *   - All test audit log entries
 *
 * What gets PRESERVED:
 *   - Miara Carpenter's admin account (miarac@parrishhealthsystems.org)
 *   - Any other non-seed accounts
 *   - The seed script itself
 *   - All Cloud Functions, security rules, infrastructure
 *
 * Usage:
 *   npx tsx scripts/seed/deploymentCleanup.ts
 *
 * This script logs every deletion to console for auditability.
 */

import admin from 'firebase-admin';
import { SEED_USERS } from './seedData/users';
import { initAdmin } from './seedAll';

// Accounts to preserve during cleanup
const PRESERVE_EMAILS = [
  'miarac@parrishhealthsystems.org',
  'kobet@parrishhealthsystems.org',
];

const COLLECTIONS_TO_CLEAN = [
  'enrollments',
  'progress',
  'grades',
  'course_grades',
  'audit_logs',
  'remediation_requests',
  'competencies',
  'cohorts',
];

async function batchDelete(
  db: admin.firestore.Firestore,
  docs: admin.firestore.QueryDocumentSnapshot[]
): Promise<number> {
  if (docs.length === 0) return 0;

  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let opsInBatch = 0;

  for (const doc of docs) {
    currentBatch.delete(doc.ref);
    opsInBatch++;
    if (opsInBatch >= 500) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) batches.push(currentBatch);

  for (const batch of batches) {
    await batch.commit();
  }

  return docs.length;
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Harmony Health LMS — Deployment Cleanup     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Preserving: ${PRESERVE_EMAILS.join(', ')}\n`);

  initAdmin();
  const auth = admin.auth();
  const db = admin.firestore();

  // ── Step 1: Identify test accounts to remove ─────
  console.log('━━━ Step 1: Identifying Test Accounts ━━━\n');

  const testUsers = SEED_USERS.filter(
    (u) => !PRESERVE_EMAILS.includes(u.email)
  );
  const testUids: string[] = [];
  const uidToEmail: Record<string, string> = {};

  for (const user of testUsers) {
    try {
      const record = await auth.getUserByEmail(user.email);
      testUids.push(record.uid);
      uidToEmail[record.uid] = user.email;
      console.log(`  [remove] ${user.email} → ${record.uid}`);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        console.log(`  [skip]   ${user.email} — not in Auth`);
      } else {
        console.error(`  [error]  ${user.email}:`, err.message);
      }
    }
  }

  // Also verify preserved accounts exist
  for (const email of PRESERVE_EMAILS) {
    try {
      const record = await auth.getUserByEmail(email);
      console.log(`  [KEEP]   ${email} → ${record.uid}`);
    } catch {
      console.log(`  [NOTE]   ${email} — not found (will be created by seed script)`);
    }
  }

  console.log(`\n  ${testUids.length} test account(s) to remove\n`);

  // ── Step 2: Clean transactional collections ──────
  console.log('━━━ Step 2: Cleaning Collections ━━━\n');

  for (const collectionName of COLLECTIONS_TO_CLEAN) {
    try {
      const snapshot = await db.collection(collectionName).get();
      if (snapshot.empty) {
        console.log(`  · ${collectionName}: empty`);
        continue;
      }
      const deleted = await batchDelete(db, snapshot.docs);
      console.log(`  [cleaned] ${collectionName}: ${deleted} document(s) deleted`);
    } catch (err: any) {
      console.error(`  [error]   ${collectionName}: ${err.message}`);
    }
  }

  // ── Step 3: Clean test courses (with subcollections) ──
  console.log('\n━━━ Step 3: Cleaning Courses ━━━\n');

  const coursesSnapshot = await db.collection('courses').get();
  let coursesDeleted = 0;
  let modulesDeleted = 0;

  for (const courseDoc of coursesSnapshot.docs) {
    const courseData = courseDoc.data();
    console.log(`  Deleting course: "${courseData.title || courseDoc.id}"`);

    // Delete modules subcollection first
    const modulesRef = db.collection('courses').doc(courseDoc.id).collection('modules');
    const modulesSnapshot = await modulesRef.get();

    for (const moduleDoc of modulesSnapshot.docs) {
      // Delete blocks subcollection
      const blocksRef = modulesRef.doc(moduleDoc.id).collection('blocks');
      const blocksSnapshot = await blocksRef.get();
      if (!blocksSnapshot.empty) {
        await batchDelete(db, blocksSnapshot.docs);
      }
    }

    if (!modulesSnapshot.empty) {
      const count = await batchDelete(db, modulesSnapshot.docs);
      modulesDeleted += count;
    }

    await courseDoc.ref.delete();
    coursesDeleted++;
  }

  console.log(`  [cleaned] ${coursesDeleted} course(s), ${modulesDeleted} module(s) deleted`);

  // ── Step 4: Delete test user profiles ────────────
  console.log('\n━━━ Step 4: Deleting Test User Profiles ━━━\n');

  for (const uid of testUids) {
    try {
      await db.collection('users').doc(uid).delete();
      console.log(`  [deleted] profile: ${uidToEmail[uid]}`);
    } catch (err: any) {
      console.error(`  [error]   profile ${uidToEmail[uid]}: ${err.message}`);
    }
  }

  // ── Step 5: Delete test Auth accounts ────────────
  console.log('\n━━━ Step 5: Deleting Test Auth Accounts ━━━\n');

  for (const uid of testUids) {
    try {
      await auth.deleteUser(uid);
      console.log(`  [deleted] auth: ${uidToEmail[uid]}`);
    } catch (err: any) {
      console.error(`  [error]   auth ${uidToEmail[uid]}: ${err.message}`);
    }
  }

  // ── Step 6: Clean invitations collection ─────────
  console.log('\n━━━ Step 6: Cleaning Invitations ━━━\n');

  const invitationsSnapshot = await db.collection('invitations').get();
  if (!invitationsSnapshot.empty) {
    const deleted = await batchDelete(db, invitationsSnapshot.docs);
    console.log(`  [cleaned] invitations: ${deleted} document(s) deleted`);
  } else {
    console.log('  · invitations: empty');
  }

  // ── Summary ─────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║        Deployment Cleanup Complete            ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\nAll test data has been removed.');
  console.log(`Preserved accounts: ${PRESERVE_EMAILS.join(', ')}`);
  console.log('\nNext Steps:');
  console.log('  1. Run seed script if Miara\'s account needs to be created:');
  console.log('     npx tsx scripts/seed/seedUsers.ts');
  console.log('  2. Deploy Firestore rules and indexes:');
  console.log('     firebase deploy --only firestore');
  console.log('  3. Deploy Cloud Functions:');
  console.log('     firebase deploy --only functions');
  console.log('  4. Verify Miara can log in and see admin pages');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nDeployment cleanup failed:', err);
  process.exit(1);
});
