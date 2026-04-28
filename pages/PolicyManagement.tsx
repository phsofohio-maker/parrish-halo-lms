/**
 * Policy Management (Admin)
 *
 * Lists all policies, lets admins create new ones, edit existing ones
 * (which forks a new version when signatures exist), and view per-policy
 * signature status with a "send reminder" action for unsigned staff.
 *
 * @module pages/PolicyManagement
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ScrollText, Plus, Loader2, AlertCircle, ShieldAlert, RefreshCw,
  CheckCircle2, XCircle, Edit3, Mail, X, Save, ChevronRight,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { RichTextEditor } from '../components/ui/RichTextEditor';
import { cn, formatDate } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { usePageLoadTracking } from '../hooks/usePageLoadTracking';
import {
  PolicyDocument, PolicySignature, User, UserRoleType,
} from '../functions/src/types';
import {
  getAllPolicies, createPolicy, updatePolicy, getSignaturesForPolicy, sendPolicyReminder,
} from '../services/policyService';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';

const ROLE_OPTIONS: UserRoleType[] = ['staff', 'instructor', 'content_author', 'admin'];

interface EditorState {
  policyId?: string;
  title: string;
  content: string;
  version: string;
  effectiveDate: string;
  assignedRoles: UserRoleType[];
}

const blankEditor = (): EditorState => ({
  title: '',
  content: '',
  version: '1.0',
  effectiveDate: new Date().toISOString().slice(0, 10),
  assignedRoles: ['staff'],
});

export const PolicyManagement: React.FC = () => {
  usePageLoadTracking('policy_management');
  const { user, hasRole } = useAuth();
  const { addToast } = useToast();

  const [policies, setPolicies] = useState<PolicyDocument[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [signaturesByPolicy, setSignaturesByPolicy] = useState<Record<string, PolicySignature[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reminderUserId, setReminderUserId] = useState<string | null>(null);

  const isAdmin = hasRole(['admin']);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allPolicies, usersSnap] = await Promise.all([
        getAllPolicies(),
        getDocs(query(collection(db, 'users'), orderBy('displayName'))),
      ]);
      setPolicies(allPolicies);
      const usersList: User[] = usersSnap.docs.map(d => ({
        uid: d.data().uid || d.id,
        displayName: d.data().displayName || 'Unknown',
        email: d.data().email || '',
        role: d.data().role || 'staff',
        department: d.data().department,
        jobTitle: d.data().jobTitle,
      }));
      setUsers(usersList);

      // Fetch signatures for each non-archived policy in parallel.
      const sigEntries = await Promise.all(
        allPolicies.filter(p => !p.archived).map(async p =>
          [p.id, await getSignaturesForPolicy(p.id)] as const
        )
      );
      setSignaturesByPolicy(Object.fromEntries(sigEntries));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load policies';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  const selectedPolicy = useMemo(
    () => policies.find(p => p.id === selectedPolicyId) || null,
    [policies, selectedPolicyId]
  );

  const requiredUsersFor = useCallback((policy: PolicyDocument): User[] => {
    return users.filter(u => policy.assignedRoles.includes(u.role));
  }, [users]);

  const startCreate = () => {
    setSelectedPolicyId(null);
    setEditor(blankEditor());
  };

  const startEdit = (policy: PolicyDocument) => {
    setSelectedPolicyId(policy.id);
    setEditor({
      policyId: policy.id,
      title: policy.title,
      content: policy.content,
      version: policy.version,
      effectiveDate: policy.effectiveDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      assignedRoles: policy.assignedRoles,
    });
  };

  const closeEditor = () => setEditor(null);

  const handleSave = async () => {
    if (!editor || !user) return;
    if (!editor.title.trim()) {
      addToast({ type: 'error', title: 'Title required' });
      return;
    }
    if (!editor.content.trim() || editor.content === '<p></p>') {
      addToast({ type: 'error', title: 'Policy body required' });
      return;
    }
    if (editor.assignedRoles.length === 0) {
      addToast({ type: 'error', title: 'Assign at least one role' });
      return;
    }

    setIsSaving(true);
    try {
      if (editor.policyId) {
        await updatePolicy({
          policyId: editor.policyId,
          title: editor.title.trim(),
          content: editor.content,
          version: editor.version.trim(),
          effectiveDate: editor.effectiveDate,
          assignedRoles: editor.assignedRoles,
          actorId: user.uid,
          actorName: user.displayName,
        });
        addToast({ type: 'success', title: 'Policy updated' });
      } else {
        await createPolicy({
          title: editor.title.trim(),
          content: editor.content,
          version: editor.version.trim(),
          effectiveDate: editor.effectiveDate,
          assignedRoles: editor.assignedRoles,
          actorId: user.uid,
          actorName: user.displayName,
        });
        addToast({ type: 'success', title: 'Policy created' });
      }
      closeEditor();
      await fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save policy';
      addToast({ type: 'error', title: 'Save failed', message: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendReminder = async (policy: PolicyDocument, target: User) => {
    if (!user) return;
    setReminderUserId(target.uid);
    try {
      await sendPolicyReminder({
        policy,
        recipientEmail: target.email,
        recipientName: target.displayName,
        actorId: user.uid,
        actorName: user.displayName,
      });
      addToast({ type: 'success', title: 'Reminder sent', message: target.email });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send reminder';
      addToast({ type: 'error', title: 'Reminder failed', message: msg });
    } finally {
      setReminderUserId(null);
    }
  };

  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-amber-500" />
          <p className="text-sm font-medium text-amber-900">
            Policy Management is restricted to administrators.
          </p>
        </div>
      </div>
    );
  }

  const visiblePolicies = policies.filter(p => !p.archived);
  const archivedCount = policies.length - visiblePolicies.length;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ScrollText className="h-7 w-7 text-primary-600" />
            Policy Management
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Manage policies requiring signature acknowledgment.
            {archivedCount > 0 && (
              <span className="ml-2 text-xs text-gray-400">· {archivedCount} archived prior version(s)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading} className="gap-2">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={startCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New Policy
          </Button>
        </div>
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
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Policy list */}
          <div className="lg:col-span-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Active Policies</p>
            </div>
            {visiblePolicies.length === 0 ? (
              <p className="text-sm italic text-gray-400 text-center py-12">
                No policies yet. Create one to begin.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visiblePolicies.map(p => {
                  const sigs = signaturesByPolicy[p.id] || [];
                  const required = requiredUsersFor(p);
                  const signedCount = sigs.filter(s => s.policyVersion === p.version).length;
                  const isSelected = selectedPolicyId === p.id && !editor;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => { setSelectedPolicyId(p.id); setEditor(null); }}
                        className={cn(
                          'w-full text-left p-4 transition-colors flex items-center gap-3',
                          isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 truncate">{p.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            v{p.version} · {p.assignedRoles.join(', ')}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-1">
                            {signedCount}/{required.length} signed
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail / editor */}
          <div className="lg:col-span-2">
            {editor ? (
              <PolicyEditor
                state={editor}
                onChange={setEditor}
                onCancel={closeEditor}
                onSave={handleSave}
                isSaving={isSaving}
                isExisting={!!editor.policyId}
              />
            ) : selectedPolicy ? (
              <PolicyDetail
                policy={selectedPolicy}
                requiredUsers={requiredUsersFor(selectedPolicy)}
                signatures={signaturesByPolicy[selectedPolicy.id] || []}
                onEdit={() => startEdit(selectedPolicy)}
                onSendReminder={(targetUser) => handleSendReminder(selectedPolicy, targetUser)}
                reminderUserId={reminderUserId}
              />
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400 italic">
                Select a policy on the left, or create a new one.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// Sub-components
// ============================================

interface PolicyEditorProps {
  state: EditorState;
  onChange: (state: EditorState) => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
  isExisting: boolean;
}

const PolicyEditor: React.FC<PolicyEditorProps> = ({
  state, onChange, onCancel, onSave, isSaving, isExisting,
}) => {
  const toggleRole = (role: UserRoleType) => {
    const next = state.assignedRoles.includes(role)
      ? state.assignedRoles.filter(r => r !== role)
      : [...state.assignedRoles, role];
    onChange({ ...state, assignedRoles: next });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-bold text-gray-900">
          {isExisting ? 'Edit Policy' : 'New Policy'}
        </p>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-1">Title</label>
          <input
            type="text"
            value={state.title}
            onChange={e => onChange({ ...state, title: e.target.value })}
            placeholder="HIPAA Acknowledgment"
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-1">Version</label>
            <input
              type="text"
              value={state.version}
              onChange={e => onChange({ ...state, version: e.target.value })}
              placeholder="1.0"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-1">Effective date</label>
            <input
              type="date"
              value={state.effectiveDate}
              onChange={e => onChange({ ...state, effectiveDate: e.target.value })}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-2">Assigned roles</label>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map(role => (
              <label key={role} className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 border rounded-full text-sm cursor-pointer transition-colors',
                state.assignedRoles.includes(role)
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              )}>
                <input
                  type="checkbox"
                  checked={state.assignedRoles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="hidden"
                />
                <span className="capitalize">{role.replace('_', ' ')}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-1">Policy body</label>
          <RichTextEditor
            content={state.content}
            onChange={(html) => onChange({ ...state, content: html })}
            placeholder="Paste or write the policy text. Staff must read this in full before signing."
            minHeight="240px"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>Cancel</Button>
          <Button onClick={onSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isExisting ? 'Save changes' : 'Create policy'}
          </Button>
        </div>
        {isExisting && (
          <p className="text-[11px] text-gray-400 text-right">
            Editing a policy with existing signatures will create a new version and archive the prior one.
          </p>
        )}
      </div>
    </div>
  );
};

interface PolicyDetailProps {
  policy: PolicyDocument;
  requiredUsers: User[];
  signatures: PolicySignature[];
  onEdit: () => void;
  onSendReminder: (user: User) => void;
  reminderUserId: string | null;
}

const PolicyDetail: React.FC<PolicyDetailProps> = ({
  policy, requiredUsers, signatures, onEdit, onSendReminder, reminderUserId,
}) => {
  const sigByUser = new Map<string, PolicySignature>();
  signatures
    .filter(s => s.policyVersion === policy.version)
    .forEach(s => sigByUser.set(s.userId, s));

  const signed = requiredUsers.filter(u => sigByUser.has(u.uid));
  const unsigned = requiredUsers.filter(u => !sigByUser.has(u.uid));
  const completionPct = requiredUsers.length
    ? Math.round((signed.length / requiredUsers.length) * 100)
    : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-gray-900 text-lg">{policy.title}</p>
          <p className="text-xs text-gray-500 mt-1">
            v{policy.version} · effective {formatDate(policy.effectiveDate)} ·
            assigned to {policy.assignedRoles.join(', ')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} className="gap-2 shrink-0">
          <Edit3 className="h-4 w-4" /> Edit
        </Button>
      </div>

      {/* Compliance bar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/40">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Compliance: {signed.length}/{requiredUsers.length} signed ({completionPct}%)
          </p>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all',
              completionPct === 100 ? 'bg-green-500' :
              completionPct >= 50 ? 'bg-primary-500' : 'bg-amber-500'
            )}
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {/* Policy preview */}
      <details className="border-b border-gray-200">
        <summary className="px-5 py-3 cursor-pointer text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50">
          Policy text
        </summary>
        <div
          className="px-5 py-4 prose prose-sm max-w-none text-gray-700"
          dangerouslySetInnerHTML={{ __html: policy.content }}
        />
      </details>

      {/* Signature breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        <SignerList
          title="Signed"
          users={signed}
          icon={CheckCircle2}
          tone="green"
          getMeta={u => formatDate(sigByUser.get(u.uid)!.signedAt)}
        />
        <UnsignedList
          users={unsigned}
          onSendReminder={onSendReminder}
          reminderUserId={reminderUserId}
        />
      </div>
    </div>
  );
};

const SignerList: React.FC<{
  title: string;
  users: User[];
  icon: React.ComponentType<{ className?: string }>;
  tone: 'green' | 'red';
  getMeta: (u: User) => string;
}> = ({ title, users, icon: Icon, tone, getMeta }) => (
  <div className="border-r border-gray-200">
    <div className={cn(
      'px-5 py-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-b border-gray-200',
      tone === 'green' ? 'text-green-700 bg-green-50/40' : 'text-red-700 bg-red-50/40'
    )}>
      <Icon className="h-4 w-4" /> {title} ({users.length})
    </div>
    {users.length === 0 ? (
      <p className="text-xs italic text-gray-400 px-5 py-4">None</p>
    ) : (
      <ul className="divide-y divide-gray-100">
        {users.map(u => (
          <li key={u.uid} className="px-5 py-2.5 flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold text-gray-900">{u.displayName}</p>
              <p className="text-[11px] text-gray-400">{u.email}</p>
            </div>
            <p className="text-[11px] text-gray-500">{getMeta(u)}</p>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const UnsignedList: React.FC<{
  users: User[];
  onSendReminder: (user: User) => void;
  reminderUserId: string | null;
}> = ({ users, onSendReminder, reminderUserId }) => (
  <div>
    <div className="px-5 py-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-700 bg-red-50/40 border-b border-gray-200">
      <XCircle className="h-4 w-4" /> Unsigned ({users.length})
    </div>
    {users.length === 0 ? (
      <p className="text-xs italic text-gray-400 px-5 py-4">All required staff have signed.</p>
    ) : (
      <ul className="divide-y divide-gray-100">
        {users.map(u => (
          <li key={u.uid} className="px-5 py-2.5 flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold text-gray-900">{u.displayName}</p>
              <p className="text-[11px] text-gray-400">{u.email}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => onSendReminder(u)}
              disabled={reminderUserId === u.uid || !u.email}
            >
              {reminderUserId === u.uid
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Mail className="h-3.5 w-3.5" />}
              Remind
            </Button>
          </li>
        ))}
      </ul>
    )}
  </div>
);
