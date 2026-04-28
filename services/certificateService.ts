/**
 * Certificate Service
 *
 * Manages CE Credit Vault certificates — issuance, retrieval, and storage.
 * Certificates are generated when a course grade is finalized (all modules
 * complete + overall pass). PDF generation uses a Cloud Function; this
 * service handles the Firestore metadata and Firebase Storage URLs.
 *
 * @module services/certificateService
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { Certificate } from '../functions/src/types';
import { auditService } from './auditService';
import { generateCertId, certificateStoragePath } from '../utils/certificateId';

const CERTIFICATES_COLLECTION = 'certificates';
const ORG_COLLECTION = 'organizations';
const DEFAULT_ORG_ID = 'parrish';

// ============================================
// ORGANIZATION CONFIG
// ============================================

interface OrgConfig {
  name: string;
  issuerName: string;
  certPrefix: string;
}

/**
 * Fetches org config, falling back to defaults for Parrish.
 */
export const getOrgConfig = async (orgId: string = DEFAULT_ORG_ID): Promise<OrgConfig> => {
  try {
    const orgDoc = await getDoc(doc(db, ORG_COLLECTION, orgId));
    if (orgDoc.exists()) {
      const data = orgDoc.data();
      return {
        name: data.name || 'Parrish Health Systems',
        issuerName: data.issuerName || 'Parrish Health Systems Education Department',
        certPrefix: data.certPrefix || 'PHS',
      };
    }
  } catch {
    // Fall through to defaults
  }
  return {
    name: 'Parrish Health Systems',
    issuerName: 'Parrish Health Systems Education Department',
    certPrefix: 'PHS',
  };
};

// ============================================
// CERTIFICATE CRUD
// ============================================

/**
 * Issues a certificate for a completed course.
 * Creates the Firestore document and audit log.
 * PDF generation is handled separately (Cloud Function or manual upload).
 */
export const issueCertificate = async (params: {
  userId: string;
  courseId: string;
  grade: number;
  ceCredits: number;
  courseName: string;
  studentName: string;
  templateDocId?: string;
  actorId: string;
  actorName: string;
}): Promise<Certificate> => {
  const orgConfig = await getOrgConfig();
  const certId = generateCertId(orgConfig.certPrefix);
  const storagePath = certificateStoragePath(DEFAULT_ORG_ID, params.userId, params.courseId, certId);

  const certificate: Omit<Certificate, 'id'> & { createdAt: ReturnType<typeof serverTimestamp> } = {
    certId,
    userId: params.userId,
    courseId: params.courseId,
    orgId: DEFAULT_ORG_ID,
    issuedAt: new Date().toISOString(),
    grade: params.grade,
    ceCredits: params.ceCredits,
    courseName: params.courseName,
    studentName: params.studentName,
    issuerName: orgConfig.issuerName,
    pdfStoragePath: storagePath,
    templateDocId: params.templateDocId || undefined,
    status: 'pending',
    createdAt: serverTimestamp(),
  };

  // Strip undefined values for Firestore
  const cleanData = Object.fromEntries(
    Object.entries(certificate).filter(([, v]) => v !== undefined)
  );

  const docRef = doc(db, CERTIFICATES_COLLECTION, certId);
  await setDoc(docRef, cleanData);

  await auditService.logToFirestore(
    params.actorId,
    params.actorName,
    'CERTIFICATE_ISSUED' as any,
    certId,
    `Certificate issued for ${params.studentName} — ${params.courseName} (${params.grade}%, ${params.ceCredits} CEU)`,
    {
      userId: params.userId,
      courseId: params.courseId,
      grade: params.grade,
      ceCredits: params.ceCredits,
    }
  );

  return { id: certId, ...certificate } as unknown as Certificate;
};

/**
 * Gets a certificate by its ID.
 */
export const getCertificate = async (certId: string): Promise<Certificate | null> => {
  const docRef = doc(db, CERTIFICATES_COLLECTION, certId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Certificate;
};

/**
 * Gets all certificates for a user.
 */
export const getUserCertificates = async (userId: string): Promise<Certificate[]> => {
  const q = query(
    collection(db, CERTIFICATES_COLLECTION),
    where('userId', '==', userId),
    orderBy('issuedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Certificate));
};

/**
 * Gets all certificates for a specific course (admin view).
 */
export const getCourseCertificates = async (courseId: string): Promise<Certificate[]> => {
  const q = query(
    collection(db, CERTIFICATES_COLLECTION),
    where('courseId', '==', courseId),
    orderBy('issuedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Certificate));
};

/**
 * Gets the certificate for a specific user + course combination.
 */
export const getUserCourseCertificate = async (
  userId: string,
  courseId: string
): Promise<Certificate | null> => {
  const q = query(
    collection(db, CERTIFICATES_COLLECTION),
    where('userId', '==', userId),
    where('courseId', '==', courseId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Certificate;
};

/**
 * Gets a signed download URL for a certificate PDF.
 * Returns null if the PDF doesn't exist in Storage yet.
 */
export const getCertificateDownloadUrl = async (storagePath: string): Promise<string | null> => {
  try {
    const storageRef = ref(storage, storagePath);
    return await getDownloadURL(storageRef);
  } catch {
    return null;
  }
};

/**
 * Updates the certificate status (e.g., after PDF generation completes).
 */
export const updateCertificateStatus = async (
  certId: string,
  status: Certificate['status'],
  updates?: Partial<Pick<Certificate, 'pdfStoragePath' | 'generatedDocId'>>
): Promise<void> => {
  const docRef = doc(db, CERTIFICATES_COLLECTION, certId);
  const data: Record<string, any> = { status, updatedAt: serverTimestamp() };
  if (updates?.pdfStoragePath) data.pdfStoragePath = updates.pdfStoragePath;
  if (updates?.generatedDocId) data.generatedDocId = updates.generatedDocId;

  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(docRef, data);
};
