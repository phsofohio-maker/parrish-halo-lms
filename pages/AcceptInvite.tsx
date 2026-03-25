/**
 * Accept Invitation Page
 *
 * Handles the full account setup flow for invited staff:
 * 1. Validates the invitation token via Cloud Function
 * 2. Displays a form with pre-filled email, name, and password fields
 * 3. Creates the account via the createInvitedUser Cloud Function
 * 4. Redirects to login with a success message
 *
 * This page is accessible WITHOUT authentication.
 *
 * @module pages/AcceptInvite
 */
import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';
import { app } from '../services/firebase';
import {
  Shield,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  UserPlus,
} from 'lucide-react';
import { Button } from '../components/ui/Button';

const functions = getFunctions(app);

interface AcceptInviteProps {
  token: string;
  onComplete: () => void;
}

type PageState = 'loading' | 'valid' | 'invalid' | 'success' | 'error';

export const AcceptInvite: React.FC<AcceptInviteProps> = ({ token, onComplete }) => {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  // Invitation data from token validation
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');

  // Form fields
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        const validateFn = httpsCallable(functions, 'validateInvitationToken');
        const result = await validateFn({ token });
        const data = result.data as any;

        if (data.valid) {
          setEmail(data.email);
          setRole(data.role);
          setDepartment(data.department || '');
          setPageState('valid');
        } else {
          setPageState('invalid');
          switch (data.reason) {
            case 'expired':
              setErrorMessage('This invitation has expired. Please contact your administrator for a new one.');
              break;
            case 'accepted':
              setErrorMessage('This invitation has already been used. If you already have an account, please log in.');
              break;
            case 'cancelled':
              setErrorMessage('This invitation has been cancelled by an administrator.');
              break;
            default:
              setErrorMessage('This invitation is no longer valid.');
          }
        }
      } catch (err: any) {
        setPageState('invalid');
        setErrorMessage(err.message || 'Unable to validate invitation. The link may be invalid.');
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validation
    if (displayName.trim().length < 2) {
      setFormError('Please enter your full name.');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const createUserFn = httpsCallable(functions, 'createInvitedUser');
      await createUserFn({
        token,
        displayName: displayName.trim(),
        password,
      });

      setPageState('success');
    } catch (err: any) {
      const message = err.message || 'Failed to create account. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Loading State ----
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-primary-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-500 font-medium">Validating your invitation...</p>
        </div>
      </div>
    );
  }

  // ---- Invalid / Expired State ----
  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
          <p className="text-gray-600 text-sm leading-relaxed mb-6">{errorMessage}</p>
          <Button onClick={onComplete}>Go to Login</Button>
        </div>
      </div>
    );
  }

  // ---- Success State ----
  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Account Created!</h1>
          <p className="text-gray-600 text-sm leading-relaxed mb-2">
            Your account has been set up successfully as <strong>{role}</strong>.
          </p>
          <p className="text-gray-500 text-sm mb-6">
            You can now log in with <strong>{email}</strong> and the password you just set.
          </p>
          <Button onClick={onComplete} className="w-full">
            Continue to Login
          </Button>
        </div>
      </div>
    );
  }

  // ---- Account Setup Form ----
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary-50 mb-4">
            <UserPlus className="h-7 w-7 text-primary-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Welcome to Harmony Health</h1>
          <p className="text-gray-500 text-sm mt-1">Complete your account setup to get started.</p>
        </div>

        {/* Role Badge */}
        <div className="bg-primary-50 border border-primary-100 rounded-lg p-3 mb-6 flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary-600 shrink-0" />
          <div>
            <p className="text-xs font-bold text-primary-800 uppercase tracking-wider">Assigned Role</p>
            <p className="text-sm font-medium text-primary-700 capitalize">{role}</p>
            {department && (
              <p className="text-xs text-primary-600">Department: {department}</p>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email (read-only) */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Full Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Maria Santos"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              placeholder="Re-enter your password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {/* Error Message */}
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{formError}</p>
            </div>
          )}

          {/* Submit */}
          <Button type="submit" className="w-full h-11" isLoading={isSubmitting}>
            Create Account
          </Button>
        </form>

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-400 mt-6">
          Proprietary Software for Parrish Health Systems
        </p>
      </div>
    </div>
  );
};
