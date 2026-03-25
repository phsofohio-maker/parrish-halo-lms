/**
 * Login Page
 *
 * Handles user authentication via Firebase Auth.
 * Provides email/password login with error handling.
 *
 * @module pages/Login
 */

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '../utils';

export const Login: React.FC = () => {
  const { login, resetPassword, error, clearError, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setLocalError('Email is required');
      return;
    }
    setResetLoading(true);
    setLocalError(null);
    try {
      await resetPassword(resetEmail.trim());
      setResetSent(true);
    } catch {
      // Always show success message to avoid leaking whether email exists
      setResetSent(true);
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    // Basic validation
    if (!email.trim()) {
      setLocalError('Email is required');
      return;
    }
    if (!password) {
      setLocalError('Password is required');
      return;
    }

    try {
      await login(email.trim(), password);
    } catch {
      // Error is handled by AuthContext
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-lg shadow-xs border border-gray-200 overflow-hidden">
        {/* Logo & Header */}
        <div className="pt-10 pb-6 px-8 text-center">
          <div className="flex items-center justify-center mb-6">
            <img
              src="/images/HHCA_LMS_LogoPNG_.png"
              alt="Harmony Health Care Assistant"
              className="max-w-[200px] w-auto"
            />
          </div>
          <p className="text-gray-500 text-sm">Secure Clinical Training Platform</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-6">
          {/* Error Alert */}
          {displayError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-medium text-red-800">{displayError}</p>
              </div>
            </div>
          )}

          {/* Email Field */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-500" strokeWidth={1.75} />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={cn(
                  "w-full pl-10 pr-4 py-2.5 border rounded-md text-sm transition-colors",
                  "focus:outline-none focus:border-primary-600 focus:shadow-[0_0_0_3px_rgba(15,123,79,0.12)]",
                  "bg-white text-gray-700 placeholder:text-gray-400",
                  displayError ? "border-red-300" : "border-gray-300"
                )}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-500" strokeWidth={1.75} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(
                  "w-full pl-10 pr-12 py-2.5 border rounded-md text-sm transition-colors",
                  "focus:outline-none focus:border-primary-600 focus:shadow-[0_0_0_3px_rgba(15,123,79,0.12)]",
                  "bg-white text-gray-700 placeholder:text-gray-400",
                  displayError ? "border-red-300" : "border-gray-300"
                )}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" strokeWidth={1.75} /> : <Eye className="h-5 w-5" strokeWidth={1.75} />}
              </button>
            </div>
          </div>

          {/* Forgot Password Link */}
          {!showForgotPassword && (
            <div className="text-right -mt-2">
              <button
                type="button"
                onClick={() => { setShowForgotPassword(true); setResetEmail(email); setResetSent(false); setLocalError(null); clearError(); }}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Forgot Password?
              </button>
            </div>
          )}

          {/* Forgot Password Inline Form */}
          {showForgotPassword && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
              {resetSent ? (
                <div>
                  <p className="text-sm text-gray-700 font-medium">Check your email</p>
                  <p className="text-sm text-gray-500 mt-1">
                    If an account exists with that email, a password reset link has been sent.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(false); setResetSent(false); }}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium mt-2"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">Reset your password</p>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-500" strokeWidth={1.75} />
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-primary-600 focus:shadow-[0_0_0_3px_rgba(15,123,79,0.12)]"
                      placeholder="Enter your email"
                      disabled={resetLoading}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleResetPassword}
                      className="text-sm"
                      isLoading={resetLoading}
                      disabled={resetLoading}
                    >
                      Send Reset Link
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(false); setLocalError(null); }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full h-12 text-base"
            isLoading={isLoading}
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        {/* Footer */}
        <div className="bg-gray-50 px-8 py-4 text-center border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Proprietary Software for Parrish Health Systems
          </p>
        </div>
      </div>
    </div>
  );
};
