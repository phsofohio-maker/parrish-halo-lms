/**
 * Invitation Service
 *
 * Handles Firestore operations for the staff invitation pipeline.
 * Creates invitation records, triggers email dispatch via the mail
 * collection (Firebase Extension), and manages invitation lifecycle.
 *
 * @module services/invitationService
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Invitation, UserRoleType } from '../functions/src/types';
import { auditService } from './auditService';

const INVITATIONS_COLLECTION = 'invitations';
const MAIL_COLLECTION = 'mail';
const PRODUCTION_URL = import.meta.env.VITE_APP_URL || 'https://harmony-lms.web.app';

// ============================================
// HELPERS
// ============================================

/** Generate a cryptographically random token for invitation links */
const generateToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** Calculate expiration date (72 hours from now) */
const getExpirationDate = (): Date => {
  const date = new Date();
  date.setHours(date.getHours() + 72);
  return date;
};

const docToInvitation = (docSnap: any): Invitation => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    email: data.email,
    role: data.role,
    department: data.department,
    token: data.token,
    sentAt: data.sentAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    expiresAt: data.expiresAt?.toDate?.()?.toISOString() ?? '',
    status: data.status,
    invitedBy: data.invitedBy,
    invitedByName: data.invitedByName,
  };
};

// ============================================
// READ OPERATIONS
// ============================================

/** Get all invitations, ordered by most recent */
export const getInvitations = async (): Promise<Invitation[]> => {
  const q = query(
    collection(db, INVITATIONS_COLLECTION),
    orderBy('sentAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(docToInvitation);
};

/** Get invitations by status */
export const getInvitationsByStatus = async (
  status: Invitation['status']
): Promise<Invitation[]> => {
  const q = query(
    collection(db, INVITATIONS_COLLECTION),
    where('status', '==', status),
    orderBy('sentAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(docToInvitation);
};

// ============================================
// WRITE OPERATIONS
// ============================================

/**
 * Create a new invitation and dispatch an email.
 * Creates both the invitation document and a mail document
 * that the Firebase Trigger Email extension picks up.
 */
export const createInvitation = async (
  email: string,
  role: UserRoleType,
  department: string,
  actorId: string,
  actorName: string
): Promise<Invitation> => {
  // Check for existing pending invitation to this email
  const existingQuery = query(
    collection(db, INVITATIONS_COLLECTION),
    where('email', '==', email),
    where('status', '==', 'pending')
  );
  const existing = await getDocs(existingQuery);
  if (!existing.empty) {
    throw new Error(`A pending invitation already exists for ${email}`);
  }

  const token = generateToken();
  const expiresAt = getExpirationDate();
  const invitationId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const docRef = doc(db, INVITATIONS_COLLECTION, invitationId);

  const invitationData = {
    email,
    role,
    department: department || null,
    token,
    sentAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    status: 'pending' as const,
    invitedBy: actorId,
    invitedByName: actorName,
  };

  await setDoc(docRef, invitationData);

  // Dispatch email via the mail collection (Firebase Extension)
  const acceptUrl = `${PRODUCTION_URL}/accept-invite?token=${token}`;
  const mailDocRef = doc(db, MAIL_COLLECTION, `mail_${invitationId}`);
  await setDoc(mailDocRef, {
    to: email,
    message: {
      subject: 'You\'re Invited to Harmony Health LMS',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">Harmony Health LMS</h1>
            <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Clinical Training Portal</p>
          </div>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px;">
            <h2 style="color: #1f2937; font-size: 20px; margin: 0 0 16px;">You've Been Invited</h2>
            <p style="color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
              <strong>${actorName}</strong> has invited you to join the Harmony Health training portal as a <strong>${role}</strong>.
            </p>
            ${department ? `<p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">Department: ${department}</p>` : '<div style="height: 24px;"></div>'}
            <a href="${acceptUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Accept Invitation & Set Password
            </a>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
              This invitation expires in 72 hours. If you did not expect this email, you can safely ignore it.
            </p>
          </div>
          <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 32px;">
            Proprietary Software for Parrish Health Systems
          </p>
        </div>
      `,
    },
  });

  // Audit log
  await auditService.logToFirestore(
    actorId,
    actorName,
    'ENROLLMENT_CREATE',
    invitationId,
    `Invitation dispatched to ${email} with role: ${role}${department ? `, department: ${department}` : ''}`
  );

  return {
    id: invitationId,
    email,
    role,
    department: department || undefined,
    token,
    sentAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: 'pending',
    invitedBy: actorId,
    invitedByName: actorName,
  };
};

/**
 * Resend an invitation — updates sentAt, generates new token, dispatches new email.
 */
export const resendInvitation = async (
  invitationId: string,
  actorId: string,
  actorName: string
): Promise<void> => {
  const token = generateToken();
  const expiresAt = getExpirationDate();
  const docRef = doc(db, INVITATIONS_COLLECTION, invitationId);

  // Read current invitation to get email
  const snapshot = await getDocs(
    query(collection(db, INVITATIONS_COLLECTION), where('__name__', '==', invitationId))
  );
  if (snapshot.empty) throw new Error('Invitation not found');
  const data = snapshot.docs[0].data();

  if (data.status === 'accepted') {
    throw new Error('Cannot resend an accepted invitation');
  }

  await updateDoc(docRef, {
    token,
    sentAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    status: 'pending',
  });

  // Dispatch new email
  const acceptUrl = `${PRODUCTION_URL}/accept-invite?token=${token}`;
  const mailDocRef = doc(db, MAIL_COLLECTION, `mail_resend_${invitationId}_${Date.now()}`);
  await setDoc(mailDocRef, {
    to: data.email,
    message: {
      subject: 'Reminder: You\'re Invited to Harmony Health LMS',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">Harmony Health LMS</h1>
          </div>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px;">
            <h2 style="color: #1f2937; font-size: 20px; margin: 0 0 16px;">Invitation Reminder</h2>
            <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
              This is a reminder to complete your account setup for the Harmony Health training portal.
            </p>
            <a href="${acceptUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Accept Invitation & Set Password
            </a>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
              This invitation expires in 72 hours.
            </p>
          </div>
        </div>
      `,
    },
  });

  await auditService.logToFirestore(
    actorId,
    actorName,
    'ENROLLMENT_UPDATE',
    invitationId,
    `Invitation resent to ${data.email}`
  );
};

/**
 * Cancel a pending invitation.
 */
export const cancelInvitation = async (
  invitationId: string,
  actorId: string,
  actorName: string
): Promise<void> => {
  const docRef = doc(db, INVITATIONS_COLLECTION, invitationId);

  await updateDoc(docRef, {
    status: 'cancelled',
  });

  await auditService.logToFirestore(
    actorId,
    actorName,
    'ENROLLMENT_UPDATE',
    invitationId,
    `Invitation cancelled`
  );
};
