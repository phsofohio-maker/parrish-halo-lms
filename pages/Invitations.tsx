import React, { useState } from 'react';
import { UserPlus, Mail, Shield, Send, RefreshCw, X, Upload, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { UserRoleType, Invitation } from '../functions/src/types';
import { generateId, formatDate, cn } from '../utils';

export const Invitations: React.FC = () => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRoleType>('staff');
  const [department, setDepartment] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Mock data for invitations
  const [invitations, setInvitations] = useState<Invitation[]>([
    { id: 'inv_1', email: 'dr.thompson@harmony.health', role: 'instructor', department: 'Clinical Care', sentAt: new Date().toISOString(), status: 'pending' },
    { id: 'inv_2', email: 'm.rodriguez@harmony.health', role: 'staff', department: 'Palliative Care', sentAt: new Date(Date.now() - 86400000).toISOString(), status: 'pending' },
    { id: 'inv_3', email: 'old.invite@expired.com', role: 'staff', department: 'Admin', sentAt: new Date(Date.now() - 864000000).toISOString(), status: 'expired' },
  ]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSending(true);
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const newInvite: Invitation = {
      id: generateId(),
      email,
      role,
      department,
      sentAt: new Date().toISOString(),
      status: 'pending'
    };

    setInvitations([newInvite, ...invitations]);
    setEmail('');
    setDepartment('');
    setIsSending(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleResend = (id: string) => {
    setInvitations(prev => prev.map(inv => 
      inv.id === id ? { ...inv, sentAt: new Date().toISOString(), status: 'pending' } : inv
    ));
  };

  const handleCancel = (id: string) => {
    setInvitations(prev => prev.filter(inv => inv.id !== id));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserPlus className="h-6 w-6 text-primary-600" />
          Staff Onboarding
        </h1>
        <p className="text-gray-500 mt-1">Invite your clinical team members to the Harmony training portal.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Invite Form */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm relative overflow-hidden">
            {showSuccess && (
                <div className="absolute inset-0 bg-green-600 flex flex-col items-center justify-center text-white z-10 animate-in fade-in duration-300">
                    <CheckCircle2 className="h-12 w-12 mb-2" />
                    <p className="font-bold">Invitation Sent!</p>
                </div>
            )}
            
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Send className="h-4 w-4 text-primary-500" />
                Send New Invite
            </h2>
            
            <form onSubmit={handleSendInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Email Address</label>
                <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-300" />
                    <input 
                        type="email" 
                        required
                        placeholder="e.g. nurse@harmony.health"
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Assign Role</label>
                <select 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRoleType)}
                >
                    <option value="staff">Staff Member</option>
                    <option value="instructor">Instructor / Preceptor</option>
                    <option value="content_author">Content Author</option>
                    <option value="admin">Administrator</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Department (Optional)</label>
                <input 
                    type="text" 
                    placeholder="e.g. Hospice Unit 4"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                />
              </div>

              <Button className="w-full h-11" type="submit" isLoading={isSending}>
                Dispatch Invitation
              </Button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs">
             <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary-100 rounded-lg">
                    <Upload className="h-5 w-5 text-primary-700" />
                </div>
                <h3 className="font-bold text-gray-900">Bulk Onboarding</h3>
             </div>
             <p className="text-sm text-gray-600 leading-relaxed mb-6">
                Uploading a CSV of clinical staff allows for mass enrollment and automated department assignment.
             </p>
             <Button variant="outline" className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 border-dashed">
                Upload CSV File
             </Button>
          </div>
        </div>

        {/* Pending Invites List */}
        <div className="lg:col-span-2">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Pending & Expired Invites</h2>
                    <span className="text-[10px] font-bold text-gray-400">{invitations.length} Total</span>
                </div>

                <div className="divide-y divide-gray-100">
                    {invitations.length === 0 ? (
                        <div className="p-12 text-center text-gray-400 italic">No pending invitations.</div>
                    ) : (
                        invitations.map(invite => (
                            <div key={invite.id} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "h-10 w-10 rounded-full flex items-center justify-center",
                                        invite.status === 'expired' ? "bg-red-50 text-red-500" : "bg-primary-50 text-primary-600"
                                    )}>
                                        <Mail className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-gray-900 text-sm">{invite.email}</p>
                                            <span className={cn(
                                                "text-[8px] font-black uppercase px-1.5 py-0.5 rounded border",
                                                invite.status === 'expired' ? "bg-red-50 text-red-600 border-red-100" : "bg-primary-50 text-primary-600 border-primary-100"
                                            )}>
                                                {invite.status}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-0.5">
                                            <span className="font-bold text-primary-700 capitalize">{invite.role}</span>
                                            {invite.department && <span>• {invite.department}</span>}
                                            <span>• Sent {formatDate(invite.sentAt)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => handleResend(invite.id)}
                                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-all"
                                        title="Resend Invitation"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleCancel(invite.id)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                                        title="Cancel Invite"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            
            <div className="mt-6 bg-white border border-gray-200 border-l-4 border-l-info-600 rounded-lg p-4 flex gap-4 shadow-xs">
                <Shield className="h-6 w-6 text-gray-500 shrink-0" />
                <div>
                    <h4 className="text-sm font-bold text-gray-900">Compliance Warning</h4>
                    <p className="text-xs text-gray-600 leading-relaxed mt-1">
                        Invitations expire after 72 hours. To maintain organizational security, ensure staff complete their profile setup immediately upon receipt of the clinical onboarding email.
                    </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};