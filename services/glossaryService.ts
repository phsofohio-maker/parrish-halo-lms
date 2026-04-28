/**
 * Glossary Service
 *
 * Manages clinical-term definitions per course. Each course has its own
 * subcollection of terms; rich-text content references terms only by ID,
 * keeping definitions in a single source of truth.
 *
 * @module services/glossaryService
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { auditService } from './auditService';
import { generateId } from '../utils';

const GLOSSARY_COLLECTION = 'glossary';
const TERMS_SUBCOLLECTION = 'terms';

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  courseId: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

function termsCollectionRef(courseId: string) {
  return collection(db, GLOSSARY_COLLECTION, courseId, TERMS_SUBCOLLECTION);
}

function termDocRef(courseId: string, termId: string) {
  return doc(db, GLOSSARY_COLLECTION, courseId, TERMS_SUBCOLLECTION, termId);
}

function toGlossaryTerm(id: string, data: any, courseId: string): GlossaryTerm {
  const toIso = (v: any): string =>
    v instanceof Timestamp ? v.toDate().toISOString()
    : typeof v === 'string' ? v
    : new Date().toISOString();

  return {
    id,
    term: data.term ?? '',
    definition: data.definition ?? '',
    courseId: data.courseId ?? courseId,
    createdBy: data.createdBy ?? '',
    createdByName: data.createdByName ?? '',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export async function createTerm(
  courseId: string,
  term: string,
  definition: string,
  actorId: string,
  actorName: string
): Promise<string> {
  const termId = generateId('term');
  const ref = termDocRef(courseId, termId);
  await setDoc(ref, stripUndefined({
    term,
    definition,
    courseId,
    createdBy: actorId,
    createdByName: actorName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  await auditService.logToFirestore(
    actorId,
    actorName,
    'GLOSSARY_TERM_CREATE',
    termId,
    `Created glossary term "${term}" in course ${courseId}`
  );
  return termId;
}

export async function updateTerm(
  courseId: string,
  termId: string,
  updates: Pick<GlossaryTerm, 'term' | 'definition'>,
  actorId: string,
  actorName: string
): Promise<void> {
  const ref = termDocRef(courseId, termId);
  await updateDoc(ref, stripUndefined({
    term: updates.term,
    definition: updates.definition,
    updatedAt: serverTimestamp(),
  }));
  await auditService.logToFirestore(
    actorId,
    actorName,
    'GLOSSARY_TERM_UPDATE',
    termId,
    `Updated glossary term "${updates.term}" in course ${courseId}`
  );
}

export async function deleteTerm(
  courseId: string,
  termId: string,
  actorId: string,
  actorName: string
): Promise<void> {
  await deleteDoc(termDocRef(courseId, termId));
  await auditService.logToFirestore(
    actorId,
    actorName,
    'GLOSSARY_TERM_DELETE',
    termId,
    `Deleted glossary term ${termId} in course ${courseId}`
  );
}

export async function getTermsForCourse(
  courseId: string
): Promise<GlossaryTerm[]> {
  const q = query(termsCollectionRef(courseId), orderBy('term', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => toGlossaryTerm(d.id, d.data(), courseId));
}

export async function getTerm(
  courseId: string,
  termId: string
): Promise<GlossaryTerm | null> {
  try {
    const snap = await getDoc(termDocRef(courseId, termId));
    if (!snap.exists()) return null;
    return toGlossaryTerm(snap.id, snap.data(), courseId);
  } catch {
    return null;
  }
}
