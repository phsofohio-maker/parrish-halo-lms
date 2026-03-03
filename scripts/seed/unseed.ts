/**
 * Unseed / Cleanup — Harmony Health LMS
 *
 * Deletes transactional data (enrollments, progress, grades, course_grades)
 * for all seed user accounts. Use this to reset test state after code changes.
 *
 * Usage:
 *   npm run unseed            # Delete transactional data only
 *   npm run unseed:full       # Also delete users, course, and auth accounts
 *
 * Or directly:
 *   npx tsx scripts/seed/unseed.ts
 *   npx tsx scripts/seed/unseed.ts --full
 *
 * Prerequisites: Same as seedAll.ts (service-account.json or GOOGLE_APPLICATION_CREDENTIALS)
 */

import admin from 'firebase-admin';
import { SEED_USERS } from './seedData/users';
import { COURSE } from './seedData/course';
import { initAdmin } from './seedAll';

const TRANSACTIONAL_COLLECTIONS = ['enrollments', 'progress', 'grades', 'course_grades'];

/**
 * Delete all documents in a collection matching any of the given UIDs.
 * Firestore `in` queries support max 10 values, so we chunk.
 */
async function deleteByUserIds(
  db: admin.firestore.Firestore,
  collectionName: string,
  uids: string[]
): Promise<number> {
  let totalDeleted = 0;

  // Chunk UIDs into groups of 10 (Firestore `in` limit)
  for (let i = 0; i < uids.length; i += 10) {
    const chunk = uids.slice(i, i + 10);
    const snapshot = await db
      .collection(collectionName)
      .where('userId', 'in', chunk)
      .get();

    if (snapshot.empty) continue;

    // Batch delete (max 500 per batch)
    const batches: admin.firestore.WriteBatch[] = [];
    let currentBatch = db.batch();
    let opsInBatch = 0;

    for (const doc of snapshot.docs) {
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

    totalDeleted += snapshot.size;
  }

  return totalDeleted;
}

/**
 * Recursively delete all documents in a collection (including subcollections).
 */
async function deleteCollection(
  db: admin.firestore.Firestore,
  collectionRef: admin.firestore.CollectionReference,
  depth = 0
): Promise<number> {
  let totalDeleted = 0;
  const snapshot = await collectionRef.get();

  if (snapshot.empty) return 0;

  // For each doc, recurse into known subcollections before deleting
  for (const doc of snapshot.docs) {
    const subcollections = await doc.ref.listCollections();
    for (const sub of subcollections) {
      totalDeleted += await deleteCollection(db, sub, depth + 1);
    }
  }

  // Batch delete the documents at this level
  const batches: admin.firestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let opsInBatch = 0;

  for (const doc of snapshot.docs) {
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

  totalDeleted += snapshot.size;
  return totalDeleted;
}

async function main() {
  const fullMode = process.argv.includes('--full');

  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║     Harmony Health LMS — Unseed${fullMode ? ' (FULL)' : ''}${fullMode ? '' : '        '}  ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  if (fullMode) {
    console.log('⚠  FULL MODE: Will also delete users, course, and auth accounts.\n');
  }

  initAdmin();
  const auth = admin.auth();
  const db = admin.firestore();

  // ── Step 1: Resolve seed user UIDs ─────────────
  console.log('━━━ Step 1: Resolving Seed User UIDs ━━━\n');
  const uids: string[] = [];
  const uidToEmail: Record<string, string> = {};

  for (const user of SEED_USERS) {
    try {
      const record = await auth.getUserByEmail(user.email);
      uids.push(record.uid);
      uidToEmail[record.uid] = user.email;
      console.log(`  [found] ${user.email} → ${record.uid}`);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        console.log(`  [skip]  ${user.email} — not found in Auth`);
      } else {
        console.error(`  [error] ${user.email}:`, err.message);
      }
    }
  }

  if (uids.length === 0) {
    console.log('\nNo seed users found. Nothing to clean up.');
    process.exit(0);
  }

  console.log(`\n  Found ${uids.length} seed user(s)\n`);

  // ── Step 2: Delete transactional data ──────────
  console.log('━━━ Step 2: Deleting Transactional Data ━━━\n');

  for (const collection of TRANSACTIONAL_COLLECTIONS) {
    const deleted = await deleteByUserIds(db, collection, uids);
    const icon = deleted > 0 ? '🗑' : '·';
    console.log(`  ${icon} ${collection}: ${deleted} document(s) deleted`);
  }

  // ── Step 3 (full mode): Delete course ──────────
  if (fullMode) {
    console.log('\n━━━ Step 3: Deleting Course ━━━\n');

    const courseQuery = await db
      .collection('courses')
      .where('title', '==', COURSE.title)
      .limit(1)
      .get();

    if (!courseQuery.empty) {
      const courseDoc = courseQuery.docs[0];
      const courseId = courseDoc.id;
      console.log(`  Found course: "${COURSE.title}" (${courseId})`);

      // Delete modules subcollection (and their blocks)
      const modulesRef = db.collection('courses').doc(courseId).collection('modules');
      const modulesDeleted = await deleteCollection(db, modulesRef);
      console.log(`  Deleted ${modulesDeleted} module/block documents`);

      // Delete the course document itself
      await courseDoc.ref.delete();
      console.log(`  Deleted course document`);
    } else {
      console.log('  No course found to delete');
    }

    // ── Step 4 (full mode): Delete user profiles + auth ──
    console.log('\n━━━ Step 4: Deleting User Profiles & Auth Accounts ━━━\n');

    for (const uid of uids) {
      // Delete Firestore profile
      await db.collection('users').doc(uid).delete();
      // Delete Auth account
      await auth.deleteUser(uid);
      console.log(`  [deleted] ${uidToEmail[uid]} (${uid})`);
    }
  }

  // ── Summary ─────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║            Unseed Complete                   ║');
  console.log('╚══════════════════════════════════════════════╝');

  if (fullMode) {
    console.log('\nAll seed data removed. Run `npm run seed` to re-create.');
  } else {
    console.log('\nTransactional data cleared for all seed accounts.');
    console.log('Users and course are intact — ready for fresh testing.');
    console.log('\nNext Steps:');
    console.log('  1. Log in as admin → ensure course is published');
    console.log('  2. Log in as staff (maria.santos@parrish.health)');
    console.log('  3. Enroll in course → complete modules → verify grades');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\nUnseed failed:', err);
  process.exit(1);
});
