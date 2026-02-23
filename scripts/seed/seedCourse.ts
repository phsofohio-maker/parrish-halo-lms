/**
 * Seed Course — Hospice Documentation Fundamentals
 *
 * Creates the training course with 3 modules and all content blocks.
 * Idempotent: checks for existing course by title before creating.
 * Uses deterministic block IDs so re-runs overwrite, not duplicate.
 *
 * Usage:
 *   npx tsx scripts/seed/seedCourse.ts
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var or
 *           service-account.json in project root
 */

import * as admin from 'firebase-admin';
import {
  COURSE,
  MODULE_1, MODULE_1_BLOCKS,
  MODULE_2, MODULE_2_BLOCKS,
  MODULE_3, MODULE_3_BLOCKS,
} from './seedData/course';
import { initAdmin } from './seedAll';

interface SeedCourseResult {
  courseId: string;
  title: string;
  moduleIds: string[];
  totalBlocks: number;
  alreadyExisted: boolean;
}

export async function seedCourse(adminUid?: string): Promise<SeedCourseResult> {
  const db = admin.firestore();

  // Check if course already exists
  const existing = await db
    .collection('courses')
    .where('title', '==', COURSE.title)
    .limit(1)
    .get();

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    console.log(`  [exists] Course "${COURSE.title}" (${existingDoc.id})`);

    // Count existing modules
    const modulesSnap = await db
      .collection('courses')
      .doc(existingDoc.id)
      .collection('modules')
      .get();

    return {
      courseId: existingDoc.id,
      title: COURSE.title,
      moduleIds: modulesSnap.docs.map((d) => d.id),
      totalBlocks: 0,
      alreadyExisted: true,
    };
  }

  // Create course document
  const courseRef = db.collection('courses').doc();
  const courseId = courseRef.id;

  await courseRef.set({
    ...COURSE,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  [created] Course "${COURSE.title}" (${courseId})`);

  // Create modules and their blocks
  const modules = [
    { meta: MODULE_1, blocks: MODULE_1_BLOCKS, label: 'Module 1: Introduction' },
    { meta: MODULE_2, blocks: MODULE_2_BLOCKS, label: 'Module 2: Core Concepts' },
    { meta: MODULE_3, blocks: MODULE_3_BLOCKS, label: 'Module 3: Practical Application' },
  ];

  const moduleIds: string[] = [];
  let totalBlocks = 0;

  for (const mod of modules) {
    const moduleRef = db
      .collection('courses')
      .doc(courseId)
      .collection('modules')
      .doc();
    const moduleId = moduleRef.id;

    await moduleRef.set({
      ...mod.meta,
      courseId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  [created] ${mod.label} (${moduleId})`);

    // Create blocks for this module
    for (const block of mod.blocks) {
      const blockRef = db
        .collection('courses')
        .doc(courseId)
        .collection('modules')
        .doc(moduleId)
        .collection('blocks')
        .doc(block.id);

      await blockRef.set({
        ...block,
        moduleId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      totalBlocks++;
    }
    console.log(`    ${mod.blocks.length} blocks created`);

    moduleIds.push(moduleId);
  }

  // Audit log entry
  if (adminUid) {
    await db.collection('audit_logs').add({
      actorId: adminUid,
      actorName: 'Seed Script',
      actionType: 'COURSE_CREATE',
      targetId: courseId,
      details: `Seeded course: ${COURSE.title} (3 modules, ${totalBlocks} blocks)`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { courseId, title: COURSE.title, moduleIds, totalBlocks, alreadyExisted: false };
}

// Allow running standalone
if (require.main === module) {
  initAdmin();
  console.log('=== Seeding Course ===\n');
  seedCourse()
    .then((result) => {
      if (result.alreadyExisted) {
        console.log(`\nCourse already exists (${result.courseId}). No changes made.`);
      } else {
        console.log(`\nDone: ${result.title}`);
        console.log(`  Course ID: ${result.courseId}`);
        console.log(`  Modules: ${result.moduleIds.length}`);
        console.log(`  Blocks: ${result.totalBlocks}`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed course failed:', err);
      process.exit(1);
    });
}
