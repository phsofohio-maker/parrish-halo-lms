/**
 * Policy Center
 *
 * Staff and instructor surface for viewing and signing assigned policies.
 * Each unsigned policy renders the full text behind a scroll-to-bottom or
 * 30-second read-time gate before the signature area activates.
 *
 * @module pages/PolicyCenter
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  ScrollText, CheckCircle2, AlertTriangle, Loader2, AlertCircle, RefreshCw,
  PenLine, ChevronLeft, FileSignature,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { SignatureCapture, SignaturePayload } from '../components/SignatureCapture';
import { cn, formatDate } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { usePageLoadTracking } from '../hooks/usePageLoadTracking';
import { PolicyDocument, PolicySignature } from '../functions/src/types';
import {
  getActivePoliciesForRole, getUserSignatures, signPolicy,
} from '../services/policyService';

const MIN_READ_SECONDS = 30;

type PolicyStatus = 'unsigned' | 'signed' | 'new_version';

const statusFor = (
  policy: PolicyDocument,
  userSignatures: PolicySignature[]
): { status: PolicyStatus; signature: PolicySignature | null } => {
  const matching = userSignatures.find(
    s => s.policyId === policy.id && s.policyVersion === policy.version
  );
  if (matching) return { status: 'signed', signature: matching };
  const oldVersion = userSignatures.find(s => s.policyId === policy.id);
  if (oldVersion) return { status: 'new_version', signature: oldVersion };
  return { status: 'unsigned', signature: null };
};

export const PolicyCenter: React.FC = () => {
  usePageLoadTracking('policy_center');
  const { user } = useAuth();
  const { addToast } = useToast();

  const [policies, setPolicies] = useState<PolicyDocument[]>([]);
  const [userSignatures, setUserSignatures] = useState<PolicySignature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const [assigned, sigs] = await Promise.all([
        getActivePoliciesForRole(user.role),
        getUserSignatures(user.uid),
      ]);
      setPolicies(assigned);
      setUserSignatures(sigs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load policies';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activePolicy = useMemo(
    () => policies.find(p => p.id === activePolicyId) || null,
    [policies, activePolicyId]
  );

  const handleSigned = (sig: PolicySignature) => {
    setUserSignatures(prev => [...prev, sig]);
    setActivePolicyId(null);
    addToast({ type: 'success', title: 'Policy signed and recorded' });
  };

  if (!user) return null;

  const statuses = policies.map(p => ({ policy: p, ...statusFor(p, userSignatures) }));
  const unsignedCount = statuses.filter(s => s.status !== 'signed').length;

  // Single-policy view (signing flow)
  if (activePolicy) {
    return (
      <SigningView
        policy={activePolicy}
        existingStatus={statusFor(activePolicy, userSignatures).status}
        onBack={() => setActivePolicyId(null)}
        onSigned={handleSigned}
      />
    );
  }

  // List view
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ScrollText className="h-7 w-7 text-primary-600" />
            Policy Center
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Acknowledge and sign required policies.
            {unsignedCount > 0 && (
              <span className="ml-2 text-amber-600 font-semibold">
                · {unsignedCount} need your signature
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading} className="gap-2">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {isLoading && policies.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
        </div>
      ) : statuses.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700">No policies require your signature.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {statuses.map(({ policy, status, signature }) => (
            <li key={policy.id}>
              <button
                onClick={() => setActivePolicyId(policy.id)}
                className={cn(
                  'w-full text-left bg-white border rounded-lg p-5 transition-all flex items-start justify-between gap-4',
                  status === 'signed'
                    ? 'border-green-200 hover:border-green-300'
                    : status === 'new_version'
                    ? 'border-amber-300 hover:border-amber-400 bg-amber-50/30'
                    : 'border-gray-200 hover:border-primary-300'
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{policy.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    v{policy.version} · effective {formatDate(policy.effectiveDate)}
                  </p>
                  {status === 'signed' && signature && (
                    <p className="text-xs text-green-700 mt-2 inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Signed {formatDate(signature.signedAt)}
                    </p>
                  )}
                  {status === 'new_version' && (
                    <p className="text-xs text-amber-700 mt-2 inline-flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      New version available — re-signature required
                    </p>
                  )}
                  {status === 'unsigned' && (
                    <p className="text-xs text-gray-600 mt-2 inline-flex items-center gap-1">
                      <PenLine className="h-3.5 w-3.5" />
                      Action required
                    </p>
                  )}
                </div>
                <Button
                  variant={status === 'signed' ? 'ghost' : 'outline'}
                  size="sm"
                  className="shrink-0"
                >
                  {status === 'signed' ? 'View' : 'Open & sign'}
                </Button>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ============================================
// Signing View
// ============================================

interface SigningViewProps {
  policy: PolicyDocument;
  existingStatus: PolicyStatus;
  onBack: () => void;
  onSigned: (sig: PolicySignature) => void;
}

const SigningView: React.FC<SigningViewProps> = ({ policy, existingStatus, onBack, onSigned }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [readSeconds, setReadSeconds] = useState(0);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [signature, setSignature] = useState<SignaturePayload | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Read timer
  useEffect(() => {
    if (existingStatus === 'signed') return;
    const interval = setInterval(() => {
      setReadSeconds(s => Math.min(s + 1, MIN_READ_SECONDS));
    }, 1000);
    return () => clearInterval(interval);
  }, [existingStatus]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      setScrolledToBottom(true);
    }
  };

  const readGateOpen = scrolledToBottom || readSeconds >= MIN_READ_SECONDS;
  const canSubmit = readGateOpen && acknowledged && !!signature && !isSubmitting;

  const handleSubmit = async () => {
    if (!user || !signature) return;
    setIsSubmitting(true);
    try {
      const sig = await signPolicy({
        policy,
        userId: user.uid,
        userName: user.displayName,
        signatureData: signature.data,
        signatureMethod: signature.method,
      });
      onSigned(sig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to record signature';
      addToast({ type: 'error', title: 'Signature failed', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;
  const isAlreadySigned = existingStatus === 'signed';

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mb-4"
      >
        <ChevronLeft className="h-4 w-4" /> Back to Policy Center
      </button>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200">
          <p className="text-2xl font-bold text-gray-900">{policy.title}</p>
          <p className="text-xs text-gray-500 mt-1">
            v{policy.version} · effective {formatDate(policy.effectiveDate)}
          </p>
        </div>

        {/* Policy body — scroll-tracked */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="prose prose-sm max-w-none px-6 py-5 max-h-[420px] overflow-y-auto border-b border-gray-200 text-gray-700"
          dangerouslySetInnerHTML={{ __html: policy.content }}
        />

        {isAlreadySigned ? (
          <div className="px-6 py-5 bg-green-50/40 flex items-center gap-3 text-sm text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            You have already signed this version of the policy.
          </div>
        ) : (
          <div className="px-6 py-5 bg-gray-50/40">
            {/* Read gate indicator */}
            {!readGateOpen && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                Please read the policy in full. The signature area will activate after you scroll to the bottom or after {MIN_READ_SECONDS} seconds. ({readSeconds}s elapsed)
              </div>
            )}

            <div className={cn(!readGateOpen && 'opacity-50 pointer-events-none')}>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 inline-flex items-center gap-2">
                <FileSignature className="h-4 w-4" /> Your signature
              </p>

              <SignatureCapture
                signerName={user.displayName}
                onChange={setSignature}
                disabled={!readGateOpen}
              />

              <label className="flex items-start gap-2 mt-4 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={e => setAcknowledged(e.target.checked)}
                  disabled={!readGateOpen}
                  className="mt-0.5"
                />
                <span>I have read and understand this policy in its entirety.</span>
              </label>

              <div className="flex justify-end gap-2 mt-5">
                <Button variant="ghost" onClick={onBack}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                  Sign policy
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
