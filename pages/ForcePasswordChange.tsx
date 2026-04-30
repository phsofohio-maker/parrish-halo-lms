/**
 * Force Password Change Interstitial
 *
 * Shown after first login for accounts created via the direct-creation
 * fallback path. Blocks every other route until the user replaces the
 * admin-issued temporary password with one of their own choosing.
 *
 * Wired in App.tsx ahead of the sidebar layout — route guarded by
 * AuthContext.requiresPasswordChange.
 *
 * @module pages/ForcePasswordChange
 */

import React, { useState } from 'react';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';
import { auth, db } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';

export const ForcePasswordChange: React.FC = () => {
  const { user, logout, clearRequiresPasswordChange } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const fbUser = auth.currentUser;
    if (!fbUser || !user) {
      setError('Session expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Update Firebase Auth password
      await updatePassword(fbUser, newPassword);

      // 2. Clear the Firestore flag so subsequent logins skip this page
      await updateDoc(doc(db, 'users', user.uid), {
        requiresPasswordChange: false,
      });

      // 3. Server-side audit log (tamper-proof)
      try {
        const functions = getFunctions();
        const callable = httpsCallable(functions, 'recordForcedPasswordChange');
        await callable({});
      } catch {
        // Audit failure must not block the user from completing onboarding.
      }

      // 4. Release the route guard so the user lands on the Dashboard
      clearRequiresPasswordChange();
    } catch (err: any) {
      if (err?.code === 'auth/requires-recent-login') {
        setError('For security, please sign out and sign back in to change your password.');
      } else if (err?.code === 'auth/weak-password') {
        setError('That password is too weak. Choose a stronger one.');
      } else {
        setError(err?.message || 'Failed to update password. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-4">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Welcome to Parrish HALO</h1>
          <p className="text-sm text-gray-500 mt-2">
            Please set a permanent password to continue. Your temporary password will no longer be valid.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="fpc-new">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                id="fpc-new"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting}
                autoFocus
                className="w-full pl-9 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50"
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="fpc-confirm">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                id="fpc-confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50"
                placeholder="Re-enter the new password"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={submitting} disabled={submitting}>
            Set Password & Continue
          </Button>

          <button
            type="button"
            onClick={logout}
            disabled={submitting}
            className="w-full text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
};
