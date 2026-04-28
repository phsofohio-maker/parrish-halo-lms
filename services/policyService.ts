/**
 * Policy Service
 *
 * Handles CRUD for policy documents and immutable e-signatures.
 * Signatures store a SHA-256 hash of the policy body at signing time
 * so the legally binding artifact survives later policy edits.
 *
 * @module services/policyService
 */

import {
  collection, doc, setDoc, getDoc, getDocs, query, where, orderBy,
  serverTimestamp, Timestamp, updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  PolicyDocument, PolicySignature, SignatureMethod, UserRoleType,
} from '../functions/src/types';
import { auditService } from './auditService';
import { generateId } from '../utils';

const POLICIES_COLLECTION = 'policies';
const SIGNATURES_COLLECTION = 'policy_signatures';

// ============================================
// Hashing (SHA-256 → hex)
// ============================================

const sha256Hex = async (text: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

export const hashPolicyContent = sha256Hex;

// ============================================
// Public IP capture (best-effort)
// ============================================

const fetchPublicIp = async (): Promise<string | undefined> => {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (!res.ok) return undefined;
    const data = await res.json();
    return typeof data.ip === 'string' ? data.ip : undefined;
  } catch {
    return undefined;
  }
};

// ============================================
// Policy CRUD
// ============================================

const docToPolicy = (d: any): PolicyDocument => {
  const data = d.data();
  return {
    id: d.id,
    title: data.title || '',
    content: data.content || '',
    version: data.version || '1.0',
    effectiveDate: data.effectiveDate?.toDate?.()?.toISOString() ||
      (typeof data.effectiveDate === 'string' ? data.effectiveDate : ''),
    createdBy: data.createdBy || '',
    createdByName: data.createdByName || '',
    createdAt: data.createdAt?.toDate?.()?.toISOString() ||
      (typeof data.createdAt === 'string' ? data.createdAt : ''),
    updatedAt: data.updatedAt?.toDate?.()?.toISOString(),
    assignedRoles: data.assignedRoles || [],
    hasSignatures: !!data.hasSignatures,
    archived: !!data.archived,
  };
};

export const getAllPolicies = async (): Promise<PolicyDocument[]> => {
  const snap = await getDocs(query(collection(db, POLICIES_COLLECTION), orderBy('title')));
  return snap.docs.map(docToPolicy);
};

export const getActivePoliciesForRole = async (role: UserRoleType): Promise<PolicyDocument[]> => {
  const all = await getAllPolicies();
  return all
    .filter(p => !p.archived && p.assignedRoles.includes(role))
    .sort((a, b) => a.title.localeCompare(b.title));
};

export const getPolicy = async (id: string): Promise<PolicyDocument | null> => {
  const snap = await getDoc(doc(db, POLICIES_COLLECTION, id));
  if (!snap.exists()) return null;
  return docToPolicy(snap);
};

export const createPolicy = async (params: {
  title: string;
  content: string;
  version: string;
  effectiveDate: string;
  assignedRoles: UserRoleType[];
  actorId: string;
  actorName: string;
}): Promise<PolicyDocument> => {
  const id = generateId('pol');
  const docRef = doc(db, POLICIES_COLLECTION, id);

  await setDoc(docRef, {
    title: params.title,
    content: params.content,
    version: params.version,
    effectiveDate: params.effectiveDate,
    createdBy: params.actorId,
    createdByName: params.actorName,
    createdAt: serverTimestamp(),
    assignedRoles: params.assignedRoles,
    hasSignatures: false,
    archived: false,
  });

  await auditService.logToFirestore(
    params.actorId,
    params.actorName,
    'POLICY_CREATE' as any,
    id,
    `Created policy "${params.title}" v${params.version} for roles: ${params.assignedRoles.join(', ')}`
  );

  return {
    id,
    title: params.title,
    content: params.content,
    version: params.version,
    effectiveDate: params.effectiveDate,
    createdBy: params.actorId,
    createdByName: params.actorName,
    createdAt: new Date().toISOString(),
    assignedRoles: params.assignedRoles,
    hasSignatures: false,
    archived: false,
  };
};

/**
 * Updates a policy. If the policy has any signatures and the content
 * is changing, this is treated as a NEW version: the existing policy
 * is archived and a new policy doc is created. Signatures stay tied
 * to the original (immutable) version.
 */
export const updatePolicy = async (params: {
  policyId: string;
  title: string;
  content: string;
  version: string;
  effectiveDate: string;
  assignedRoles: UserRoleType[];
  actorId: string;
  actorName: string;
}): Promise<PolicyDocument> => {
  const existing = await getPolicy(params.policyId);
  if (!existing) throw new Error('Policy not found');

  const contentChanged =
    existing.content !== params.content || existing.version !== params.version;

  // If signatures exist and content changed, fork into a new version.
  if (existing.hasSignatures && contentChanged) {
    await updateDoc(doc(db, POLICIES_COLLECTION, params.policyId), {
      archived: true,
      updatedAt: serverTimestamp(),
    });
    await auditService.logToFirestore(
      params.actorId,
      params.actorName,
      'POLICY_VERSION_BUMP' as any,
      params.policyId,
      `Archived "${existing.title}" v${existing.version}; creating v${params.version}`
    );
    return await createPolicy({
      title: params.title,
      content: params.content,
      version: params.version,
      effectiveDate: params.effectiveDate,
      assignedRoles: params.assignedRoles,
      actorId: params.actorId,
      actorName: params.actorName,
    });
  }

  // Otherwise in-place edit (no signatures yet OR no content/version change).
  await updateDoc(doc(db, POLICIES_COLLECTION, params.policyId), {
    title: params.title,
    content: params.content,
    version: params.version,
    effectiveDate: params.effectiveDate,
    assignedRoles: params.assignedRoles,
    updatedAt: serverTimestamp(),
  });

  await auditService.logToFirestore(
    params.actorId,
    params.actorName,
    'POLICY_UPDATE' as any,
    params.policyId,
    `Updated policy "${params.title}" v${params.version}`
  );

  return {
    ...existing,
    title: params.title,
    content: params.content,
    version: params.version,
    effectiveDate: params.effectiveDate,
    assignedRoles: params.assignedRoles,
    updatedAt: new Date().toISOString(),
  };
};

