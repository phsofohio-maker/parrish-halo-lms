/**
 * Authentication Context
 *
 * Provides auth state, role, and operations to the entire app.
 * Wrap your App component with <AuthProvider> and consume via useAuth().
 *
 * KEY DESIGN DECISION:
 * The `role` exposed here comes from Firebase Auth JWT custom claims,
 * NOT the Firestore user document. This is intentional — Firestore
 * security rules evaluate against token claims, so the client query
 * logic must use the same source of truth to build compliant queries.
 *
 * @module contexts/AuthContext
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, UserRoleType } from '../functions/src/types';
import {
  loginWithEmail,
  logout as authLogout,
  resetPassword as authResetPassword,
  subscribeToAuthState,
  getUserProfile,
  AuthServiceError,
} from '../services/authService';
import { auth } from '../services/firebase';

// Auth state shape
interface AuthState {
  user: User | null;
  role: UserRoleType | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

// Context value shape
interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
  hasRole: (roles: UserRoleType | UserRoleType[]) => boolean;
}

// Initial state
const initialState: AuthState = {
  user: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
};

// Create context
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Provider component
interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, setState] = useState<AuthState>(initialState);

  // Subscribe to Firebase auth state on mount
  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // 1. Force-refresh token to get latest custom claims
          const tokenResult = await firebaseUser.getIdTokenResult(true);
          const claimsRole = (tokenResult.claims.role as UserRoleType) || null;

          // 2. Fetch Firestore profile for display data
          const profile = await getUserProfile(firebaseUser.uid);

          if (profile) {
            // Warn if claims and profile are out of sync (diagnostic only)
            if (claimsRole && profile.role !== claimsRole) {
              console.warn(
                `Role mismatch: token claims="${claimsRole}", Firestore="${profile.role}". ` +
                `Security rules use token claims. Run setUserRole to sync.`
              );
            }

            setState({
              user: profile,
              role: claimsRole || profile.role, // Claims are authoritative; fallback to profile
              isLoading: false,
              isAuthenticated: true,
              error: null,
            });
          } else {
            // Auth exists but no profile
            setState({
              user: null,
              role: null,
              isLoading: false,
              isAuthenticated: false,
              error: 'User profile not found. Contact administrator.',
            });
          }
        } catch (err) {
          setState({
            user: null,
            role: null,
            isLoading: false,
            isAuthenticated: false,
            error: 'Failed to load user profile.',
          });
        }
      } else {
        // No user signed in
        setState({
          ...initialState,
          isLoading: false,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Login handler
  const login = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const user = await loginWithEmail(email, password);

      // Get claims from the now-signed-in user
      const currentUser = auth.currentUser;
      let claimsRole: UserRoleType | null = null;

      if (currentUser) {
        const tokenResult = await currentUser.getIdTokenResult(true);
        claimsRole = (tokenResult.claims.role as UserRoleType) || null;
      }

      setState({
        user,
        role: claimsRole || user.role,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });
    } catch (err) {
      const message = err instanceof AuthServiceError
        ? err.message
        : 'An unexpected error occurred.';

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
      throw err;
    }
  }, []);

  // Logout handler
  const logout = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      await authLogout();
      // State will be updated by onAuthStateChanged listener
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to sign out.',
      }));
    }
  }, []);

  // Reset password handler
  const resetPassword = useCallback(async (email: string) => {
    await authResetPassword(email);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Role check helper — uses the claims-derived role
  const hasRole = useCallback((roles: UserRoleType | UserRoleType[]) => {
    if (!state.role) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(state.role);
  }, [state.role]);

  // Memoize context value
  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    login,
    logout,
    resetPassword,
    clearError,
    hasRole,
  }), [state, login, logout, resetPassword, clearError, hasRole]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook for consuming auth context
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

// Higher-order component for role-based access
export const withAuth = <P extends object>(
  Component: React.ComponentType<P>,
  allowedRoles?: UserRoleType[]
): React.FC<P> => {
  return function AuthenticatedComponent(props: P) {
    const { isAuthenticated, hasRole, isLoading } = useAuth();

    if (isLoading) return null;
    if (!isAuthenticated) return null;
    if (allowedRoles && !hasRole(allowedRoles)) return null;

    return <Component {...props} />;
  };
};