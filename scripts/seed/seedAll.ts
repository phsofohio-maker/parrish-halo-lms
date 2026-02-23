/**
 * Seed Orchestrator — Harmony Health LMS
 *
 * Runs user and course seeding in sequence.
 * Creates 12 staff accounts and one complete training course.
 *
 * Usage:
 *   npm run seed
 *   # or directly:
 *   npx tsx scripts/seed/seedAll.ts
 *
 * Prerequisites:
 *   1. Download a service account key from Firebase Console
 *      (Project Settings > Service Accounts > Generate New Private Key)
 *   2. Save as service-account.json in project root (already gitignored)
 *   3. Or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Initialize Firebase Admin SDK.
 * Exported so individual seed scripts can call it when run standalone.
 */
export function initAdmin(): void {
  if (admin.apps.length > 0) return; // Already initialized

  // Try GOOGLE_APPLICATION_CREDENTIALS first, then service-account.json
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const localPath = path.resolve(__dirname, '../../service-account.json');

  if (envPath && fs.existsSync(envPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(envPath),
    });
    console.log(`Firebase Admin initialized (credentials: ${envPath})`);
  } else if (fs.existsSync(localPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(localPath),
    });
    console.log('Firebase Admin initialized (credentials: service-account.json)');
  } else {
    // Fall back to application default credentials (works in Cloud environments
    // and with Firebase emulators when FIRESTORE_EMULATOR_HOST is set)
    admin.initializeApp();
    console.log('Firebase Admin initialized (application default credentials)');
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     Harmony Health LMS — Seed Script        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  initAdmin();

  // Dynamically import to avoid circular dependency with initAdmin
  const { seedUsers } = await import('./seedUsers');
  const { seedCourse } = await import('./seedCourse');

  // ── Step 1: Seed Users ──────────────────────────
  console.log('━━━ Step 1: Creating User Accounts ━━━\n');
  const users = await seedUsers();

  const created = users.filter((u) => u.created).length;
  const updated = users.filter((u) => !u.created).length;
  console.log(`\n  Summary: ${created} created, ${updated} updated\n`);

  // ── Step 2: Seed Course ─────────────────────────
  console.log('━━━ Step 2: Creating Training Course ━━━\n');
  const adminUser = users.find((u) => u.role === 'admin');
  const courseResult = await seedCourse(adminUser?.uid);

  if (courseResult.alreadyExisted) {
    console.log(`\n  Course already exists — skipped.`);
  } else {
    console.log(`\n  Course: ${courseResult.title}`);
    console.log(`  ID: ${courseResult.courseId}`);
    console.log(`  Modules: ${courseResult.moduleIds.length}`);
    console.log(`  Content blocks: ${courseResult.totalBlocks}`);
  }

  // ── Summary ─────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║              Seed Complete                   ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\nTest Accounts:');
  console.log('  Admin:      sarah.chen@parrish.health / ParrishAdmin2026!');
  console.log('  Instructor: dr.patricia.gomez@parrish.health / ParrishInstr2026!');
  console.log('  Staff:      maria.santos@parrish.health / ParrishStaff2026!');
  console.log('\nNext Steps:');
  console.log('  1. Log in as admin (sarah.chen@parrish.health)');
  console.log('  2. Go to Course Manager → Publish the course');
  console.log('  3. Log in as staff → Enroll → Complete all modules');
  console.log('  4. Module 3 short-answer questions → triggers review queue');
  console.log('  5. Log in as instructor → Grade Center → Approve review');
  console.log('  6. Verify audit trail in Audit Logs page');

  process.exit(0);
}

// Only run main if this file is the entry point
if (require.main === module) {
  main().catch((err) => {
    console.error('\nSeed failed:', err);
    process.exit(1);
  });
}