// ============================================
// Signature CRUD
// ============================================

const docToSignature = (d: any): PolicySignature => {
  const data = d.data();
  return {
    id: d.id,
    policyId: data.policyId,
    policyVersion: data.policyVersion || '',
    userId: data.userId,
    userName: data.userName || '',
    signedAt: data.signedAt?.toDate?.()?.toISOString() ||
      (typeof data.signedAt === 'string' ? data.signedAt : ''),
    signatureData: data.signatureData || '',
    signatureMethod: data.signatureMethod as SignatureMethod,
    ipAddress: data.ipAddress,
    userAgent: data.userAgent || '',
    documentHash: data.documentHash || '',
  };
};

export const getAllSignatures = async (): Promise<PolicySignature[]> => {
  const snap = await getDocs(collection(db, SIGNATURES_COLLECTION));
  return snap.docs.map(docToSignature);
};

export const getSignaturesForPolicy = async (policyId: string): Promise<PolicySignature[]> => {
  const snap = await getDocs(
    query(collection(db, SIGNATURES_COLLECTION), where('policyId', '==', policyId))
  );
  return snap.docs.map(docToSignature);
};

export const getUserSignatures = async (userId: string): Promise<PolicySignature[]> => {
  const snap = await getDocs(
    query(collection(db, SIGNATURES_COLLECTION), where('userId', '==', userId))
  );
  return snap.docs.map(docToSignature);
};

export const signPolicy = async (params: {
  policy: PolicyDocument;
  userId: string;
  userName: string;
  signatureData: string;
  signatureMethod: SignatureMethod;
}): Promise<PolicySignature> => {
  const documentHash = await hashPolicyContent(params.policy.content);
  const ipAddress = await fetchPublicIp();
  const id = generateId('sig');
  const docRef = doc(db, SIGNATURES_COLLECTION, id);

  const sigDoc = {
    policyId: params.policy.id,
    policyVersion: params.policy.version,
    userId: params.userId,
    userName: params.userName,
    signedAt: serverTimestamp(),
    signatureData: params.signatureData,
    signatureMethod: params.signatureMethod,
    ipAddress: ipAddress || null,
    userAgent: navigator.userAgent || '',
    documentHash,
  };

  await setDoc(docRef, sigDoc);

  // Mark the policy as having signatures so future edits fork a new version.
  if (!params.policy.hasSignatures) {
    try {
      await updateDoc(doc(db, POLICIES_COLLECTION, params.policy.id), {
        hasSignatures: true,
      });
    } catch {
      // Non-critical — signing succeeded.
    }
  }

  await auditService.logToFirestore(
    params.userId,
    params.userName,
    'POLICY_SIGNED' as any,
    id,
    `Signed "${params.policy.title}" v${params.policy.version} (${params.signatureMethod})`,
    {
      policyId: params.policy.id,
      policyVersion: params.policy.version,
      documentHash,
    }
  );

  return {
    id,
    policyId: params.policy.id,
    policyVersion: params.policy.version,
    userId: params.userId,
    userName: params.userName,
    signedAt: new Date().toISOString(),
    signatureData: params.signatureData,
    signatureMethod: params.signatureMethod,
    ipAddress: ipAddress || undefined,
    userAgent: navigator.userAgent || '',
    documentHash,
  };
};

/**
 * Returns "what the user has signed" for a given list of policies.
 * For each policy, includes the user's most recent matching-version signature.
 */
export const getUserPolicyStatus = async (
  userId: string,
  policies: PolicyDocument[]
): Promise<Map<string, PolicySignature | null>> => {
  const signatures = await getUserSignatures(userId);
  const sigsByPolicy = new Map<string, PolicySignature[]>();
  signatures.forEach(s => {
    if (!sigsByPolicy.has(s.policyId)) sigsByPolicy.set(s.policyId, []);
    sigsByPolicy.get(s.policyId)!.push(s);
  });

  const result = new Map<string, PolicySignature | null>();
  policies.forEach(p => {
    const sigs = sigsByPolicy.get(p.id) || [];
    const matching = sigs.find(s => s.policyVersion === p.version);
    result.set(p.id, matching || null);
  });
  return result;
};

/**
 * Sends a reminder email by writing to the `mail` collection (Trigger Email
 * extension dispatches). Records an audit entry.
 */
export const sendPolicyReminder = async (params: {
  policy: PolicyDocument;
  recipientEmail: string;
  recipientName: string;
  actorId: string;
  actorName: string;
}): Promise<void> => {
  await setDoc(doc(collection(db, 'mail')), {
    to: params.recipientEmail,
    message: {
      subject: `Action required: Sign policy "${params.policy.title}"`,
      html: `
        <p>Hello ${params.recipientName},</p>
        <p>You have not yet signed the policy
           <strong>${params.policy.title}</strong> (v${params.policy.version}).</p>
        <p>Please sign in to Parrish HALO and complete your acknowledgment in the Policy Center.</p>
        <p>— Parrish Health Systems Compliance</p>
      `,
    },
  });

  await auditService.logToFirestore(
    params.actorId,
    params.actorName,
    'POLICY_REMINDER_SENT' as any,
    params.policy.id,
    `Reminder sent to ${params.recipientName} for "${params.policy.title}" v${params.policy.version}`
  );
};
