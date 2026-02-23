/**
 * Seed Users — Firebase Auth + Firestore Profiles
 *
 * Creates staff accounts with proper JWT custom claims and
 * matching Firestore user documents. Idempotent: re-running
 * updates claims and profiles without duplicating accounts.
 *
 * Usage:
 *   npx tsx scripts/seed/seedUsers.ts
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var or
 *           service-account.json in project root
 */

import * as admin from 'firebase-admin';
import { SEED_USERS, SeedUser } from './seedData/users';
import { initAdmin } from './seedAll';

interface CreatedUser {
  uid: string;
  email: string;
  role: string;
  created: boolean;
}

export async function seedUsers(): Promise<CreatedUser[]> {
  const auth = admin.auth();
  const db = admin.firestore();
  const results: CreatedUser[] = [];

  for (const user of SEED_USERS) {
    try {
      let uid: string;
      let created = false;

      // Check if user already exists
      try {
        const existing = await auth.getUserByEmail(user.email);
        uid = existing.uid;
        console.log(`  [exists] ${user.email} (${uid})`);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          // Create new account
          const newUser = await auth.createUser({
            email: user.email,
            password: user.password,
            displayName: user.displayName,
            emailVerified: true,
          });
          uid = newUser.uid;
          created = true;
          console.log(`  [created] ${user.email} (${uid})`);
        } else {
          throw err;
        }
      }

      // Set JWT custom claims (source of truth for security rules)
      await auth.setCustomUserClaims(uid, { role: user.role });

      // Create/update Firestore user profile
      await db.collection('users').doc(uid).set(
        {
          uid,
          displayName: user.displayName,
          email: user.email,
          role: user.role,
          department: user.department,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(created && { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );

      results.push({ uid, email: user.email, role: user.role, created });
    } catch (err) {
      console.error(`  [ERROR] Failed to seed ${user.email}:`, err);
    }
  }

  return results;
}

// Allow running standalone
if (require.main === module) {
  initAdmin();
  console.log('=== Seeding Users ===\n');
  seedUsers()
    .then((results) => {
      const created = results.filter((r) => r.created).length;
      const updated = results.filter((r) => !r.created).length;
      console.log(`\nDone: ${created} created, ${updated} updated, ${results.length} total`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed users failed:', err);
      process.exit(1);
    });
}
