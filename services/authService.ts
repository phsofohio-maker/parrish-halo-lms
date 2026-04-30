/**
 * Authentication Service
 * 
 * Handles all Firebase Auth operations. UI components should use
 * the AuthContext, not this service directly.
 * 
 * @module services/authService
 */

import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged,
    User as FirebaseUser,
    AuthError,
  } from 'firebase/auth';
  import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
  import { auth, db } from './firebase';
  import { User, UserRoleType } from '../functions/src/types';
  
  // Firestore collection for user profiles
  const USERS_COLLECTION = 'users';
  
  /**
   * Authentication error with context
   */
  export class AuthServiceError extends Error {
    constructor(
      message: string,
      public readonly code: string,
      public readonly originalError?: AuthError
    ) {
      super(message);
      this.name = 'AuthServiceError';
    }
  }
  
  /**
   * Maps Firebase Auth errors to user-friendly messages
   */
  const mapAuthError = (error: AuthError): AuthServiceError => {
    const errorMap: Record<string, string> = {
      'auth/invalid-email': 'Invalid email address format.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/network-request-failed': 'Network error. Check your connection.',
      'auth/too-many-requests': 'Too many attempts. Try again later.',
      'auth/invalid-credential': 'Invalid email or password.',
    };
  
    const message = errorMap[error.code] || `Authentication failed: ${error.message}`;
    return new AuthServiceError(message, error.code, error);
  };
  
  /**
   * Fetches user profile from Firestore
   */
  export const getUserProfile = async (uid: string): Promise<User | null> => {
    try {
      const userDoc = await getDoc(doc(db, USERS_COLLECTION, uid));
      
      if (!userDoc.exists()) {
        console.warn(`User profile not found for UID: ${uid}`);
        return null;
      }
      
      const data = userDoc.data();
      return {
        uid: userDoc.id,
        displayName: data.displayName || 'Unknown User',
        email: data.email || '',
        role: data.role || 'staff',
        department: data.department,
        jobTitle: data.jobTitle,
        licenseNumber: data.licenseNumber,
        licenseExpiry: data.licenseExpiry,
        requiresPasswordChange: data.requiresPasswordChange === true,
      } as User;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw new AuthServiceError(
        'Failed to load user profile.',
        'firestore/read-failed'
      );
    }
  };
  
  /**
   * Creates or updates user profile in Firestore
   */
  export const upsertUserProfile = async (
    uid: string,
    data: Partial<Omit<User, 'uid'>>
  ): Promise<void> => {
    try {
      const userRef = doc(db, USERS_COLLECTION, uid);
      await setDoc(userRef, {
        ...data,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw new AuthServiceError(
        'Failed to update user profile.',
        'firestore/write-failed'
      );
    }
  };
  
  /**
   * Signs in user with email and password
   */
  export const loginWithEmail = async (
    email: string,
    password: string
  ): Promise<User> => {
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      
      // Fetch full profile from Firestore
      const profile = await getUserProfile(credential.user.uid);
      
      if (!profile) {
        // User exists in Auth but not Firestore—create minimal profile
        const newProfile: User = {
          uid: credential.user.uid,
          email: credential.user.email || email,
          displayName: credential.user.displayName || email.split('@')[0],
          role: 'staff', // Default role for new users
        };
        await upsertUserProfile(credential.user.uid, newProfile);
        return newProfile;
      }
      
      return profile;
    } catch (error) {
      if ((error as AuthError).code) {
        throw mapAuthError(error as AuthError);
      }
      throw error;
    }
  };
  
  /**
   * Creates a new user account
   */
  export const registerWithEmail = async (
    email: string,
    password: string,
    displayName: string,
    role: UserRoleType = 'staff'
  ): Promise<User> => {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      
      const newUser: User = {
        uid: credential.user.uid,
        email,
        displayName,
        role,
      };
      
      // Create Firestore profile
      await upsertUserProfile(credential.user.uid, {
        ...newUser,
        createdAt: serverTimestamp(),
      } as any);
      
      return newUser;
    } catch (error) {
      if ((error as AuthError).code) {
        throw mapAuthError(error as AuthError);
      }
      throw error;
    }
  };
  
  /**
   * Sends a password reset email via Firebase Auth
   */
  export const resetPassword = async (email: string): Promise<void> => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      if ((error as AuthError).code) {
        throw mapAuthError(error as AuthError);
      }
      throw error;
    }
  };

  /**
   * Signs out the current user
   */
  export const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
    } catch (error) {
      throw new AuthServiceError('Failed to sign out.', 'auth/signout-failed');
    }
  };
  
  /**
   * Subscribes to auth state changes
   * Returns unsubscribe function
   */
  export const subscribeToAuthState = (
    callback: (user: FirebaseUser | null) => void
  ): (() => void) => {
    return onAuthStateChanged(auth, callback);
  };